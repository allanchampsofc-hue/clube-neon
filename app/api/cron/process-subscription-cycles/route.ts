import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { formatDate } from "@/lib/dates";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: notifConfig } = await supabase
    .from("system_config")
    .select("notify_credit_released, credit_released_message, notify_plan_ending, plan_ending_message")
    .limit(1)
    .single();

  const { data: dueSubscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, customer:customers(id, name, phone), plan:plans(plan_type)")
    .eq("status", "ATIVA")
    .lte("current_period_end", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ subscriptionId: string; ok: boolean; error?: string }> = [];
  let creditReleasedNotified = 0;
  let vouchersGenerated = 0;

  for (const subscription of (dueSubscriptions ?? []) as unknown as Array<{
    id: string;
    customer: { id: string; name: string; phone: string | null } | null;
    plan: { plan_type: string } | null;
  }>) {
    const { data: newCycle, error: rpcError } = await supabase
      .rpc("process_subscription_cycle_rollover", { p_subscription_id: subscription.id })
      .single();

    results.push({
      subscriptionId: subscription.id,
      ok: !rpcError,
      error: rpcError?.message,
    });

    // Só notifica no rollover mensal normal (Ramo 3): a RPC nunca produz
    // cycle_number 1 via rollover (o primeiro ciclo é criado na ativação),
    // então todo retorno aqui já é mês 2+ — a checagem abaixo é defensiva.
    const cycle = newCycle as { cycle_number: number; period_end: string; is_grace_period: boolean } | null;
    if (
      !rpcError &&
      cycle &&
      !cycle.is_grace_period &&
      cycle.cycle_number > 1 &&
      notifConfig?.notify_credit_released &&
      subscription.customer?.phone
    ) {
      const message = renderTemplate(notifConfig.credit_released_message, {
        nome: subscription.customer.name,
        data_fim_ciclo: formatDate(cycle.period_end),
      });
      try {
        await sendWhatsAppMessage(subscription.customer.phone, message);
        creditReleasedNotified += 1;
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_CREDIT_RELEASED",
          entity: "subscription",
          entity_id: subscription.id,
          after_state: { cycle_number: cycle.cycle_number },
        });
      } catch (whatsappError) {
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_SEND_FAILED",
          entity: "subscription",
          entity_id: subscription.id,
          after_state: {
            context: "credit_released",
            error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
          },
        });
      }
    }

    // Vouchers só nascem do rollover mensal normal — mesma condição do
    // aviso de crédito liberado acima.
    if (!rpcError && cycle && !cycle.is_grace_period && cycle.cycle_number > 1) {
      const { data: pizzaVoucher } = await supabase
        .rpc("generate_bimonthly_voucher", { p_subscription_id: subscription.id })
        .single();
      if (pizzaVoucher) {
        vouchersGenerated += 1;
        const voucher = pizzaVoucher as { code: string; valid_until: string };
        if (subscription.customer?.phone) {
          const message = `Seu voucher do mês chegou, ${subscription.customer.name}! 🍕\nCompre uma pizza de 8 fatias e leve outra de igual ou menor sabor. Código: ${voucher.code}. Válido por 30 dias. Use no salão da Neon.`;
          try {
            await sendWhatsAppMessage(subscription.customer.phone, message);
          } catch (whatsappError) {
            await supabase.from("audit_logs").insert({
              action: "WHATSAPP_SEND_FAILED",
              entity: "subscription",
              entity_id: subscription.id,
              after_state: {
                context: "voucher_pizza",
                error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
              },
            });
          }
        }
      }

      if (subscription.plan?.plan_type === "COMPLETO") {
        const { data: freteVoucher } = await supabase
          .rpc("generate_monthly_frete", { p_subscription_id: subscription.id })
          .single();
        if (freteVoucher) {
          vouchersGenerated += 1;
          const voucher = freteVoucher as { code: string; valid_until: string };
          if (subscription.customer?.phone) {
            const message = `Frete grátis garantido este mês, ${subscription.customer.name}! 🛵\nUse o cupom ${voucher.code} no seu pedido de entrega em Taubaté. Válido até ${formatDate(voucher.valid_until)}.`;
            try {
              await sendWhatsAppMessage(subscription.customer.phone, message);
            } catch (whatsappError) {
              await supabase.from("audit_logs").insert({
                action: "WHATSAPP_SEND_FAILED",
                entity: "subscription",
                entity_id: subscription.id,
                after_state: {
                  context: "voucher_frete",
                  error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
                },
              });
            }
          }
        }
      }
    }
  }

  const { data: cancelledCount, error: cancellationError } = await supabase.rpc(
    "process_scheduled_cancellations",
  );

  const { data: expiredVouchersCount, error: voucherExpireError } = await supabase.rpc(
    "expire_old_vouchers",
  );

  const { data: levelChangesData, error: levelError } = await supabase.rpc(
    "update_membership_levels",
  );

  const levelChanges = (levelChangesData ?? []) as Array<{
    customer_id: string;
    old_level: string;
    new_level: string;
    changed: boolean;
  }>;

  const risers = levelChanges.filter(
    (c) => c.changed && (c.new_level === "OURO" || c.new_level === "BLACK"),
  );

  let notified = 0;
  if (risers.length > 0) {
    const { data: config } = await supabase
      .from("system_config")
      .select("membership_ouro_message, membership_black_message")
      .limit(1)
      .single();

    for (const riser of risers) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, phone")
        .eq("id", riser.customer_id)
        .single();

      if (!customer?.phone) continue;

      const template =
        riser.new_level === "BLACK"
          ? config!.membership_black_message
          : config!.membership_ouro_message;
      const message = renderTemplate(template, { nome: customer.name });

      try {
        await sendWhatsAppMessage(customer.phone, message);
        notified += 1;
      } catch (whatsappError) {
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_SEND_FAILED",
          entity: "customer",
          entity_id: riser.customer_id,
          after_state: {
            context: "membership_level_up",
            error:
              whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
          },
        });
      }
    }
  }

  let planEndingNotified = 0;
  if (notifConfig?.notify_plan_ending) {
    const { data: endingSoon } = await supabase.rpc("get_subscriptions_needing_plan_ending_notice");

    for (const row of (endingSoon ?? []) as Array<{
      subscription_id: string;
      customer_id: string;
      customer_name: string;
      customer_phone: string | null;
      months_remaining: number;
      plan_end_date: string;
    }>) {
      if (!row.customer_phone) continue;

      const message = renderTemplate(notifConfig.plan_ending_message, {
        nome: row.customer_name,
        data_fim: formatDate(row.plan_end_date),
        meses_restantes: String(row.months_remaining),
      });

      try {
        await sendWhatsAppMessage(row.customer_phone, message);
        planEndingNotified += 1;
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_PLAN_ENDING_SOON",
          entity: "subscription",
          entity_id: row.subscription_id,
          after_state: { months_remaining: row.months_remaining },
        });
      } catch (whatsappError) {
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_SEND_FAILED",
          entity: "subscription",
          entity_id: row.subscription_id,
          after_state: {
            context: "plan_ending",
            error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
          },
        });
      }

      // Marca como avisado mesmo se o WhatsApp falhar — não queremos
      // reenviar todo dia só porque o Z-API estava fora do ar uma vez;
      // mesma filosofia de "falha no WhatsApp nunca trava/repete o fluxo".
      await supabase
        .from("subscriptions")
        .update({ plan_ending_notified_at: new Date().toISOString() })
        .eq("id", row.subscription_id);
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    creditReleasedNotified,
    vouchersGenerated,
    expiredVouchersCount: expiredVouchersCount ?? 0,
    voucherExpireError: voucherExpireError?.message,
    scheduledCancellationsProcessed: cancelledCount ?? 0,
    scheduledCancellationsError: cancellationError?.message,
    membershipLevelsError: levelError?.message,
    membershipChanges: levelChanges.filter((c) => c.changed).length,
    membershipNotified: notified,
    planEndingNotified,
  });
}

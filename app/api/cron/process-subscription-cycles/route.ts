import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: dueSubscriptions, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("status", "ATIVA")
    .lte("current_period_end", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ subscriptionId: string; ok: boolean; error?: string }> = [];

  for (const subscription of dueSubscriptions ?? []) {
    const { error: rpcError } = await supabase.rpc(
      "process_subscription_cycle_rollover",
      { p_subscription_id: subscription.id },
    );

    results.push({
      subscriptionId: subscription.id,
      ok: !rpcError,
      error: rpcError?.message,
    });
  }

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

  return NextResponse.json({
    processed: results.length,
    results,
    membershipLevelsError: levelError?.message,
    membershipChanges: levelChanges.filter((c) => c.changed).length,
    membershipNotified: notified,
  });
}

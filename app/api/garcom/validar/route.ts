import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/request-ip";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Único endpoint da tela /garcom (sem sessão Supabase — dispositivo
 * compartilhado da loja). O PIN é a única proteção de acesso, checado aqui
 * a cada chamada contra system_config.waiter_pin via service_role; nunca é
 * devolvido em nenhuma resposta. Rate limit e tentativas inválidas usam
 * audit_logs como armazenamento (sem Redis/KV no projeto) — funciona bem
 * pro volume de uma tela de balcão, não pretende ser um rate limiter de
 * propósito geral.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const ip = await getRequestIp();

  if (ip) {
    const { count: recentFailures } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .in("action", ["WAITER_AUTH_FAILED", "CREDIT_USE_REQUEST_CODE_INVALID"])
      .eq("ip_address", ip)
      .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());

    if ((recentFailures ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Muitas tentativas — aguarde um minuto." },
        { status: 429 },
      );
    }
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const providedPin = request.headers.get("x-waiter-pin") ?? "";
  const code = typeof body.code === "string" ? body.code : "";
  const action = body.action;

  const { data: config } = await supabase
    .from("system_config")
    .select("waiter_pin")
    .limit(1)
    .maybeSingle();
  const realPin = config?.waiter_pin ?? "0000";

  const providedBuf = Buffer.from(providedPin);
  const realBuf = Buffer.from(realPin);
  const pinMatches =
    providedBuf.length === realBuf.length && timingSafeEqual(providedBuf, realBuf);

  if (!pinMatches) {
    await supabase.from("audit_logs").insert({
      action: "WAITER_AUTH_FAILED",
      entity: "system_config",
      ip_address: ip,
    });
    return NextResponse.json({ error: "PIN incorreto." }, { status: 401 });
  }

  if (action === "check_pin") {
    await supabase.from("audit_logs").insert({
      action: "WAITER_AUTH_SUCCESS",
      entity: "system_config",
      ip_address: ip,
    });
    return NextResponse.json({ ok: true });
  }

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  if (action === "lookup") {
    const { data: row } = await supabase
      .from("credit_use_requests")
      .select(
        "id, amount_cents, expires_at, wallet_id, customer:customers(name, member_number, membership_level), wallet:credit_wallets(balance_cents)",
      )
      .eq("validation_code", code)
      .eq("status", "PENDING")
      .maybeSingle();

    const row2 = row as unknown as {
      id: string;
      amount_cents: number;
      expires_at: string;
      customer: { name: string; member_number: string; membership_level: string } | null;
      wallet: { balance_cents: number } | null;
    } | null;

    if (!row2) {
      await supabase.from("audit_logs").insert({
        action: "CREDIT_USE_REQUEST_CODE_INVALID",
        entity: "credit_use_request",
        ip_address: ip,
      });
      return NextResponse.json({ error: "Código inválido ou já utilizado." }, { status: 404 });
    }

    if (new Date(row2.expires_at).getTime() < Date.now()) {
      await supabase
        .from("credit_use_requests")
        .update({ status: "EXPIRED" })
        .eq("id", row2.id);
      await supabase.from("audit_logs").insert({
        action: "CREDIT_USE_REQUEST_CODE_INVALID",
        entity: "credit_use_request",
        entity_id: row2.id,
        ip_address: ip,
        after_state: { reason: "expired" },
      });
      return NextResponse.json(
        { error: "Código expirado — peça ao cliente gerar novo." },
        { status: 410 },
      );
    }

    return NextResponse.json({
      customerName: row2.customer?.name ?? "—",
      memberNumber: row2.customer?.member_number ?? "—",
      membershipLevel: row2.customer?.membership_level ?? "MEMBRO",
      amountCents: row2.amount_cents,
      balanceCents: row2.wallet?.balance_cents ?? 0,
      expiresAt: row2.expires_at,
    });
  }

  if (action === "confirm") {
    const { data, error } = await supabase.rpc("confirm_by_code", { p_code: code }).single();

    if (error || !data) {
      await supabase.from("audit_logs").insert({
        action: "CREDIT_USE_REQUEST_CODE_INVALID",
        entity: "credit_use_request",
        ip_address: ip,
        after_state: { reason: error?.message ?? "confirm_failed" },
      });
      return NextResponse.json(
        { error: error?.message ?? "Não foi possível confirmar." },
        { status: 409 },
      );
    }

    const result = data as {
      customer_id: string;
      customer_name: string;
      amount_cents: number;
      balance_after_cents: number;
    };

    const { data: customer } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", result.customer_id)
      .maybeSingle();

    const { data: wallet } = await supabase
      .from("credit_wallets")
      .select("cycle:subscription_cycles(period_end)")
      .eq("customer_id", result.customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const periodEnd = (wallet as unknown as { cycle: { period_end: string } | null } | null)?.cycle
      ?.period_end;

    if (customer?.phone) {
      const firstName = (result.customer_name ?? "").split(" ")[0] || result.customer_name;
      const message = `Pronto, ${firstName}. ${formatCents(result.amount_cents)} descontados do seu crédito.${
        periodEnd
          ? ` Ficaram ${formatCents(result.balance_after_cents)} para usar até ${formatDate(periodEnd)}.`
          : ` Ficaram ${formatCents(result.balance_after_cents)}.`
      } Bom apetite! 🍕 — Clube Neon`;
      try {
        await sendWhatsAppMessage(customer.phone, message);
      } catch (whatsappError) {
        const reason =
          whatsappError instanceof Error ? whatsappError.message : String(whatsappError);
        await supabase.from("audit_logs").insert({
          action: "WHATSAPP_SEND_FAILED",
          entity: "credit_use_request",
          after_state: { context: "confirm_by_code", error: reason },
        });
      }
    }

    return NextResponse.json({
      customerName: result.customer_name,
      amountCents: result.amount_cents,
      balanceAfterCents: result.balance_after_cents,
    });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

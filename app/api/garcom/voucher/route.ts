import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/request-ip";

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Segunda função da tela /garcom — mesmo PIN, mesmo rate limit, mesma
 * ausência de sessão Supabase de /api/garcom/validar. Rota separada (em vez
 * de mais uma `action` na rota de crédito) porque o domínio é diferente o
 * bastante (vouchers, não credit_use_requests) pra justificar não misturar.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const ip = await getRequestIp();

  if (ip) {
    const { count: recentFailures } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .in("action", ["WAITER_AUTH_FAILED", "VOUCHER_CODE_INVALID"])
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

  if (!code) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  if (action === "lookup") {
    const { data: voucher } = await supabase
      .from("vouchers")
      .select(
        "id, voucher_type, status, valid_until, customer:customers(name)",
      )
      .eq("code", code)
      .maybeSingle();

    const row = voucher as unknown as {
      id: string;
      voucher_type: "PIZZA_2X1" | "FRETE_GRATIS";
      status: string;
      valid_until: string;
      customer: { name: string } | null;
    } | null;

    if (!row) {
      await supabase.from("audit_logs").insert({
        action: "VOUCHER_CODE_INVALID",
        entity: "voucher",
        ip_address: ip,
      });
      return NextResponse.json({ error: "Voucher não encontrado." }, { status: 404 });
    }

    if (row.status === "UTILIZADO") {
      return NextResponse.json({ error: "Este voucher já foi utilizado." }, { status: 409 });
    }

    if (row.status === "EXPIRADO" || new Date(row.valid_until).getTime() < Date.now()) {
      if (row.status !== "EXPIRADO") {
        await supabase.from("vouchers").update({ status: "EXPIRADO" }).eq("id", row.id);
      }
      await supabase.from("audit_logs").insert({
        action: "VOUCHER_CODE_INVALID",
        entity: "voucher",
        entity_id: row.id,
        ip_address: ip,
        after_state: { reason: "expired" },
      });
      return NextResponse.json({ error: "Este voucher expirou." }, { status: 410 });
    }

    return NextResponse.json({
      customerName: row.customer?.name ?? "—",
      voucherType: row.voucher_type,
      validUntil: row.valid_until,
    });
  }

  if (action === "redeem") {
    const { data, error } = await supabase
      .rpc("redeem_voucher", { p_code: code, p_operator_id: null })
      .single();

    if (error || !data) {
      await supabase.from("audit_logs").insert({
        action: "VOUCHER_CODE_INVALID",
        entity: "voucher",
        ip_address: ip,
        after_state: { reason: error?.message ?? "redeem_failed" },
      });
      return NextResponse.json(
        { error: error?.message ?? "Não foi possível confirmar." },
        { status: 409 },
      );
    }

    const voucher = data as { customer_id: string; voucher_type: string };
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", voucher.customer_id)
      .maybeSingle();

    return NextResponse.json({
      customerName: customer?.name ?? "—",
      voucherType: voucher.voucher_type,
    });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

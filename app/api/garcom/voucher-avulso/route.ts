import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/request-ip";

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Voucher AVULSO (promocional, sem vínculo com o clube) — mesma proteção de
 * PIN + rate limit de /api/garcom/voucher, mas rota separada porque o dado
 * de origem é outra tabela (promo_vouchers, sem customer_id/subscription_id)
 * e o código tem 6 dígitos, não 4, pra não colidir na digitação.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const ip = await getRequestIp();

  if (ip) {
    const { count: recentFailures } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .in("action", ["WAITER_AUTH_FAILED", "PROMO_VOUCHER_CODE_INVALID"])
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
      .from("promo_vouchers")
      .select("id, campaign_name, benefit_description, status, valid_until")
      .eq("code", code)
      .maybeSingle();

    if (!voucher) {
      await supabase.from("audit_logs").insert({
        action: "PROMO_VOUCHER_CODE_INVALID",
        entity: "promo_voucher",
        ip_address: ip,
      });
      return NextResponse.json({ error: "Voucher não encontrado." }, { status: 404 });
    }

    if (voucher.status === "UTILIZADO") {
      return NextResponse.json({ error: "Este voucher já foi utilizado." }, { status: 409 });
    }
    if (voucher.status === "CANCELADO") {
      return NextResponse.json({ error: "Este voucher foi cancelado." }, { status: 409 });
    }

    if (voucher.status === "EXPIRADO" || new Date(voucher.valid_until).getTime() < Date.now()) {
      if (voucher.status !== "EXPIRADO") {
        await supabase.from("promo_vouchers").update({ status: "EXPIRADO" }).eq("id", voucher.id);
      }
      await supabase.from("audit_logs").insert({
        action: "PROMO_VOUCHER_CODE_INVALID",
        entity: "promo_voucher",
        entity_id: voucher.id,
        ip_address: ip,
        after_state: { reason: "expired" },
      });
      return NextResponse.json({ error: "Este voucher expirou." }, { status: 410 });
    }

    return NextResponse.json({
      campaignName: voucher.campaign_name,
      benefitDescription: voucher.benefit_description,
      validUntil: voucher.valid_until,
    });
  }

  if (action === "redeem") {
    const { data, error } = await supabase
      .rpc("redeem_promo_voucher", { p_code: code, p_operator_id: null })
      .single();

    if (error || !data) {
      await supabase.from("audit_logs").insert({
        action: "PROMO_VOUCHER_CODE_INVALID",
        entity: "promo_voucher",
        ip_address: ip,
        after_state: { reason: error?.message ?? "redeem_failed" },
      });
      return NextResponse.json(
        { error: error?.message ?? "Não foi possível confirmar." },
        { status: 409 },
      );
    }

    const voucher = data as {
      status: string;
      campaign_name: string;
      benefit_description: string;
    };

    if (voucher.status !== "UTILIZADO") {
      await supabase.from("audit_logs").insert({
        action: "PROMO_VOUCHER_CODE_INVALID",
        entity: "promo_voucher",
        ip_address: ip,
        after_state: { reason: "expired" },
      });
      return NextResponse.json({ error: "Este voucher expirou." }, { status: 410 });
    }

    return NextResponse.json({
      campaignName: voucher.campaign_name,
      benefitDescription: voucher.benefit_description,
    });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

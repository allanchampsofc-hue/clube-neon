"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { reaisToCents } from "@/lib/money";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getVoucherPublicUrl } from "@/lib/site-url";
import type { PromoVoucherPaymentMethod } from "@/lib/promo-vouchers";

const PAYMENT_METHODS: PromoVoucherPaymentMethod[] = ["PIX", "DINHEIRO", "CARTAO"];

export async function generatePromoVouchers(formData: FormData) {
  await requireManager();
  const supabase = await createClient();

  const campaignName = String(formData.get("campaign_name") ?? "").trim();
  const benefitDescription = String(formData.get("benefit_description") ?? "").trim();
  const pricePaidReais = String(formData.get("price_paid") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const quantity = Number(formData.get("quantity") ?? "1");
  const validDays = Number(formData.get("valid_days") ?? "30");
  const buyerName = String(formData.get("buyer_name") ?? "").trim() || null;
  const buyerPhone = String(formData.get("buyer_phone") ?? "").trim() || null;

  if (!campaignName || !benefitDescription) {
    redirect(
      `/painel/vouchers-avulsos/novo?error=${encodeURIComponent("Preencha o nome da campanha e o benefício.")}`,
    );
  }
  if (!PAYMENT_METHODS.includes(paymentMethod as PromoVoucherPaymentMethod)) {
    redirect(
      `/painel/vouchers-avulsos/novo?error=${encodeURIComponent("Escolha a forma de pagamento.")}`,
    );
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 200) {
    redirect(
      `/painel/vouchers-avulsos/novo?error=${encodeURIComponent("Quantidade inválida — entre 1 e 200.")}`,
    );
  }
  if (!Number.isFinite(validDays) || validDays < 1 || validDays > 365) {
    redirect(
      `/painel/vouchers-avulsos/novo?error=${encodeURIComponent("Validade inválida — entre 1 e 365 dias.")}`,
    );
  }

  const pricePaidReaisNumber = Number(pricePaidReais.replace(",", "."));
  if (!Number.isFinite(pricePaidReaisNumber) || pricePaidReaisNumber < 0) {
    redirect(
      `/painel/vouchers-avulsos/novo?error=${encodeURIComponent("Preço pago inválido.")}`,
    );
  }
  const pricePaidCents = reaisToCents(pricePaidReaisNumber);

  const { data, error } = await supabase.rpc("generate_promo_vouchers", {
    p_campaign_name: campaignName,
    p_benefit_description: benefitDescription,
    p_price_paid_cents: pricePaidCents,
    p_payment_method: paymentMethod,
    p_quantity: quantity,
    p_valid_days: validDays,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
  });

  if (error) {
    redirect(`/painel/vouchers-avulsos/novo?error=${encodeURIComponent(error.message)}`);
  }

  const generated = (data ?? []) as Array<{ id: string; code: string }>;
  const codes = generated.map((v) => v.code).join(",");

  // Manda o link por WhatsApp só quando dá pra saber pra quem é (1 código +
  // telefone informado) — em lote não faria sentido mandar N códigos pro
  // mesmo número. Falha de envio nunca bloqueia a geração, mesmo padrão
  // usado nos avisos automáticos do clube.
  if (buyerPhone && generated.length === 1) {
    const url = await getVoucherPublicUrl(generated[0].code);
    const greeting = buyerName ? `Oi, ${buyerName}!` : "Oi!";
    const message = `${greeting} Aqui está seu voucher da Neon Pizzaria 🍕\n\n${benefitDescription}\n\nAcesse: ${url}`;
    try {
      await sendWhatsAppMessage(buyerPhone, message);
    } catch (whatsappError) {
      await supabase.from("audit_logs").insert({
        action: "WHATSAPP_SEND_FAILED",
        entity: "promo_voucher",
        entity_id: generated[0].id,
        after_state: {
          context: "promo_voucher",
          error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
        },
      });
    }
  }

  redirect(`/painel/vouchers-avulsos?generated=${encodeURIComponent(codes)}`);
}

/**
 * Chamada direto do client (botão "Copiar código"), não de um <form> — por
 * isso não usa redirect(), só lança erro pro componente cliente tratar.
 * Não bloqueia nada: é só um sinalizador visual no painel pra evitar mandar
 * o mesmo código pra dois clientes por engano.
 */
export async function markPromoVoucherSent(voucherId: string) {
  await requireManager();
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_promo_voucher_sent", {
    p_voucher_id: voucherId,
  });

  if (error) throw new Error(error.message);
}

export async function cancelPromoVoucher(voucherId: string) {
  await requireManager();
  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_promo_voucher", { p_voucher_id: voucherId });

  if (error) {
    redirect(`/painel/vouchers-avulsos?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/vouchers-avulsos?success=1");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { reaisToCents, formatCents } from "@/lib/money";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { verifyQrToken } from "@/lib/qr-token";

export async function confirmCreditUsage(customerId: string, formData: FormData) {
  const { user } = await requireStaff();

  const walletId = String(formData.get("wallet_id") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const orderTotalRaw = String(formData.get("order_total") ?? "").trim();
  const amountReais = Number(amountRaw);

  if (!walletId || !Number.isFinite(amountReais) || amountReais <= 0) {
    redirect(
      `/painel/utilizacao/nova/${customerId}?error=${encodeURIComponent("Valor inválido.")}`,
    );
  }

  const amountCents = reaisToCents(amountReais);
  const supabase = await createClient();
  const { data: transactionData, error } = await supabase
    .rpc("record_credit_transaction", {
      p_wallet_id: walletId,
      p_type: "UTILIZACAO",
      p_amount_cents: -amountCents,
      p_reason: note || "Utilização no balcão",
      p_operator_id: user.id,
    })
    .single();
  const transaction = transactionData as { id: string } | null;

  if (error) {
    redirect(
      `/painel/utilizacao/nova/${customerId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  let cashbackCents = 0;
  if (orderTotalRaw) {
    const orderTotalReais = Number(orderTotalRaw);
    if (Number.isFinite(orderTotalReais)) {
      const extraSpentCents = reaisToCents(orderTotalReais) - amountCents;
      if (extraSpentCents > 0) {
        const { data: cashbackData } = await supabase.rpc("create_cashback_if_eligible", {
          p_credit_transaction_id: transaction!.id,
          p_extra_spent_cents: extraSpentCents,
        });
        const cashback = cashbackData as { cashback_cents: number } | null;
        cashbackCents = cashback?.cashback_cents ?? 0;
      }
    }
  }

  // Falha ao criar a pesquisa nunca deve travar a utilização — best-effort.
  await supabase
    .rpc("create_survey_if_eligible", { p_credit_transaction_id: transaction!.id })
    .then(
      () => {},
      () => {},
    );

  redirect(
    `/painel/utilizacao/nova/${customerId}?success=1&amount=${encodeURIComponent(amountRaw)}&cashback=${cashbackCents}`,
  );
}

/**
 * Confirmação do lado do garçom, depois de escanear o QR do cliente. O
 * segundo caminho pra utilização de crédito — o fluxo acima (busca manual +
 * confirmCreditUsage) continua existindo intacto pra quem não tem QR.
 */
export async function confirmCreditUseRequest(requestId: string, token: string) {
  const { user } = await requireStaff();

  // Verifica a assinatura do JWT antes de bater no banco — camada extra além
  // da checagem de status/token feita dentro da RPC (fonte de verdade).
  const payload = verifyQrToken(token);
  if (!payload || payload.requestId !== requestId) {
    redirect(
      `/painel/utilizacao/confirmar/${requestId}?t=${encodeURIComponent(token)}&error=${encodeURIComponent("QR inválido ou expirado.")}`,
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("confirm_credit_use_request", {
      p_request_id: requestId,
      p_operator_id: user.id,
      p_token: token,
    })
    .single();

  if (error || !data) {
    redirect(
      `/painel/utilizacao/confirmar/${requestId}?t=${encodeURIComponent(token)}&error=${encodeURIComponent(error?.message ?? "Não foi possível confirmar.")}`,
    );
  }

  const request = data as { customer_id: string; amount_cents: number; credit_transaction_id: string };

  const { data: customer } = await supabase
    .from("customers")
    .select("phone")
    .eq("id", request.customer_id)
    .maybeSingle();

  const { data: transaction } = await supabase
    .from("credit_transactions")
    .select("balance_after_cents")
    .eq("id", request.credit_transaction_id)
    .maybeSingle();

  if (customer?.phone) {
    const message = `✅ ${formatCents(request.amount_cents)} debitados do seu Clube Neon. Saldo restante: ${formatCents(transaction?.balance_after_cents ?? 0)}. Bom apetite! 🍕 — Clube Neon`;
    try {
      await sendWhatsAppMessage(customer.phone, message);
    } catch (whatsappError) {
      const reason = whatsappError instanceof Error ? whatsappError.message : String(whatsappError);
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "WHATSAPP_SEND_FAILED",
        entity: "credit_use_request",
        entity_id: requestId,
        after_state: { context: "credit_use_request_confirmed", error: reason },
      });
    }
  }

  redirect(`/painel/utilizacao/confirmar/${requestId}?success=1`);
}

export async function cancelCreditUseRequestByStaff(requestId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.rpc("cancel_credit_use_request", { p_request_id: requestId });
  redirect("/painel/utilizacao/escanear");
}

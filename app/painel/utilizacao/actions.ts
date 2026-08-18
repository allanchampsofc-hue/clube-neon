"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { reaisToCents } from "@/lib/money";

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

  redirect(
    `/painel/utilizacao/nova/${customerId}?success=1&amount=${encodeURIComponent(amountRaw)}&cashback=${cashbackCents}`,
  );
}

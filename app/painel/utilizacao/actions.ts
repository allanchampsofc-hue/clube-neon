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
  const amountReais = Number(amountRaw);

  if (!walletId || !Number.isFinite(amountReais) || amountReais <= 0) {
    redirect(
      `/painel/utilizacao/${customerId}?error=${encodeURIComponent("Valor inválido.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_credit_transaction", {
    p_wallet_id: walletId,
    p_type: "UTILIZACAO",
    p_amount_cents: -reaisToCents(amountReais),
    p_reason: note || "Utilização no balcão",
    p_operator_id: user.id,
  });

  if (error) {
    redirect(
      `/painel/utilizacao/${customerId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(
    `/painel/utilizacao/${customerId}?success=1&amount=${encodeURIComponent(amountRaw)}`,
  );
}

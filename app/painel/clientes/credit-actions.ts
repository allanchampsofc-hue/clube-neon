"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { creditAdjustmentSchema } from "@/lib/validations/credit";
import { reaisToCents } from "@/lib/money";

export async function adjustCredit(customerId: string, formData: FormData) {
  const { user } = await requireStaff();

  const parsed = creditAdjustmentSchema.safeParse({
    amount_reais: formData.get("amount_reais"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/clientes/${customerId}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!wallet) {
    redirect(
      `/painel/clientes/${customerId}?error=${encodeURIComponent(
        "Cliente ainda não tem carteira de crédito — ative a assinatura primeiro.",
      )}`,
    );
  }

  const { error } = await supabase.rpc("record_credit_transaction", {
    p_wallet_id: wallet.id,
    p_type: "AJUSTE_MANUAL",
    p_amount_cents: reaisToCents(parsed.data.amount_reais),
    p_reason: parsed.data.reason,
    p_operator_id: user.id,
  });

  if (error) {
    redirect(`/painel/clientes/${customerId}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/painel/clientes/${customerId}?success=1`);
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/auth";
import {
  advancedCreditAdjustmentSchema,
  creditAdjustmentSchema,
} from "@/lib/validations/credit";
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

/**
 * Ajuste avançado (BONUS/AJUSTE_MANUAL/ESTORNO) — só ADMIN e SUPER_ADMIN.
 * Além do lançamento no ledger (via a mesma RPC atômica), grava em
 * audit_logs: é uma ação administrativa sensível, diferente do ajuste
 * simples que qualquer staff pode fazer em adjustCredit acima.
 */
export async function adjustCreditAdvanced(customerId: string, formData: FormData) {
  const { user } = await requireAdmin();

  const parsed = advancedCreditAdjustmentSchema.safeParse({
    type: formData.get("type"),
    amount_reais: formData.get("amount_reais"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/clientes/${customerId}?adv_error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("id, balance_cents")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!wallet) {
    redirect(
      `/painel/clientes/${customerId}?adv_error=${encodeURIComponent(
        "Cliente ainda não tem carteira de crédito.",
      )}`,
    );
  }

  const amountCents = reaisToCents(parsed.data.amount_reais);

  const { data: transaction, error } = await supabase.rpc(
    "record_credit_transaction",
    {
      p_wallet_id: wallet.id,
      p_type: parsed.data.type,
      p_amount_cents: amountCents,
      p_reason: parsed.data.reason,
      p_operator_id: user.id,
    },
  );

  if (error) {
    redirect(`/painel/clientes/${customerId}?adv_error=${encodeURIComponent(error.message)}`);
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "AJUSTE_CREDITO_AVANCADO",
    entity: "credit_transactions",
    entity_id: transaction?.id ?? null,
    before_state: { balance_cents: wallet.balance_cents },
    after_state: {
      balance_cents: transaction?.balance_after_cents ?? null,
      type: parsed.data.type,
      amount_cents: amountCents,
      reason: parsed.data.reason,
    },
  });

  if (auditError) {
    redirect(`/painel/clientes/${customerId}?adv_error=${encodeURIComponent(auditError.message)}`);
  }

  redirect(`/painel/clientes/${customerId}?adv_success=1`);
}

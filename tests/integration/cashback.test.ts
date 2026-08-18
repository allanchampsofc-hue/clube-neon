import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  cleanupTestCustomer,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

async function recordUsage(walletId: string, amountCents: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("record_credit_transaction", {
      p_wallet_id: walletId,
      p_type: "UTILIZACAO",
      p_amount_cents: -amountCents,
      p_reason: "Teste de utilização",
    })
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

describeIfEnv("cashback (integração)", () => {
  const customerIds: string[] = [];

  afterAll(async () => {
    for (const id of customerIds) await cleanupTestCustomer(id);
  });

  beforeEach(() => {
    resetSession();
  });

  it("usuário anônimo não chama create_cashback_if_eligible", async () => {
    const supabaseAnon = await createClient();
    const { error } = await supabaseAnon.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: "00000000-0000-0000-0000-000000000000",
      p_extra_spent_cents: 1000,
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Acesso negado");
  });

  it("gera cashback respeitando o percentual configurado", async () => {
    const admin = createAdminClient();
    const email = testEmail("cashback-basico");
    const customerId = await createTestCustomer({ name: "Cliente Cashback", email });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);

    const { data: config } = await admin
      .from("system_config")
      .select("cashback_percentage, cashback_max_cents")
      .limit(1)
      .single();

    const usage = await recordUsage(walletId, 2000);
    const extraSpentCents = 6000;
    const expectedCashback = Math.min(
      Math.round((extraSpentCents * config!.cashback_percentage) / 100),
      config!.cashback_max_cents,
    );

    const { data: cashbackData, error } = await admin.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: usage.id,
      p_extra_spent_cents: extraSpentCents,
    });
    expect(error).toBeNull();

    if (expectedCashback <= 0) {
      expect(cashbackData).toBeNull();
      return;
    }

    const cashback = cashbackData as { id: string; cashback_cents: number; status: string };
    expect(cashback.cashback_cents).toBe(expectedCashback);
    expect(cashback.status).toBe("PENDENTE");
  });

  it("respeita o teto máximo configurado", async () => {
    const admin = createAdminClient();
    const email = testEmail("cashback-teto");
    const customerId = await createTestCustomer({ name: "Cliente Teto", email });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);

    const { data: config } = await admin
      .from("system_config")
      .select("cashback_max_cents")
      .limit(1)
      .single();

    const usage = await recordUsage(walletId, 1000);
    // valor exagerado de propósito pra estourar qualquer teto configurado
    const { data: cashbackData, error } = await admin.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: usage.id,
      p_extra_spent_cents: 1_000_000,
    });
    expect(error).toBeNull();
    const cashback = cashbackData as { cashback_cents: number };
    expect(cashback.cashback_cents).toBeLessThanOrEqual(config!.cashback_max_cents);
    expect(cashback.cashback_cents).toBe(config!.cashback_max_cents);
  });

  it("não gera cashback quando o cliente tem indicação pendente", async () => {
    const admin = createAdminClient();
    const referrerEmail = testEmail("cashback-referrer");
    const referrerId = await createTestCustomer({ name: "Indicador", email: referrerEmail });
    customerIds.push(referrerId);

    const referredEmail = testEmail("cashback-referred");
    const referredId = await createTestCustomer({ name: "Indicado", email: referredEmail });
    customerIds.push(referredId);
    const { walletId } = await createActiveSubscriptionWithCredit(referredId);

    const { data: referrer } = await admin
      .from("customers")
      .select("referral_code")
      .eq("id", referrerId)
      .single();
    const { error: referralError } = await admin.from("referrals").insert({
      referrer_customer_id: referrerId,
      referred_customer_id: referredId,
      referral_code: referrer!.referral_code,
    });
    expect(referralError).toBeNull();

    const usage = await recordUsage(walletId, 1000);
    const { data: cashbackData, error } = await admin.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: usage.id,
      p_extra_spent_cents: 6000,
    });
    expect(error).toBeNull();
    expect(cashbackData).toBeNull();
  });

  it("não gera cashback com o toggle desativado, e não altera nada além disso", async () => {
    const admin = createAdminClient();
    const { data: originalConfig } = await admin
      .from("system_config")
      .select("id, cashback_enabled")
      .limit(1)
      .single();

    const email = testEmail("cashback-desativado");
    const customerId = await createTestCustomer({ name: "Cliente Toggle", email });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId, 1000);

    try {
      await admin
        .from("system_config")
        .update({ cashback_enabled: false })
        .eq("id", originalConfig!.id);

      const { data: cashbackData, error } = await admin.rpc("create_cashback_if_eligible", {
        p_credit_transaction_id: usage.id,
        p_extra_spent_cents: 6000,
      });
      expect(error).toBeNull();
      expect(cashbackData).toBeNull();
    } finally {
      await admin
        .from("system_config")
        .update({ cashback_enabled: originalConfig!.cashback_enabled })
        .eq("id", originalConfig!.id);
    }
  });

  it("idempotência: a mesma credit_transaction não gera dois cashbacks", async () => {
    const admin = createAdminClient();
    const email = testEmail("cashback-duplicado");
    const customerId = await createTestCustomer({ name: "Cliente Duplicado", email });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId, 1000);

    const { error: firstError } = await admin.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: usage.id,
      p_extra_spent_cents: 6000,
    });
    expect(firstError).toBeNull();

    const { error: secondError } = await admin.rpc("create_cashback_if_eligible", {
      p_credit_transaction_id: usage.id,
      p_extra_spent_cents: 6000,
    });
    expect(secondError).toBeTruthy();
  });

  it("cashback PENDENTE é creditado como BONUS no rollover do próximo ciclo", async () => {
    const admin = createAdminClient();
    const email = testEmail("cashback-rollover");
    const customerId = await createTestCustomer({ name: "Cliente Rollover", email });
    customerIds.push(customerId);
    const { subscriptionId, walletId } = await createActiveSubscriptionWithCredit(customerId);

    const usage = await recordUsage(walletId, 1000);
    const { data: cashbackData, error: cashbackError } = await admin.rpc(
      "create_cashback_if_eligible",
      { p_credit_transaction_id: usage.id, p_extra_spent_cents: 6000 },
    );
    expect(cashbackError).toBeNull();
    const cashback = cashbackData as { id: string; cashback_cents: number } | null;
    expect(cashback).not.toBeNull();

    // Força o ciclo atual a já ter terminado, pra rollover aceitar processar.
    await admin
      .from("subscription_cycles")
      .update({ period_end: new Date(Date.now() - 1000).toISOString() })
      .eq("subscription_id", subscriptionId)
      .eq("cycle_number", 1);

    const { error: rolloverError } = await admin.rpc("process_subscription_cycle_rollover", {
      p_subscription_id: subscriptionId,
    });
    expect(rolloverError).toBeNull();

    const { data: cashbackAfter } = await admin
      .from("cashback_transactions")
      .select("status, credited_at")
      .eq("id", cashback!.id)
      .single();
    expect(cashbackAfter?.status).toBe("CREDITADO");
    expect(cashbackAfter?.credited_at).toBeTruthy();

    const { data: bonusTx } = await admin
      .from("credit_transactions")
      .select("amount_cents")
      .eq("customer_id", customerId)
      .eq("type", "BONUS");
    expect(bonusTx).toHaveLength(1);
    expect(bonusTx![0].amount_cents).toBe(cashback!.cashback_cents);
  });
});

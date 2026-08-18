import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasTestEnv,
  testEmail,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  createPendingSubscription,
  cleanupTestCustomer,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

describeIfEnv("indicação de amigos (integração)", () => {
  const customerIds: string[] = [];

  afterAll(async () => {
    for (const id of customerIds) await cleanupTestCustomer(id);
  });

  it("cliente novo ganha referral_code único no cadastro", async () => {
    const email = testEmail("codigo-auto");
    const customerId = await createTestCustomer({ name: "Cliente Código", email });
    customerIds.push(customerId);

    const admin = createAdminClient();
    const { data } = await admin
      .from("customers")
      .select("referral_code")
      .eq("id", customerId)
      .single();

    expect(data?.referral_code).toMatch(/^NEON-[A-Z0-9]{4}$/);
  });

  it("ativação com referral PENDENTE credita BONUS pros dois lados e marca CREDITADO", async () => {
    const admin = createAdminClient();

    const referrerEmail = testEmail("referrer");
    const referrerId = await createTestCustomer({ name: "Cliente Indicador", email: referrerEmail });
    customerIds.push(referrerId);
    const { walletId: referrerWalletId, balanceCents: referrerBalanceBefore } =
      await createActiveSubscriptionWithCredit(referrerId);

    const referredEmail = testEmail("referred");
    const referredId = await createTestCustomer({ name: "Cliente Indicado", email: referredEmail });
    customerIds.push(referredId);

    const { data: referrer } = await admin
      .from("customers")
      .select("referral_code")
      .eq("id", referrerId)
      .single();

    const { data: referral, error: referralError } = await admin
      .from("referrals")
      .insert({
        referrer_customer_id: referrerId,
        referred_customer_id: referredId,
        referral_code: referrer!.referral_code,
      })
      .select("id")
      .single();
    expect(referralError).toBeNull();

    const { data: config } = await admin
      .from("system_config")
      .select("referral_credit_cents")
      .limit(1)
      .single();
    const referralCreditCents = config!.referral_credit_cents as number;

    const subscriptionId = await createPendingSubscription(referredId);
    const { error: activateError } = await admin.rpc("activate_subscription", {
      p_subscription_id: subscriptionId,
    });
    expect(activateError).toBeNull();

    const { data: referralAfter } = await admin
      .from("referrals")
      .select("status, credited_at")
      .eq("id", referral!.id)
      .single();
    expect(referralAfter?.status).toBe("CREDITADO");
    expect(referralAfter?.credited_at).toBeTruthy();

    const { data: referrerWallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", referrerWalletId)
      .single();
    expect(referrerWallet?.balance_cents).toBe(referrerBalanceBefore + referralCreditCents);

    const { data: referredWallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("customer_id", referredId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    // saldo do indicado = crédito mensal do plano + bônus de indicação
    expect(referredWallet?.balance_cents).toBeGreaterThanOrEqual(referralCreditCents);

    const { data: bonusTx } = await admin
      .from("credit_transactions")
      .select("type, amount_cents")
      .eq("customer_id", referredId)
      .eq("type", "BONUS");
    expect(bonusTx).toHaveLength(1);
    expect(bonusTx![0].amount_cents).toBe(referralCreditCents);
  });

  it("mesmo indicado não pode ter duas linhas de referral (unique)", async () => {
    const admin = createAdminClient();

    const referrerAEmail = testEmail("referrer-a");
    const referrerAId = await createTestCustomer({ name: "Indicador A", email: referrerAEmail });
    customerIds.push(referrerAId);

    const referrerBEmail = testEmail("referrer-b");
    const referrerBId = await createTestCustomer({ name: "Indicador B", email: referrerBEmail });
    customerIds.push(referrerBId);

    const referredEmail = testEmail("referred-duplo");
    const referredId = await createTestCustomer({ name: "Indicado Duplo", email: referredEmail });
    customerIds.push(referredId);

    const { error: firstError } = await admin.from("referrals").insert({
      referrer_customer_id: referrerAId,
      referred_customer_id: referredId,
      referral_code: "NEON-TEST",
    });
    expect(firstError).toBeNull();

    const { error: secondError } = await admin.from("referrals").insert({
      referrer_customer_id: referrerBId,
      referred_customer_id: referredId,
      referral_code: "NEON-TEST",
    });
    expect(secondError).toBeTruthy();
  });

  it("indicação de si mesmo é rejeitada pelo banco", async () => {
    const admin = createAdminClient();
    const email = testEmail("auto-indicacao");
    const customerId = await createTestCustomer({ name: "Cliente Auto", email });
    customerIds.push(customerId);

    const { error } = await admin.from("referrals").insert({
      referrer_customer_id: customerId,
      referred_customer_id: customerId,
      referral_code: "NEON-SELF",
    });
    expect(error).toBeTruthy();
  });
});

import { confirmCreditUsage } from "@/app/painel/utilizacao/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureRedirect } from "next/navigation";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  assignTestRole,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  signInTestUser,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function usageFormData(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const defaults: Record<string, string> = { wallet_id: "", amount: "20", note: "" };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    form.set(key, value);
  }
  return form;
}

describeIfEnv("utilização de crédito (integração)", () => {
  const OPERATOR_PASSWORD = "SenhaOperador123";
  let operatorEmail: string;
  let operatorUserId: string;
  const customerIds: string[] = [];

  beforeAll(async () => {
    operatorEmail = testEmail("operador-utilizacao");
    operatorUserId = await createTestAuthUser(operatorEmail, OPERATOR_PASSWORD);
    await assignTestRole(operatorUserId, "OPERADOR");
  });

  afterAll(async () => {
    for (const customerId of customerIds) {
      await cleanupTestCustomer(customerId);
    }
    await cleanupTestAuthUser(operatorUserId);
  });

  beforeEach(async () => {
    resetSession();
    await signInTestUser(operatorEmail, OPERATOR_PASSWORD);
  });

  it("utilização válida debita o saldo e cria registro no ledger", async () => {
    const email = testEmail("uso-valido");
    const customerId = await createTestCustomer({ name: "Cliente Uso Válido", email });
    customerIds.push(customerId);
    const { walletId, balanceCents } = await createActiveSubscriptionWithCredit(customerId);

    const form = usageFormData({ wallet_id: walletId, amount: "20" });
    const url = await captureRedirect(() => confirmCreditUsage(customerId, form));
    expect(url).toContain("success=1");

    const admin = createAdminClient();
    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet.balance_cents).toBe(balanceCents - 2000);

    const { data: transactions } = await admin
      .from("credit_transactions")
      .select("type, amount_cents")
      .eq("wallet_id", walletId)
      .eq("type", "UTILIZACAO");
    expect(transactions).toHaveLength(1);
    expect(transactions![0].amount_cents).toBe(-2000);
  });

  it("utilização maior que o saldo rejeita sem alterar o banco", async () => {
    const email = testEmail("uso-excede-saldo");
    const customerId = await createTestCustomer({ name: "Cliente Uso Excede", email });
    customerIds.push(customerId);
    const { walletId, balanceCents } = await createActiveSubscriptionWithCredit(customerId);

    const excessReais = String(balanceCents / 100 + 1000);
    const form = usageFormData({ wallet_id: walletId, amount: excessReais });
    const url = await captureRedirect(() => confirmCreditUsage(customerId, form));
    expect(url).toContain("error=");

    const admin = createAdminClient();
    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet.balance_cents).toBe(balanceCents);

    const { data: transactions } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("wallet_id", walletId)
      .eq("type", "UTILIZACAO");
    expect(transactions).toHaveLength(0);
  });

  it("utilização com assinatura inativa rejeita", async () => {
    const email = testEmail("uso-assinatura-inativa");
    const customerId = await createTestCustomer({ name: "Cliente Assinatura Inativa", email });
    customerIds.push(customerId);
    const { walletId, subscriptionId, balanceCents } =
      await createActiveSubscriptionWithCredit(customerId);

    const admin = createAdminClient();
    await admin.from("subscriptions").update({ status: "CANCELADA" }).eq("id", subscriptionId);

    const form = usageFormData({ wallet_id: walletId, amount: "20" });
    const url = await captureRedirect(() => confirmCreditUsage(customerId, form));
    expect(url).toContain("error=");

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet.balance_cents).toBe(balanceCents);
  });
});

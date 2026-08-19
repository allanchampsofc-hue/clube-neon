import { createAdminClient } from "@/lib/supabase/admin";
import { POST as validarRoute } from "@/app/api/garcom/validar/route";
import { createCreditUseRequest } from "@/app/minha-conta/usar-credito/actions";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  signInTestUser,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

const TEST_PIN = "5397";

function callGarcom(pin: string, body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/garcom/validar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-waiter-pin": pin },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validarRoute(request as any);
}

describeIfEnv("Código de 4 dígitos + tela do garçom (integração)", () => {
  const admin = createAdminClient();
  let originalPin: string | null = null;

  let customerEmail: string;
  let customerUserId: string;
  let customerId: string;
  let walletId: string;
  let balanceCents: number;

  beforeAll(async () => {
    const { data: config } = await admin.from("system_config").select("id, waiter_pin").limit(1).single();
    originalPin = config!.waiter_pin;
    await admin.from("system_config").update({ waiter_pin: TEST_PIN }).eq("id", config!.id);
  });

  afterAll(async () => {
    const { data: config } = await admin.from("system_config").select("id").limit(1).single();
    await admin.from("system_config").update({ waiter_pin: originalPin }).eq("id", config!.id);
  });

  beforeEach(async () => {
    resetSession();
    customerEmail = testEmail("garcom-cliente");
    customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
    customerId = await createTestCustomer({
      userId: customerUserId,
      name: "Cliente Garcom",
      email: customerEmail,
    });
    const activated = await createActiveSubscriptionWithCredit(customerId);
    walletId = activated.walletId;
    balanceCents = activated.balanceCents;
    await signInTestUser(customerEmail, "SenhaCliente123");
  });

  afterEach(async () => {
    await cleanupTestCustomer(customerId);
    await cleanupTestAuthUser(customerUserId);
  });

  it("gera um código de 4 dígitos válido, nunca 0000", async () => {
    const result = await createCreditUseRequest(1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationCode).toMatch(/^\d{4}$/);
    expect(result.validationCode).not.toBe("0000");
  });

  it("gerar um novo código cancela o pedido anterior e gera código diferente", async () => {
    const first = await createCreditUseRequest(1000);
    const second = await createCreditUseRequest(2000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.validationCode).not.toBe(first.validationCode);

    const { data: firstRow } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", first.requestId)
      .single();
    expect(firstRow?.status).toBe("CANCELLED");
  });

  it("PIN errado é rejeitado sem consultar o código", async () => {
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const res = await callGarcom("0001", { action: "lookup", code: created.validationCode });
    expect(res.status).toBe(401);

    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("PENDING");
  });

  it("código inexistente é rejeitado", async () => {
    const res = await callGarcom(TEST_PIN, { action: "lookup", code: "9999" });
    expect([404, 400]).toContain(res.status);
  });

  it("confirma o código, debita o crédito atomicamente e envia dados do cliente", async () => {
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const lookupRes = await callGarcom(TEST_PIN, {
      action: "lookup",
      code: created.validationCode,
    });
    expect(lookupRes.status).toBe(200);
    const lookupBody = await lookupRes.json();
    expect(lookupBody.customerName).toBe("Cliente Garcom");
    expect(lookupBody.amountCents).toBe(1000);

    const confirmRes = await callGarcom(TEST_PIN, {
      action: "confirm",
      code: created.validationCode,
    });
    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.amountCents).toBe(1000);
    expect(confirmBody.balanceAfterCents).toBe(balanceCents - 1000);

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet?.balance_cents).toBe(balanceCents - 1000);

    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status, credit_transaction_id")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("CONFIRMED");
    expect(row?.credit_transaction_id).not.toBeNull();
  });

  it("código usado duas vezes é rejeitado na segunda tentativa (idempotente)", async () => {
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const first = await callGarcom(TEST_PIN, { action: "confirm", code: created.validationCode });
    expect(first.status).toBe(200);
    const second = await callGarcom(TEST_PIN, { action: "confirm", code: created.validationCode });
    expect(second.status).not.toBe(200);

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet?.balance_cents).toBe(balanceCents - 1000);
  });

  it("código expirado é rejeitado", async () => {
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    await admin
      .from("credit_use_requests")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", created.requestId);

    const res = await callGarcom(TEST_PIN, { action: "confirm", code: created.validationCode });
    expect([404, 409, 410]).toContain(res.status);

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet?.balance_cents).toBe(balanceCents);
  });
});

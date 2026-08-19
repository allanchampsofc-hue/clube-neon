import { createAdminClient } from "@/lib/supabase/admin";
import { captureRedirect } from "next/navigation";
import {
  createCreditUseRequest,
  cancelCreditUseRequest,
} from "@/app/minha-conta/usar-credito/actions";
import {
  confirmCreditUseRequest,
  cancelCreditUseRequestByStaff,
} from "@/app/painel/utilizacao/actions";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  assignTestRole,
  signInTestUser,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

describeIfEnv("QR Code de utilização de crédito (integração)", () => {
  let customerEmail: string;
  let customerUserId: string;
  let customerId: string;
  let walletId: string;
  let balanceCents: number;

  let staffEmail: string;
  let staffUserId: string;

  beforeEach(async () => {
    resetSession();
    customerEmail = testEmail("qr-cliente");
    customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
    customerId = await createTestCustomer({
      userId: customerUserId,
      name: "Cliente QR",
      email: customerEmail,
    });
    const activated = await createActiveSubscriptionWithCredit(customerId);
    walletId = activated.walletId;
    balanceCents = activated.balanceCents;

    staffEmail = testEmail("qr-staff");
    staffUserId = await createTestAuthUser(staffEmail, "SenhaStaff123");
    await assignTestRole(staffUserId, "OPERADOR");
  });

  afterEach(async () => {
    await cleanupTestCustomer(customerId);
    await cleanupTestAuthUser(customerUserId);
    await cleanupTestAuthUser(staffUserId);
  });

  it("cliente gera um QR Code válido por 5 minutos", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const result = await createCreditUseRequest(1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amountCents).toBe(1000);
    expect(result.qrUrl).toContain(result.requestId);

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status, amount_cents, expires_at")
      .eq("id", result.requestId)
      .single();
    expect(row?.status).toBe("PENDING");
    expect(row?.amount_cents).toBe(1000);
    const secondsToExpire = (new Date(row!.expires_at).getTime() - Date.now()) / 1000;
    expect(secondsToExpire).toBeGreaterThan(4 * 60);
    expect(secondsToExpire).toBeLessThanOrEqual(5 * 60);
  });

  it("gerar um novo QR cancela o QR pendente anterior", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const first = await createCreditUseRequest(1000);
    const second = await createCreditUseRequest(2000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const admin = createAdminClient();
    const { data: firstRow } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", first.requestId)
      .single();
    expect(firstRow?.status).toBe("CANCELLED");
  });

  it("rejeita valor maior que o saldo disponível", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const result = await createCreditUseRequest(balanceCents + 100000);
    expect(result.ok).toBe(false);
  });

  it("operador confirma o QR e debita o crédito atomicamente", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("credit_use_requests")
      .select("token")
      .eq("id", created.requestId)
      .single();

    resetSession();
    await signInTestUser(staffEmail, "SenhaStaff123");
    const url = await captureRedirect(() =>
      confirmCreditUseRequest(created.requestId, tokenRow!.token),
    );
    expect(url).toContain("success=1");

    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status, credit_transaction_id")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("CONFIRMED");
    expect(row?.credit_transaction_id).not.toBeNull();

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet?.balance_cents).toBe(balanceCents - 1000);
  });

  it("confirmar o mesmo QR duas vezes não debita duas vezes (idempotente)", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("credit_use_requests")
      .select("token")
      .eq("id", created.requestId)
      .single();

    resetSession();
    await signInTestUser(staffEmail, "SenhaStaff123");
    await captureRedirect(() => confirmCreditUseRequest(created.requestId, tokenRow!.token));
    const secondUrl = await captureRedirect(() =>
      confirmCreditUseRequest(created.requestId, tokenRow!.token),
    );
    expect(secondUrl).toContain("error=");

    const { data: wallet } = await admin
      .from("credit_wallets")
      .select("balance_cents")
      .eq("id", walletId)
      .single();
    expect(wallet?.balance_cents).toBe(balanceCents - 1000);
  });

  it("rejeita confirmação com token errado", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    resetSession();
    await signInTestUser(staffEmail, "SenhaStaff123");
    const url = await captureRedirect(() =>
      confirmCreditUseRequest(created.requestId, "token-invalido"),
    );
    expect(url).toContain("error=");

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("PENDING");
  });

  it("cliente cancela o próprio QR pendente", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const result = await cancelCreditUseRequest(created.requestId);
    expect(result.ok).toBe(true);

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("CANCELLED");
  });

  it("operador também pode cancelar um QR pendente", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    resetSession();
    await signInTestUser(staffEmail, "SenhaStaff123");
    await captureRedirect(() => cancelCreditUseRequestByStaff(created.requestId));

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("credit_use_requests")
      .select("status")
      .eq("id", created.requestId)
      .single();
    expect(row?.status).toBe("CANCELLED");
  });

  it("registra CREDIT_USE_REQUEST_CREATED e CREDIT_USE_REQUEST_CONFIRMED na auditoria", async () => {
    await signInTestUser(customerEmail, "SenhaCliente123");
    const created = await createCreditUseRequest(1000);
    if (!created.ok) throw new Error("setup falhou");

    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("credit_use_requests")
      .select("token")
      .eq("id", created.requestId)
      .single();

    resetSession();
    await signInTestUser(staffEmail, "SenhaStaff123");
    await captureRedirect(() => confirmCreditUseRequest(created.requestId, tokenRow!.token));

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity", "credit_use_request")
      .eq("entity_id", created.requestId);
    const actions = (logs ?? []).map((l) => l.action);
    expect(actions).toContain("CREDIT_USE_REQUEST_CREATED");
    expect(actions).toContain("CREDIT_USE_REQUEST_CONFIRMED");
  });
});

import { requireManager, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

describeIfEnv("segurança (integração)", () => {
  const PASSWORD = "SenhaSegura123";
  const customerIds: string[] = [];
  const authUserIds: string[] = [];

  afterAll(async () => {
    for (const customerId of customerIds) await cleanupTestCustomer(customerId);
    for (const userId of authUserIds) await cleanupTestAuthUser(userId);
  });

  beforeEach(() => {
    resetSession();
  });

  it("cliente não acessa dados de outro cliente (customers e credit_wallets)", async () => {
    const emailA = testEmail("cliente-a");
    const userIdA = await createTestAuthUser(emailA, PASSWORD);
    authUserIds.push(userIdA);
    const customerIdA = await createTestCustomer({ userId: userIdA, name: "Cliente A", email: emailA });
    customerIds.push(customerIdA);
    await createActiveSubscriptionWithCredit(customerIdA);

    const emailB = testEmail("cliente-b");
    const userIdB = await createTestAuthUser(emailB, PASSWORD);
    authUserIds.push(userIdB);
    const customerIdB = await createTestCustomer({ userId: userIdB, name: "Cliente B", email: emailB });
    customerIds.push(customerIdB);
    const { walletId: walletIdB } = await createActiveSubscriptionWithCredit(customerIdB);

    await signInTestUser(emailA, PASSWORD);
    const supabaseAsA = await createClient();

    const { data: otherCustomer } = await supabaseAsA
      .from("customers")
      .select("id")
      .eq("id", customerIdB)
      .maybeSingle();
    expect(otherCustomer).toBeNull();

    const { data: otherWallet } = await supabaseAsA
      .from("credit_wallets")
      .select("id")
      .eq("id", walletIdB)
      .maybeSingle();
    expect(otherWallet).toBeNull();
  });

  it("operador não acessa /painel/relatorios (requireManager redireciona)", async () => {
    const email = testEmail("operador-relatorios");
    const userId = await createTestAuthUser(email, PASSWORD);
    authUserIds.push(userId);
    await assignTestRole(userId, "OPERADOR");
    await signInTestUser(email, PASSWORD);

    const url = await captureRedirect(() => requireManager());
    expect(url).toBe("/nao-autorizado");
  });

  it("operador não acessa /painel/auditoria (requireAdmin redireciona)", async () => {
    const email = testEmail("operador-auditoria");
    const userId = await createTestAuthUser(email, PASSWORD);
    authUserIds.push(userId);
    await assignTestRole(userId, "OPERADOR");
    await signInTestUser(email, PASSWORD);

    const url = await captureRedirect(() => requireAdmin());
    expect(url).toBe("/nao-autorizado");
  });

  it("usuário anônimo não chama record_credit_transaction", async () => {
    const supabaseAnon = await createClient();
    const { error } = await supabaseAnon.rpc("record_credit_transaction", {
      p_wallet_id: "00000000-0000-0000-0000-000000000000",
      p_type: "UTILIZACAO",
      p_amount_cents: -100,
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Acesso negado");
  });

  it("usuário anônimo não chama activate_subscription", async () => {
    const supabaseAnon = await createClient();
    const { error } = await supabaseAnon.rpc("activate_subscription", {
      p_subscription_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Acesso negado");
  });

  it("admin não consegue se auto-promover a super_admin via insert em user_roles", async () => {
    const email = testEmail("admin-escalada");
    const userId = await createTestAuthUser(email, PASSWORD);
    authUserIds.push(userId);
    await assignTestRole(userId, "ADMIN");
    await signInTestUser(email, PASSWORD);

    const supabaseAsAdmin = await createClient();
    const { error } = await supabaseAsAdmin
      .from("user_roles")
      .insert({ user_id: userId, role_code: "SUPER_ADMIN" });

    expect(error).toBeTruthy();

    const admin = createAdminClient();
    const { data: roles } = await admin
      .from("user_roles")
      .select("role_code")
      .eq("user_id", userId)
      .eq("role_code", "SUPER_ADMIN");
    expect(roles).toHaveLength(0);
  });

  it("cliente não consegue forjar audit_log com ação fora do allowlist de autoatendimento", async () => {
    const email = testEmail("cliente-forja-log");
    const userId = await createTestAuthUser(email, PASSWORD);
    authUserIds.push(userId);
    const customerId = await createTestCustomer({ userId, name: "Cliente Forja Log", email });
    customerIds.push(customerId);
    await signInTestUser(email, PASSWORD);

    const supabaseAsCliente = await createClient();
    const { error } = await supabaseAsCliente.rpc("log_audit_event", {
      p_action: "SUBSCRIPTION_CANCELLED",
      p_entity: "customer",
      p_entity_id: customerId,
    });

    expect(error).toBeTruthy();
  });

  it("usuário anônimo não insere direto em credit_transactions", async () => {
    const supabaseAnon = await createClient();
    const admin = createAdminClient();
    const { data: someWallet } = await admin.from("credit_wallets").select("id, customer_id").limit(1).maybeSingle();

    const { error } = await supabaseAnon.from("credit_transactions").insert({
      customer_id: someWallet?.customer_id ?? "00000000-0000-0000-0000-000000000000",
      wallet_id: someWallet?.id ?? "00000000-0000-0000-0000-000000000000",
      type: "UTILIZACAO",
      amount_cents: -100,
      balance_before_cents: 0,
      balance_after_cents: -100,
    });
    expect(error).toBeTruthy();
  });
});

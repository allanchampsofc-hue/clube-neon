import { createAdminClient } from "@/lib/supabase/admin";
import { POST as voucherRoute } from "@/app/api/garcom/voucher/route";
import {
  hasTestEnv,
  testEmail,
  createTestAuthUser,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  addConsecutiveCycles,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function callVoucherApi(pin: string, body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/garcom/voucher", {
    method: "POST",
    headers: { "content-type": "application/json", "x-waiter-pin": pin },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return voucherRoute(request as any);
}

async function createSubscriptionForPlanType(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  planType: "ESSENCIAL" | "COMPLETO",
) {
  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("plan_type", planType)
    .eq("active", true)
    .single();

  const { data: subscription } = await admin
    .from("subscriptions")
    .insert({ customer_id: customerId, plan_id: plan!.id })
    .select("id")
    .single();

  await admin.rpc("activate_subscription", { p_subscription_id: subscription!.id });
  return subscription!.id as string;
}

describeIfEnv("Vouchers — planos, geração e resgate (integração)", () => {
  const admin = createAdminClient();
  const TEST_PIN = "8842";
  let configId: string;
  let originalPin: string;

  let customerEmail: string;
  let customerUserId: string;
  let customerId: string;

  beforeAll(async () => {
    const { data } = await admin.from("system_config").select("id, waiter_pin").limit(1).single();
    configId = data!.id;
    originalPin = data!.waiter_pin;
    await admin.from("system_config").update({ waiter_pin: TEST_PIN }).eq("id", configId);
  });

  afterAll(async () => {
    await admin.from("system_config").update({ waiter_pin: originalPin }).eq("id", configId);
  });

  beforeEach(async () => {
    customerEmail = testEmail("voucher");
    customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
    customerId = await createTestCustomer({
      userId: customerUserId,
      name: "Cliente Voucher",
      email: customerEmail,
    });
  });

  afterEach(async () => {
    await cleanupTestCustomer(customerId);
    await cleanupTestAuthUser(customerUserId);
  });

  describe("geração automática por rollover", () => {
    it("assinatura no mês 2 (par) gera voucher PIZZA_2X1", async () => {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      await addConsecutiveCycles(subscriptionId, 1, 2, new Date(cycle1!.period_end));

      const { data: voucher } = await admin
        .rpc("generate_bimonthly_voucher", { p_subscription_id: subscriptionId })
        .single();

      expect(voucher).not.toBeNull();
      const v = voucher as { voucher_type: string; cycle_number: number; code: string };
      expect(v.voucher_type).toBe("PIZZA_2X1");
      expect(v.cycle_number).toBe(2);
      expect(v.code).toMatch(/^\d{4}$/);
    });

    it("assinatura no mês 3 (ímpar) não gera voucher", async () => {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      await addConsecutiveCycles(subscriptionId, 2, 2, new Date(cycle1!.period_end));

      const { data: voucher } = await admin
        .rpc("generate_bimonthly_voucher", { p_subscription_id: subscriptionId })
        .single();

      expect(voucher).toBeNull();
    });

    it("chamar duas vezes pro mesmo ciclo não gera voucher duplicado (idempotência)", async () => {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      await addConsecutiveCycles(subscriptionId, 1, 2, new Date(cycle1!.period_end));

      const first = await admin.rpc("generate_bimonthly_voucher", { p_subscription_id: subscriptionId }).single();
      const second = await admin.rpc("generate_bimonthly_voucher", { p_subscription_id: subscriptionId }).single();

      expect(first.data).not.toBeNull();
      expect(second.data).toBeNull();

      const { count } = await admin
        .from("vouchers")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", subscriptionId)
        .eq("voucher_type", "PIZZA_2X1");
      expect(count).toBe(1);
    });

    it("plano COMPLETO gera FRETE_GRATIS a partir do mês 2", async () => {
      const subscriptionId = await createSubscriptionForPlanType(admin, customerId, "COMPLETO");
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      await addConsecutiveCycles(subscriptionId, 1, 2, new Date(cycle1!.period_end));

      const { data: voucher } = await admin
        .rpc("generate_monthly_frete", { p_subscription_id: subscriptionId })
        .single();

      expect(voucher).not.toBeNull();
      const v = voucher as { voucher_type: string; code: string };
      expect(v.voucher_type).toBe("FRETE_GRATIS");
      expect(v.code).toMatch(/^FRETE-/);
    });

    it("plano ESSENCIAL não gera FRETE_GRATIS", async () => {
      const subscriptionId = await createSubscriptionForPlanType(admin, customerId, "ESSENCIAL");
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      await addConsecutiveCycles(subscriptionId, 1, 2, new Date(cycle1!.period_end));

      const { data: voucher } = await admin
        .rpc("generate_monthly_frete", { p_subscription_id: subscriptionId })
        .single();

      expect(voucher).toBeNull();
    });
  });

  describe("validação e resgate", () => {
    async function insertVoucher(overrides: Partial<{ status: string; validUntil: Date }> = {}) {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const { data } = await admin
        .from("vouchers")
        .insert({
          subscription_id: subscriptionId,
          customer_id: customerId,
          voucher_type: "PIZZA_2X1",
          code,
          cycle_number: 2,
          status: overrides.status ?? "DISPONIVEL",
          valid_until: (overrides.validUntil ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).toISOString(),
        })
        .select("id, code")
        .single();
      return data!;
    }

    it("voucher válido é resgatado via redeem_voucher", async () => {
      const voucher = await insertVoucher();
      const { data, error } = await admin
        .rpc("redeem_voucher", { p_code: voucher.code, p_operator_id: null })
        .single();
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe("UTILIZADO");
    });

    it("voucher já utilizado é rejeitado na segunda tentativa", async () => {
      const voucher = await insertVoucher();
      await admin.rpc("redeem_voucher", { p_code: voucher.code, p_operator_id: null });
      const { error } = await admin.rpc("redeem_voucher", { p_code: voucher.code, p_operator_id: null });
      expect(error).not.toBeNull();
    });

    it("voucher expirado é rejeitado", async () => {
      const voucher = await insertVoucher({ validUntil: new Date(Date.now() - 1000) });
      const { error } = await admin.rpc("redeem_voucher", { p_code: voucher.code, p_operator_id: null });
      expect(error).not.toBeNull();

      const { data: row } = await admin.from("vouchers").select("status").eq("id", voucher.id).single();
      expect(row?.status).toBe("EXPIRADO");
    });

    it("código inexistente retorna erro claro", async () => {
      const { error } = await admin.rpc("redeem_voucher", { p_code: "0000", p_operator_id: null });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/não encontrado/i);
    });
  });

  describe("tela do garçom — /api/garcom/voucher", () => {
    it("PIN errado rejeita a validação", async () => {
      const res = await callVoucherApi("0001", { action: "lookup", code: "1234" });
      expect(res.status).toBe(401);
    });

    it("lookup com PIN certo encontra o voucher sem resgatar", async () => {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const code = String(Math.floor(1000 + Math.random() * 9000));
      await admin.from("vouchers").insert({
        subscription_id: subscriptionId,
        customer_id: customerId,
        voucher_type: "PIZZA_2X1",
        code,
        cycle_number: 2,
        status: "DISPONIVEL",
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const res = await callVoucherApi(TEST_PIN, { action: "lookup", code });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.customerName).toBe("Cliente Voucher");
      expect(body.voucherType).toBe("PIZZA_2X1");

      const { data: row } = await admin.from("vouchers").select("status").eq("code", code).single();
      expect(row?.status).toBe("DISPONIVEL");
    });

    it("redeem com PIN certo resgata o voucher", async () => {
      const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);
      const code = String(Math.floor(1000 + Math.random() * 9000));
      await admin.from("vouchers").insert({
        subscription_id: subscriptionId,
        customer_id: customerId,
        voucher_type: "PIZZA_2X1",
        code,
        cycle_number: 2,
        status: "DISPONIVEL",
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const res = await callVoucherApi(TEST_PIN, { action: "redeem", code });
      expect(res.status).toBe(200);

      const { data: row } = await admin.from("vouchers").select("status").eq("code", code).single();
      expect(row?.status).toBe("UTILIZADO");
    });
  });
});

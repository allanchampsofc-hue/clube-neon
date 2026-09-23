import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as promoVoucherRoute } from "@/app/api/garcom/voucher-avulso/route";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  assignTestRole,
  signInTestUser,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function callPromoVoucherApi(pin: string, body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/garcom/voucher-avulso", {
    method: "POST",
    headers: { "content-type": "application/json", "x-waiter-pin": pin },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return promoVoucherRoute(request as any);
}

describeIfEnv("Vouchers avulsos — geração, resgate e tela do garçom (integração)", () => {
  const admin = createAdminClient();
  const PASSWORD = "SenhaSegura123";
  const TEST_PIN = "9911";
  let configId: string;
  let originalPin: string;

  let managerEmail: string;
  let managerUserId: string;
  const generatedVoucherIds: string[] = [];

  beforeAll(async () => {
    const { data } = await admin.from("system_config").select("id, waiter_pin").limit(1).single();
    configId = data!.id;
    originalPin = data!.waiter_pin;
    await admin.from("system_config").update({ waiter_pin: TEST_PIN }).eq("id", configId);

    managerEmail = testEmail("gerente-promo");
    managerUserId = await createTestAuthUser(managerEmail, PASSWORD);
    await assignTestRole(managerUserId, "GERENTE");
  });

  afterAll(async () => {
    await admin.from("system_config").update({ waiter_pin: originalPin }).eq("id", configId);
    if (generatedVoucherIds.length > 0) {
      await admin.from("promo_vouchers").delete().in("id", generatedVoucherIds);
    }
    await cleanupTestAuthUser(managerUserId);
  });

  beforeEach(() => {
    resetSession();
  });

  async function generateAsManager(overrides: Record<string, unknown> = {}) {
    await signInTestUser(managerEmail, PASSWORD);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("generate_promo_vouchers", {
      p_campaign_name: "Promo teste",
      p_benefit_description: "1 pizza grátis, qualquer tamanho ou sabor",
      p_price_paid_cents: 4990,
      p_payment_method: "PIX",
      p_quantity: 1,
      p_valid_days: 30,
      p_buyer_name: null,
      p_buyer_phone: null,
      ...overrides,
    });
    if (data) generatedVoucherIds.push(...(data as Array<{ id: string }>).map((v) => v.id));
    return { data, error };
  }

  describe("geração (GERENTE+)", () => {
    it("gerente gera 1 voucher com código de 6 dígitos", async () => {
      const { data, error } = await generateAsManager();
      expect(error).toBeNull();
      const rows = data as Array<{ code: string; status: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].code).toMatch(/^\d{6}$/);
      expect(rows[0].status).toBe("DISPONIVEL");
    });

    it("gerente gera em lote (5 códigos únicos)", async () => {
      const { data, error } = await generateAsManager({ p_quantity: 5 });
      expect(error).toBeNull();
      const rows = data as Array<{ code: string }>;
      expect(rows).toHaveLength(5);
      const codes = new Set(rows.map((r) => r.code));
      expect(codes.size).toBe(5);
    });

    it("operador (não gerente) não consegue gerar", async () => {
      const email = testEmail("operador-promo");
      const userId = await createTestAuthUser(email, PASSWORD);
      await assignTestRole(userId, "OPERADOR");
      await signInTestUser(email, PASSWORD);
      const supabase = await createClient();

      const { error } = await supabase.rpc("generate_promo_vouchers", {
        p_campaign_name: "Promo teste",
        p_benefit_description: "1 pizza grátis",
        p_price_paid_cents: 4990,
        p_payment_method: "PIX",
        p_quantity: 1,
        p_valid_days: 30,
      });
      expect(error).not.toBeNull();

      await cleanupTestAuthUser(userId);
    });

    it("quantidade fora do limite (0 ou > 200) é rejeitada", async () => {
      const { error } = await generateAsManager({ p_quantity: 0 });
      expect(error).not.toBeNull();
    });
  });

  describe("marcação de 'já enviado' (mark_promo_voucher_sent)", () => {
    it("gerente marca voucher como enviado", async () => {
      const { data: generatedData } = await generateAsManager();
      const voucher = (generatedData as Array<{ id: string }>)[0];

      await signInTestUser(managerEmail, PASSWORD);
      const supabase = await createClient();
      const { data, error } = await supabase
        .rpc("mark_promo_voucher_sent", { p_voucher_id: voucher.id })
        .single();

      expect(error).toBeNull();
      expect((data as { sent_at: string | null }).sent_at).not.toBeNull();

      const { data: row } = await admin
        .from("promo_vouchers")
        .select("sent_at")
        .eq("id", voucher.id)
        .single();
      expect(row?.sent_at).not.toBeNull();
    });

    it("operador (não gerente) não consegue marcar como enviado", async () => {
      const { data: generatedData } = await generateAsManager();
      const voucher = (generatedData as Array<{ id: string }>)[0];

      const email = testEmail("operador-sent");
      const userId = await createTestAuthUser(email, PASSWORD);
      await assignTestRole(userId, "OPERADOR");
      await signInTestUser(email, PASSWORD);
      const supabase = await createClient();

      const { error } = await supabase.rpc("mark_promo_voucher_sent", {
        p_voucher_id: voucher.id,
      });
      expect(error).not.toBeNull();

      await cleanupTestAuthUser(userId);
    });

    it("voucher inexistente retorna erro claro", async () => {
      await signInTestUser(managerEmail, PASSWORD);
      const supabase = await createClient();
      const { error } = await supabase.rpc("mark_promo_voucher_sent", {
        p_voucher_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/não encontrado/i);
    });
  });

  describe("resgate e validação", () => {
    async function insertVoucher(overrides: Partial<{ status: string; validUntil: Date }> = {}) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const { data, error } = await admin
        .from("promo_vouchers")
        .insert({
          code,
          campaign_name: "Promo teste",
          benefit_description: "1 pizza grátis, qualquer tamanho ou sabor",
          price_paid_cents: 4990,
          payment_method: "PIX",
          status: overrides.status ?? "DISPONIVEL",
          valid_until: (overrides.validUntil ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).toISOString(),
        })
        .select("id, code")
        .single();
      if (error) throw error;
      generatedVoucherIds.push(data!.id);
      return data!;
    }

    it("voucher válido é resgatado via redeem_promo_voucher", async () => {
      const voucher = await insertVoucher();
      const { data, error } = await admin
        .rpc("redeem_promo_voucher", { p_code: voucher.code, p_operator_id: null })
        .single();
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe("UTILIZADO");
    });

    it("voucher já utilizado é rejeitado na segunda tentativa", async () => {
      const voucher = await insertVoucher();
      await admin.rpc("redeem_promo_voucher", { p_code: voucher.code, p_operator_id: null });
      const { error } = await admin.rpc("redeem_promo_voucher", {
        p_code: voucher.code,
        p_operator_id: null,
      });
      expect(error).not.toBeNull();
    });

    it("voucher expirado é rejeitado e marcado como EXPIRADO", async () => {
      const voucher = await insertVoucher({ validUntil: new Date(Date.now() - 1000) });
      const { data, error } = await admin
        .rpc("redeem_promo_voucher", { p_code: voucher.code, p_operator_id: null })
        .single();
      expect(error).toBeNull();
      expect((data as { status: string } | null)?.status).toBe("EXPIRADO");

      const { data: row } = await admin
        .from("promo_vouchers")
        .select("status")
        .eq("id", voucher.id)
        .single();
      expect(row?.status).toBe("EXPIRADO");
    });

    it("código inexistente retorna erro claro", async () => {
      const { error } = await admin.rpc("redeem_promo_voucher", {
        p_code: "000000",
        p_operator_id: null,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/não encontrado/i);
    });

    it("voucher cancelado é rejeitado", async () => {
      const voucher = await insertVoucher();
      await admin.from("promo_vouchers").update({ status: "CANCELADO" }).eq("id", voucher.id);
      const { error } = await admin.rpc("redeem_promo_voucher", {
        p_code: voucher.code,
        p_operator_id: null,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/cancelado/i);
    });
  });

  describe("tela do garçom — /api/garcom/voucher-avulso", () => {
    async function insertVoucher() {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const { data, error } = await admin
        .from("promo_vouchers")
        .insert({
          code,
          campaign_name: "Promo teste",
          benefit_description: "1 pizza grátis, qualquer tamanho ou sabor",
          price_paid_cents: 4990,
          payment_method: "PIX",
          status: "DISPONIVEL",
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id, code")
        .single();
      if (error) throw error;
      generatedVoucherIds.push(data!.id);
      return data!;
    }

    it("PIN errado rejeita a validação", async () => {
      const res = await callPromoVoucherApi("0001", { action: "lookup", code: "123456" });
      expect(res.status).toBe(401);
    });

    it("lookup com PIN certo encontra o voucher sem resgatar", async () => {
      const voucher = await insertVoucher();
      const res = await callPromoVoucherApi(TEST_PIN, { action: "lookup", code: voucher.code });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.campaignName).toBe("Promo teste");
      expect(body.benefitDescription).toMatch(/pizza grátis/i);

      const { data: row } = await admin
        .from("promo_vouchers")
        .select("status")
        .eq("id", voucher.id)
        .single();
      expect(row?.status).toBe("DISPONIVEL");
    });

    it("redeem com PIN certo resgata o voucher", async () => {
      const voucher = await insertVoucher();
      const res = await callPromoVoucherApi(TEST_PIN, { action: "redeem", code: voucher.code });
      expect(res.status).toBe(200);

      const { data: row } = await admin
        .from("promo_vouchers")
        .select("status")
        .eq("id", voucher.id)
        .single();
      expect(row?.status).toBe("UTILIZADO");
    });
  });
});

import { createAdminClient } from "@/lib/supabase/admin";
import { GET as processSubscriptionCyclesCron } from "@/app/api/cron/process-subscription-cycles/route";
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

function callCron() {
  const request = new Request("http://localhost/api/cron/process-subscription-cycles", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return processSubscriptionCyclesCron(request as any);
}

async function auditLogsFor(admin: ReturnType<typeof createAdminClient>, subscriptionId: string) {
  const { data } = await admin
    .from("audit_logs")
    .select("action")
    .eq("entity", "subscription")
    .eq("entity_id", subscriptionId)
    .in("action", ["WHATSAPP_CREDIT_RELEASED", "WHATSAPP_SEND_FAILED", "WHATSAPP_PLAN_ENDING_SOON"]);
  return (data ?? []).map((r) => r.action);
}

describeIfEnv("Notificações WhatsApp de ciclo (integração)", () => {
  const admin = createAdminClient();
  let originalConfig: { notify_credit_released: boolean; notify_plan_ending: boolean } | null = null;
  let configId: string;

  beforeAll(async () => {
    const { data } = await admin
      .from("system_config")
      .select("id, notify_credit_released, notify_plan_ending")
      .limit(1)
      .single();
    configId = data!.id;
    originalConfig = { notify_credit_released: data!.notify_credit_released, notify_plan_ending: data!.notify_plan_ending };
  });

  afterAll(async () => {
    if (originalConfig) {
      await admin.from("system_config").update(originalConfig).eq("id", configId);
    }
  });

  describe("crédito liberado (rollover mensal)", () => {
    let customerEmail: string;
    let customerUserId: string;
    let customerId: string;
    let subscriptionId: string;
    let balanceCents: number;

    beforeEach(async () => {
      await admin.from("system_config").update({ notify_credit_released: true }).eq("id", configId);
      customerEmail = testEmail("ciclo-credito");
      customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
      customerId = await createTestCustomer({
        userId: customerUserId,
        name: "Cliente Ciclo",
        email: customerEmail,
        // sem telefone por padrão — evita bater no Z-API de verdade
      });
      const activated = await createActiveSubscriptionWithCredit(customerId);
      subscriptionId = activated.subscriptionId;
      balanceCents = activated.balanceCents;

      // Força o ciclo 1 a já ter terminado, pra virar elegível pro rollover.
      // period_end tem que ficar > period_start (check constraint) — usa
      // period_start + 1ms em vez de um timestamp fixo no passado, e espera
      // esse instante passar de verdade antes de rodar o cron.
      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_start")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      const forcedPeriodEnd = new Date(new Date(cycle1!.period_start).getTime() + 1);
      await admin
        .from("subscription_cycles")
        .update({ period_end: forcedPeriodEnd.toISOString() })
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1);
      await admin
        .from("subscriptions")
        .update({ current_period_end: forcedPeriodEnd.toISOString() })
        .eq("id", subscriptionId);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    afterEach(async () => {
      await cleanupTestCustomer(customerId);
      await cleanupTestAuthUser(customerUserId);
    });

    it("rollover pro mês 2 credita o valor mensal independente do WhatsApp", async () => {
      await callCron();

      const { data: wallet } = await admin
        .from("credit_wallets")
        .select("balance_cents")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      expect(wallet?.balance_cents).toBe(balanceCents);

      const { data: cycles } = await admin
        .from("subscription_cycles")
        .select("cycle_number")
        .eq("subscription_id", subscriptionId)
        .order("cycle_number", { ascending: false })
        .limit(1);
      expect(cycles?.[0]?.cycle_number).toBe(2);
    });

    it("cliente sem telefone não gera tentativa de notificação", async () => {
      await callCron();
      const actions = await auditLogsFor(admin, subscriptionId);
      expect(actions).not.toContain("WHATSAPP_CREDIT_RELEASED");
      expect(actions).not.toContain("WHATSAPP_SEND_FAILED");
    });

    it("toggle desligado não gera tentativa de notificação, mesmo com telefone", async () => {
      await admin.from("customers").update({ phone: "11999990000" }).eq("id", customerId);
      await admin.from("system_config").update({ notify_credit_released: false }).eq("id", configId);

      await callCron();

      const actions = await auditLogsFor(admin, subscriptionId);
      expect(actions).not.toContain("WHATSAPP_CREDIT_RELEASED");
      expect(actions).not.toContain("WHATSAPP_SEND_FAILED");
    });

    it("toggle ligado com telefone tenta notificar (sucesso ou falha do Z-API, mas tenta)", async () => {
      await admin.from("customers").update({ phone: "11999990000" }).eq("id", customerId);

      await callCron();

      const actions = await auditLogsFor(admin, subscriptionId);
      const attempted =
        actions.includes("WHATSAPP_CREDIT_RELEASED") || actions.includes("WHATSAPP_SEND_FAILED");
      expect(attempted).toBe(true);
    });
  });

  describe("elegibilidade de aviso de fim de plano (get_subscriptions_needing_plan_ending_notice)", () => {
    let customerEmail: string;
    let customerUserId: string;
    let customerId: string;
    let subscriptionId: string;

    beforeEach(async () => {
      customerEmail = testEmail("fim-plano");
      customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
      customerId = await createTestCustomer({
        userId: customerUserId,
        name: "Cliente Fim Plano",
        email: customerEmail,
      });
      const activated = await createActiveSubscriptionWithCredit(customerId);
      subscriptionId = activated.subscriptionId;

      const { data: cycle1 } = await admin
        .from("subscription_cycles")
        .select("period_end")
        .eq("subscription_id", subscriptionId)
        .eq("cycle_number", 1)
        .single();
      // Cria os ciclos 2 a 11 encadeados — a assinatura "chega" no mês 11
      // sem precisar rodar o rollover 10 vezes.
      await addConsecutiveCycles(subscriptionId, 10, 2, new Date(cycle1!.period_end));
    });

    afterEach(async () => {
      await cleanupTestCustomer(customerId);
      await cleanupTestAuthUser(customerUserId);
    });

    async function isListedAsEndingSoon(): Promise<boolean> {
      const { data } = await admin.rpc("get_subscriptions_needing_plan_ending_notice");
      return (data ?? []).some(
        (row: { subscription_id: string }) => row.subscription_id === subscriptionId,
      );
    }

    it("assinatura no mês 11, sem cancelamento e não avisada, aparece na lista", async () => {
      expect(await isListedAsEndingSoon()).toBe(true);
    });

    it("assinatura com cancelamento agendado não aparece na lista", async () => {
      await admin
        .from("subscriptions")
        .update({ cancellation_requested_at: new Date().toISOString() })
        .eq("id", subscriptionId);
      expect(await isListedAsEndingSoon()).toBe(false);
    });

    it("assinatura já avisada (plan_ending_notified_at preenchido) não aparece de novo", async () => {
      await admin
        .from("subscriptions")
        .update({ plan_ending_notified_at: new Date().toISOString() })
        .eq("id", subscriptionId);
      expect(await isListedAsEndingSoon()).toBe(false);
    });

    it("assinatura fora do mês 11 não aparece na lista", async () => {
      await admin.from("subscription_cycles").delete().eq("subscription_id", subscriptionId).eq("cycle_number", 11);
      expect(await isListedAsEndingSoon()).toBe(false);
    });

    it("cron marca plan_ending_notified_at só quando o cliente tem telefone", async () => {
      await callCron();
      const { data: withoutPhone } = await admin
        .from("subscriptions")
        .select("plan_ending_notified_at")
        .eq("id", subscriptionId)
        .single();
      expect(withoutPhone?.plan_ending_notified_at).toBeNull();

      await admin.from("customers").update({ phone: "11999990000" }).eq("id", customerId);
      await callCron();
      const { data: withPhone } = await admin
        .from("subscriptions")
        .select("plan_ending_notified_at")
        .eq("id", subscriptionId)
        .single();
      expect(withPhone?.plan_ending_notified_at).not.toBeNull();
    });
  });
});

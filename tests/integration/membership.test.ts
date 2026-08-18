import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  addConsecutiveCycles,
  cleanupTestCustomer,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

describeIfEnv("níveis de membership (integração)", () => {
  const customerIds: string[] = [];

  afterAll(async () => {
    for (const id of customerIds) await cleanupTestCustomer(id);
  });

  beforeEach(() => {
    resetSession();
  });

  it("usuário anônimo não roda update_membership_levels", async () => {
    const supabaseAnon = await createClient();
    const { error } = await supabaseAnon.rpc("update_membership_levels");
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Acesso negado");
  });

  it("cliente com 1 mês continua MEMBRO", async () => {
    const admin = createAdminClient();
    const email = testEmail("membro-1-mes");
    const customerId = await createTestCustomer({ name: "Cliente Um Mês", email });
    customerIds.push(customerId);
    await createActiveSubscriptionWithCredit(customerId);

    const { error } = await admin.rpc("update_membership_levels");
    expect(error).toBeNull();

    const { data: customer } = await admin
      .from("customers")
      .select("membership_level")
      .eq("id", customerId)
      .single();
    expect(customer?.membership_level).toBe("MEMBRO");
  });

  it("cliente com 6 ciclos consecutivos sobe pra OURO e fica registrado no histórico", async () => {
    const admin = createAdminClient();
    const email = testEmail("membro-6-ciclos");
    const customerId = await createTestCustomer({ name: "Cliente Seis Ciclos", email });
    customerIds.push(customerId);
    const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);

    const { data: firstCycle } = await admin
      .from("subscription_cycles")
      .select("period_end")
      .eq("subscription_id", subscriptionId)
      .eq("cycle_number", 1)
      .single();

    await addConsecutiveCycles(subscriptionId, 5, 2, new Date(firstCycle!.period_end));

    const { error } = await admin.rpc("update_membership_levels");
    expect(error).toBeNull();

    const { data: customer } = await admin
      .from("customers")
      .select("membership_level, membership_since")
      .eq("id", customerId)
      .single();
    expect(customer?.membership_level).toBe("OURO");
    expect(customer?.membership_since).toBeTruthy();

    const { data: history } = await admin
      .from("membership_history")
      .select("level")
      .eq("customer_id", customerId)
      .eq("level", "OURO");
    expect(history).toHaveLength(1);
  });

  it("cancelamento reseta o nível pra MEMBRO", async () => {
    const admin = createAdminClient();
    const email = testEmail("membro-cancelado");
    const customerId = await createTestCustomer({ name: "Cliente Cancelado", email });
    customerIds.push(customerId);
    const { subscriptionId } = await createActiveSubscriptionWithCredit(customerId);

    const { data: firstCycle } = await admin
      .from("subscription_cycles")
      .select("period_end")
      .eq("subscription_id", subscriptionId)
      .eq("cycle_number", 1)
      .single();
    await addConsecutiveCycles(subscriptionId, 5, 2, new Date(firstCycle!.period_end));
    const { error: firstError } = await admin.rpc("update_membership_levels");
    expect(firstError).toBeNull();

    const { data: beforeCancel } = await admin
      .from("customers")
      .select("membership_level")
      .eq("id", customerId)
      .single();
    expect(beforeCancel?.membership_level).toBe("OURO");

    await admin.from("subscriptions").update({ status: "CANCELADA" }).eq("id", subscriptionId);
    const { error: secondError } = await admin.rpc("update_membership_levels");
    expect(secondError).toBeNull();

    const { data: afterCancel } = await admin
      .from("customers")
      .select("membership_level")
      .eq("id", customerId)
      .single();
    expect(afterCancel?.membership_level).toBe("MEMBRO");
  });
});

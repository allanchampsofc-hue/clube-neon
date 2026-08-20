import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { captureRedirect } from "next/navigation";
import { requestCancellation } from "@/app/minha-conta/perfil/actions";
import { revertCancellation } from "@/app/painel/assinaturas/actions";
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

describeIfEnv("Cancelamento antecipado de assinatura (integração)", () => {
  const admin = createAdminClient();

  let customerEmail: string;
  let customerUserId: string;
  let customerId: string;
  let subscriptionId: string;

  beforeEach(async () => {
    resetSession();
    customerEmail = testEmail("cancelamento");
    customerUserId = await createTestAuthUser(customerEmail, "SenhaCliente123");
    customerId = await createTestCustomer({
      userId: customerUserId,
      name: "Cliente Cancelamento",
      email: customerEmail,
    });
    const activated = await createActiveSubscriptionWithCredit(customerId);
    subscriptionId = activated.subscriptionId;
    await signInTestUser(customerEmail, "SenhaCliente123");
  });

  afterEach(async () => {
    await cleanupTestCustomer(customerId);
    await cleanupTestAuthUser(customerUserId);
  });

  it("cliente pede cancelamento: assinatura continua ATIVA com data efetiva em ~3 meses", async () => {
    const url = await captureRedirect(() => requestCancellation(new FormData()));
    expect(url).toContain("cancel_success=1");

    const { data: row } = await admin
      .from("subscriptions")
      .select("status, cancellation_effective_at, cancellation_requested_at")
      .eq("id", subscriptionId)
      .single();
    expect(row?.status).toBe("ATIVA");
    expect(row?.cancellation_requested_at).not.toBeNull();

    const effectiveMs = new Date(row!.cancellation_effective_at).getTime();
    const monthsAhead = (effectiveMs - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    expect(monthsAhead).toBeGreaterThan(2.8);
    expect(monthsAhead).toBeLessThan(3.2);
  });

  it("pedir cancelamento duas vezes rejeita a segunda tentativa", async () => {
    await captureRedirect(() => requestCancellation(new FormData()));
    const url = await captureRedirect(() => requestCancellation(new FormData()));
    expect(url).toContain("cancel_error=");
  });

  it("credita o motivo do cancelamento quando informado", async () => {
    const form = new FormData();
    form.set("reason", "Vou mudar de cidade");
    await captureRedirect(() => requestCancellation(form));

    const { data: row } = await admin
      .from("subscriptions")
      .select("cancellation_reason")
      .eq("id", subscriptionId)
      .single();
    expect(row?.cancellation_reason).toBe("Vou mudar de cidade");
  });

  it("staff reverte um cancelamento agendado", async () => {
    await captureRedirect(() => requestCancellation(new FormData()));

    resetSession();
    const staffEmail = testEmail("cancelamento-staff");
    const staffUserId = await createTestAuthUser(staffEmail, "SenhaStaff123");
    await assignTestRole(staffUserId, "GERENTE");
    await signInTestUser(staffEmail, "SenhaStaff123");

    const url = await captureRedirect(() =>
      revertCancellation("/painel/assinaturas", subscriptionId),
    );
    expect(url).toContain("success=1");

    const { data: row } = await admin
      .from("subscriptions")
      .select("cancellation_effective_at, cancellation_requested_at")
      .eq("id", subscriptionId)
      .single();
    expect(row?.cancellation_effective_at).toBeNull();
    expect(row?.cancellation_requested_at).toBeNull();

    await admin.from("user_roles").delete().eq("user_id", staffUserId);
    await admin.auth.admin.deleteUser(staffUserId);
  });

  it("cliente não consegue reverter o próprio cancelamento (só staff pode)", async () => {
    await captureRedirect(() => requestCancellation(new FormData()));

    const supabase = await createClient();
    const { error } = await supabase.rpc("revert_subscription_cancellation", {
      p_subscription_id: subscriptionId,
    });
    expect(error).not.toBeNull();
  });

  it("process_scheduled_cancellations encerra assinaturas cuja data efetiva já passou", async () => {
    await captureRedirect(() => requestCancellation(new FormData()));
    await admin
      .from("subscriptions")
      .update({ cancellation_effective_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", subscriptionId);

    const { data: count, error } = await admin.rpc("process_scheduled_cancellations");
    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(1);

    const { data: row } = await admin
      .from("subscriptions")
      .select("status")
      .eq("id", subscriptionId)
      .single();
    expect(row?.status).toBe("CANCELADA");
  });

  it("process_scheduled_cancellations não é chamável fora de service_role", async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("process_scheduled_cancellations");
    expect(error).not.toBeNull();
  });

  it("cancelamento à vista: sem multa, sem data efetiva — segue até o fim natural do contrato", async () => {
    await admin.from("subscriptions").update({ payment_type: "ANNUAL" }).eq("id", subscriptionId);

    const url = await captureRedirect(() => requestCancellation(new FormData()));
    expect(url).toContain("cancel_success=1");

    const { data: row } = await admin
      .from("subscriptions")
      .select("status, payment_type, cancellation_requested_at, cancellation_effective_at")
      .eq("id", subscriptionId)
      .single();
    expect(row?.status).toBe("ATIVA");
    expect(row?.cancellation_requested_at).not.toBeNull();
    expect(row?.cancellation_effective_at).toBeNull();
  });

  it("process_scheduled_cancellations ignora cancelamento à vista (sem data efetiva)", async () => {
    await admin.from("subscriptions").update({ payment_type: "ANNUAL" }).eq("id", subscriptionId);
    await captureRedirect(() => requestCancellation(new FormData()));

    await admin.rpc("process_scheduled_cancellations");

    const { data: row } = await admin
      .from("subscriptions")
      .select("status")
      .eq("id", subscriptionId)
      .single();
    expect(row?.status).toBe("ATIVA");
  });
});

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  assignTestRole,
  signInTestUser,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function todayAsBirthDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `1990-${month}-${day}`;
}

describeIfEnv("aniversário via WhatsApp (integração)", () => {
  const customerIds: string[] = [];
  const PASSWORD = "SenhaOperador123";
  let staffEmail: string;
  let staffUserId: string;

  beforeAll(async () => {
    staffEmail = testEmail("staff-aniversariantes");
    staffUserId = await createTestAuthUser(staffEmail, PASSWORD);
    await assignTestRole(staffUserId, "OPERADOR");
  });

  afterAll(async () => {
    for (const id of customerIds) await cleanupTestCustomer(id);
    await cleanupTestAuthUser(staffUserId);
  });

  beforeEach(() => {
    resetSession();
  });

  it("usuário anônimo não chama get_todays_birthdays nem get_birthdays_this_month", async () => {
    const supabaseAnon = await createClient();
    const { error: error1 } = await supabaseAnon.rpc("get_todays_birthdays");
    expect(error1).toBeTruthy();
    expect(error1!.message).toContain("Acesso negado");

    const { error: error2 } = await supabaseAnon.rpc("get_birthdays_this_month");
    expect(error2).toBeTruthy();
    expect(error2!.message).toContain("Acesso negado");
  });

  it("cliente ativo que faz aniversário hoje aparece em get_todays_birthdays e get_birthdays_this_month", async () => {
    const admin = createAdminClient();
    const email = testEmail("aniversario-hoje");
    const customerId = await createTestCustomer({
      name: "Cliente Aniversariante",
      email,
      phone: "11999998888",
      birthDate: todayAsBirthDate(),
    });
    customerIds.push(customerId);
    await createActiveSubscriptionWithCredit(customerId);

    const { data: todays } = await admin.rpc("get_todays_birthdays");
    const todaysIds = (todays ?? []).map((r: { customer_id: string }) => r.customer_id);
    expect(todaysIds).toContain(customerId);

    await signInTestUser(staffEmail, PASSWORD);
    const supabaseAsStaff = await createClient();
    const { data: thisMonth, error: thisMonthError } = await supabaseAsStaff.rpc(
      "get_birthdays_this_month",
    );
    expect(thisMonthError).toBeNull();
    const monthIds = (thisMonth ?? []).map((r: { customer_id: string }) => r.customer_id);
    expect(monthIds).toContain(customerId);
  });

  it("cliente já notificado neste ano some de get_todays_birthdays", async () => {
    const admin = createAdminClient();
    const email = testEmail("aniversario-ja-notificado");
    const customerId = await createTestCustomer({
      name: "Cliente Já Notificado",
      email,
      phone: "11999998888",
      birthDate: todayAsBirthDate(),
    });
    customerIds.push(customerId);
    await createActiveSubscriptionWithCredit(customerId);

    const year = new Date().getFullYear();
    const { error: insertError } = await admin.from("birthday_notifications").insert({
      customer_id: customerId,
      year,
      sent_at: new Date().toISOString(),
      status: "SENT",
    });
    expect(insertError).toBeNull();

    const { data: todays } = await admin.rpc("get_todays_birthdays");
    const todaysIds = (todays ?? []).map((r: { customer_id: string }) => r.customer_id);
    expect(todaysIds).not.toContain(customerId);

    const { error: duplicateError } = await admin.from("birthday_notifications").insert({
      customer_id: customerId,
      year,
      status: "SENT",
    });
    expect(duplicateError).toBeTruthy();
  });
});

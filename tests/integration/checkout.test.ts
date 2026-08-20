import { checkout } from "@/app/checkout-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureRedirect } from "next/navigation";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function checkoutFormData(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const defaults: Record<string, string> = {
    name: "Cliente de Teste",
    email: testEmail("checkout"),
    phone: "11999998888",
    cpf: "",
    password: "SenhaForte123",
    confirm_password: "SenhaForte123",
    payment_type: "ANNUAL",
    terms: "on",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    form.set(key, value);
  }
  return form;
}

describeIfEnv("checkout (integração)", () => {
  const createdEmails: string[] = [];

  beforeEach(() => {
    resetSession();
  });

  afterAll(async () => {
    const admin = createAdminClient();
    for (const email of createdEmails) {
      const { data: customer } = await admin
        .from("customers")
        .select("id, user_id")
        .eq("email", email)
        .maybeSingle();
      if (customer) {
        await cleanupTestCustomer(customer.id);
        if (customer.user_id) await cleanupTestAuthUser(customer.user_id);
      }
    }
  });

  it("com e-mail novo cria usuário + customer + subscription PENDENTE", async () => {
    const email = testEmail("novo");
    createdEmails.push(email);
    const form = checkoutFormData({ email });

    const url = await captureRedirect(() => checkout(form));
    expect(url).toBe("/minha-conta?pending=1");

    const admin = createAdminClient();
    const { data: customer } = await admin
      .from("customers")
      .select("id, user_id")
      .eq("email", email)
      .single();
    expect(customer).toBeTruthy();
    expect(customer.user_id).toBeTruthy();

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status")
      .eq("customer_id", customer.id)
      .single();
    expect(subscription.status).toBe("PENDENTE");
  });

  it("com pagamento à vista, grava annual_payment_amount_cents a partir de system_config", async () => {
    const email = testEmail("avista");
    createdEmails.push(email);
    const form = checkoutFormData({ email, payment_type: "ANNUAL" });

    await captureRedirect(() => checkout(form));

    const admin = createAdminClient();
    const { data: config } = await admin
      .from("system_config")
      .select("annual_price_cents")
      .limit(1)
      .single();
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("email", email)
      .single();
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("payment_type, annual_payment_amount_cents")
      .eq("customer_id", customer.id)
      .single();

    expect(subscription.payment_type).toBe("ANNUAL");
    expect(subscription.annual_payment_amount_cents).toBe(config!.annual_price_cents);
  });

  it("com pagamento parcelado, não grava annual_payment_amount_cents", async () => {
    const email = testEmail("parcelado");
    createdEmails.push(email);
    const form = checkoutFormData({ email, payment_type: "MONTHLY" });

    await captureRedirect(() => checkout(form));

    const admin = createAdminClient();
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("email", email)
      .single();
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("payment_type, annual_payment_amount_cents")
      .eq("customer_id", customer.id)
      .single();

    expect(subscription.payment_type).toBe("MONTHLY");
    expect(subscription.annual_payment_amount_cents).toBeNull();
  });

  it("sem escolher forma de pagamento retorna erro de validação", async () => {
    const form = checkoutFormData();
    form.delete("payment_type");
    const url = await captureRedirect(() => checkout(form));

    expect(url).toContain("checkout_error=");
    expect(decodeURIComponent(url)).toContain("forma de pagamento");
  });

  it("com e-mail já existente retorna erro de duplicidade", async () => {
    const email = testEmail("duplicado");
    createdEmails.push(email);

    const first = checkoutFormData({ email });
    await captureRedirect(() => checkout(first));

    resetSession();
    const second = checkoutFormData({ email, password: "OutraSenha123", confirm_password: "OutraSenha123" });
    const url = await captureRedirect(() => checkout(second));

    expect(url).toContain("checkout_error=");
    expect(decodeURIComponent(url)).toContain("já está cadastrado");
  });

  it("com senha fraca (menos de 8 caracteres) retorna erro de validação", async () => {
    const form = checkoutFormData({ password: "123", confirm_password: "123" });
    const url = await captureRedirect(() => checkout(form));

    expect(url).toContain("checkout_error=");
    expect(decodeURIComponent(url)).toContain("8 caracteres");
  });

  it("sem nome retorna erro de validação", async () => {
    const form = checkoutFormData({ name: "" });
    const url = await captureRedirect(() => checkout(form));

    expect(url).toContain("checkout_error=");
    expect(decodeURIComponent(url)).toContain("nome");
  });
});

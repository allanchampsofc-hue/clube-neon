"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validations/checkout";

function friendlyConflictMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    if (error.message.includes("email")) return "Esse e-mail já está cadastrado. Faça login.";
    if (error.message.includes("cpf")) return "Esse CPF já está cadastrado.";
    if (error.message.includes("user_id")) return "Você já tem uma conta. Faça login.";
    return "Esses dados já estão cadastrados.";
  }
  return error.message;
}

/**
 * Checkout mock (ETAPA 15) — sem Stripe ainda. Cria a conta, o cliente e a
 * assinatura como PENDENTE; a liberação de crédito só acontece quando
 * activate_subscription rodar de verdade (staff hoje, webhook Stripe na
 * ETAPA 20 — o checkout não muda quando isso acontecer, só o gatilho).
 */
export async function checkout(formData: FormData) {
  const parsed = checkoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    cpf: formData.get("cpf") || null,
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
    payment_type: formData.get("payment_type"),
    terms: formData.get("terms") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/?checkout_error=${encodeURIComponent(message)}#checkout`);
  }

  const { name, email, phone, cpf, password, payment_type } = parsed.data;
  const refCode = String(formData.get("ref") ?? "").trim() || null;
  const supabase = await createClient();

  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingCustomer) {
    redirect(
      `/?checkout_error=${encodeURIComponent("Esse e-mail já está cadastrado. Faça login.")}#checkout`,
    );
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (signUpError || !signUpData.user) {
    const message =
      signUpError?.code === "user_already_exists"
        ? "Esse e-mail já está cadastrado. Faça login."
        : (signUpError?.message ?? "Não foi possível criar sua conta.");
    redirect(`/?checkout_error=${encodeURIComponent(message)}#checkout`);
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      user_id: signUpData.user.id,
      name,
      email,
      phone,
      cpf,
    })
    .select("id")
    .single();

  if (customerError) {
    redirect(
      `/?checkout_error=${encodeURIComponent(friendlyConflictMessage(customerError))}#checkout`,
    );
  }

  await supabase.rpc("log_audit_event", {
    p_action: "CUSTOMER_CREATED",
    p_entity: "customer",
    p_entity_id: customer.id,
    p_after_state: { name, email, phone, cpf },
  });

  if (refCode) {
    const { data: referrerId } = await supabase.rpc("lookup_referrer_by_code", {
      p_code: refCode,
    });
    if (referrerId) {
      await supabase.from("referrals").insert({
        referrer_customer_id: referrerId,
        referred_customer_id: customer.id,
        referral_code: refCode,
      });
    }
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    redirect(
      `/?checkout_error=${encodeURIComponent("Nenhum plano disponível no momento — fale com a gente.")}#checkout`,
    );
  }

  let annualPaymentAmountCents: number | null = null;
  if (payment_type === "ANNUAL") {
    const { data: config } = await supabase
      .from("system_config")
      .select("annual_price_cents")
      .limit(1)
      .maybeSingle();
    annualPaymentAmountCents = config?.annual_price_cents ?? 49900;
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .insert({
      customer_id: customer.id,
      plan_id: plan.id,
      payment_type,
      annual_payment_amount_cents: annualPaymentAmountCents,
    })
    .select("id")
    .single();

  if (subscriptionError) {
    redirect(`/?checkout_error=${encodeURIComponent(subscriptionError.message)}#checkout`);
  }

  await supabase.rpc("log_audit_event", {
    p_action: "SUBSCRIPTION_CREATED",
    p_entity: "subscription",
    p_entity_id: subscription.id,
    p_after_state: {
      status: "PENDENTE",
      plan_id: plan.id,
      payment_type,
      annual_payment_amount_cents: annualPaymentAmountCents,
    },
  });

  // Se o projeto Supabase exige confirmação de e-mail, signUp não retorna
  // sessão — não dá pra logar automaticamente ainda, então manda confirmar.
  if (!signUpData.session) {
    redirect(
      `/?checkout_error=${encodeURIComponent("Conta criada! Confirme seu e-mail e depois faça login.")}#checkout`,
    );
  }

  await supabase.rpc("log_auth_event", { p_action: "CHECKOUT" });

  redirect("/minha-conta?pending=1");
}

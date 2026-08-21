"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { planFormSchema, reaisToCents } from "@/lib/validations/plan";
import { getRequestIp } from "@/lib/request-ip";

export async function updatePlan(planId: string, formData: FormData) {
  await requireSuperAdmin();

  const parsed = planFormSchema.safeParse({
    name: formData.get("name"),
    price_reais: formData.get("price_reais"),
    annual_price_reais: formData.get("annual_price_reais"),
    monthly_credit_reais: formData.get("monthly_credit_reais"),
    duration_months: formData.get("duration_months"),
    grace_period_months: formData.get("grace_period_months"),
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/sistema?error=${encodeURIComponent(message)}`);
  }

  const {
    name,
    price_reais,
    annual_price_reais,
    monthly_credit_reais,
    duration_months,
    grace_period_months,
    active,
  } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({
      name,
      price_cents: reaisToCents(price_reais),
      annual_price_cents: reaisToCents(annual_price_reais),
      monthly_credit_cents: reaisToCents(monthly_credit_reais),
      duration_months,
      grace_period_months,
      active,
    })
    .eq("id", planId);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

export async function updateMembershipMessages(formData: FormData) {
  await requireSuperAdmin();

  const ouroMessage = String(formData.get("membership_ouro_message") ?? "").trim();
  const blackMessage = String(formData.get("membership_black_message") ?? "").trim();

  if (!ouroMessage || !blackMessage) {
    redirect(
      `/painel/sistema?error=${encodeURIComponent("Preencha as duas mensagens de nível.")}`,
    );
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error: updateError } = await supabase
    .from("system_config")
    .update({
      membership_ouro_message: ouroMessage,
      membership_black_message: blackMessage,
    })
    .eq("id", config!.id);

  if (updateError) {
    redirect(`/painel/sistema?error=${encodeURIComponent(updateError.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

export async function updateBirthdayConfig(formData: FormData) {
  await requireSuperAdmin();

  const birthdayMessage = String(formData.get("birthday_message") ?? "").trim();
  const birthdayGift = String(formData.get("birthday_gift") ?? "").trim();

  if (!birthdayMessage || !birthdayGift) {
    redirect(
      `/painel/sistema?error=${encodeURIComponent("Preencha a mensagem e o mimo de aniversário.")}`,
    );
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error } = await supabase
    .from("system_config")
    .update({ birthday_message: birthdayMessage, birthday_gift: birthdayGift })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

export async function updateCashbackConfig(formData: FormData) {
  await requireSuperAdmin();

  const percentage = Number(formData.get("cashback_percentage"));
  const maxReais = Number(formData.get("cashback_max_reais"));
  const enabled = formData.get("cashback_enabled") === "on";

  if (
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100 ||
    !Number.isFinite(maxReais) ||
    maxReais < 0
  ) {
    redirect(`/painel/sistema?error=${encodeURIComponent("Valores de cashback inválidos.")}`);
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error } = await supabase
    .from("system_config")
    .update({
      cashback_percentage: Math.round(percentage),
      cashback_max_cents: reaisToCents(maxReais),
      cashback_enabled: enabled,
    })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

// updatePricingConfig (system_config.monthly_price_cents/annual_price_cents)
// foi removida — pricing agora é por plano (plans.price_cents/
// annual_price_cents, editado no card "Planos" acima). As colunas antigas
// em system_config ficam sem uso no banco (não removidas, é só uma
// migration a mais sem ganho real), mas nada mais lê/escreve nelas.

export async function updateCycleNotificationsConfig(formData: FormData) {
  await requireSuperAdmin();

  const notifyCreditReleased = formData.get("notify_credit_released") === "on";
  const creditReleasedMessage = String(formData.get("credit_released_message") ?? "").trim();
  const notifyPlanEnding = formData.get("notify_plan_ending") === "on";
  const planEndingMessage = String(formData.get("plan_ending_message") ?? "").trim();

  if (!creditReleasedMessage || !planEndingMessage) {
    redirect(`/painel/sistema?error=${encodeURIComponent("Preencha as duas mensagens.")}`);
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error } = await supabase
    .from("system_config")
    .update({
      notify_credit_released: notifyCreditReleased,
      credit_released_message: creditReleasedMessage,
      notify_plan_ending: notifyPlanEnding,
      plan_ending_message: planEndingMessage,
    })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

export async function updateWaiterPin(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const pin = String(formData.get("waiter_pin") ?? "").trim();

  if (!/^\d{4}$/.test(pin)) {
    redirect(`/painel/sistema?error=${encodeURIComponent("O PIN precisa ter exatamente 4 dígitos numéricos.")}`);
  }
  if (pin === "0000") {
    redirect(`/painel/sistema?error=${encodeURIComponent("0000 é reservado — escolha outro PIN.")}`);
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error } = await supabase
    .from("system_config")
    .update({ waiter_pin: pin })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.rpc("log_audit_event", {
    p_action: "WAITER_PIN_CHANGED",
    p_entity: "system_config",
    p_entity_id: config!.id,
    p_after_state: { changed_by: user.id },
    p_ip_address: await getRequestIp(),
  });

  redirect("/painel/sistema?success=1");
}

export async function updateSurveyConfig(formData: FormData) {
  await requireSuperAdmin();

  const surveyMessage = String(formData.get("survey_message") ?? "").trim();
  const enabled = formData.get("survey_enabled") === "on";

  if (!surveyMessage) {
    redirect(`/painel/sistema?error=${encodeURIComponent("Informe a mensagem da pesquisa.")}`);
  }

  const supabase = await createClient();
  const { data: config } = await supabase.from("system_config").select("id").limit(1).single();

  const { error } = await supabase
    .from("system_config")
    .update({ survey_message: surveyMessage, survey_enabled: enabled })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sistema?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sistema?success=1");
}

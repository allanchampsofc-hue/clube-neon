"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { planFormSchema, reaisToCents } from "@/lib/validations/plan";

export async function updatePlan(planId: string, formData: FormData) {
  await requireSuperAdmin();

  const parsed = planFormSchema.safeParse({
    name: formData.get("name"),
    price_reais: formData.get("price_reais"),
    monthly_credit_reais: formData.get("monthly_credit_reais"),
    duration_months: formData.get("duration_months"),
    grace_period_months: formData.get("grace_period_months"),
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/sistema?error=${encodeURIComponent(message)}`);
  }

  const { name, price_reais, monthly_credit_reais, duration_months, grace_period_months, active } =
    parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({
      name,
      price_cents: reaisToCents(price_reais),
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

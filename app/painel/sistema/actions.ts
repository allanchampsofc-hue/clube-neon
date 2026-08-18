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

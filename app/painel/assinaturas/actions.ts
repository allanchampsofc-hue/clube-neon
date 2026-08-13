"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

export async function createSubscription(customerId: string) {
  await requireStaff();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customerId)
    .in("status", ["PENDENTE", "ATIVA"])
    .maybeSingle();

  if (existing) {
    redirect(
      `/painel/clientes/${customerId}?error=${encodeURIComponent(
        "Esse cliente já tem uma assinatura pendente ou ativa.",
      )}`,
    );
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
      `/painel/clientes/${customerId}?error=${encodeURIComponent(
        "Nenhum plano ativo cadastrado — configure em /painel/sistema.",
      )}`,
    );
  }

  const { error } = await supabase
    .from("subscriptions")
    .insert({ customer_id: customerId, plan_id: plan.id });

  if (error) {
    redirect(
      `/painel/clientes/${customerId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(`/painel/clientes/${customerId}?success=1`);
}

export async function activateSubscription(
  redirectTo: string,
  subscriptionId: string,
) {
  await requireStaff();
  const supabase = await createClient();

  const { error } = await supabase.rpc("activate_subscription", {
    p_subscription_id: subscriptionId,
  });

  if (error) {
    redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${redirectTo}?success=1`);
}

async function setSubscriptionStatus(
  redirectTo: string,
  subscriptionId: string,
  status: "CANCELADA" | "SUSPENSA" | "ATIVA",
) {
  await requireStaff();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "CANCELADA") {
    patch.cancel_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(patch)
    .eq("id", subscriptionId);

  if (error) {
    redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${redirectTo}?success=1`);
}

export async function cancelSubscription(
  redirectTo: string,
  subscriptionId: string,
) {
  return setSubscriptionStatus(redirectTo, subscriptionId, "CANCELADA");
}

export async function suspendSubscription(
  redirectTo: string,
  subscriptionId: string,
) {
  return setSubscriptionStatus(redirectTo, subscriptionId, "SUSPENSA");
}

export async function resumeSubscription(
  redirectTo: string,
  subscriptionId: string,
) {
  return setSubscriptionStatus(redirectTo, subscriptionId, "ATIVA");
}

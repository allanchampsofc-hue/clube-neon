"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/auth";

export async function changeOwnPassword(formData: FormData) {
  const { user } = await requireCustomer();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword) {
    redirect(`/minha-conta/perfil?pwd_error=${encodeURIComponent("Preencha todos os campos.")}`);
  }

  if (newPassword.length < 8) {
    redirect(
      `/minha-conta/perfil?pwd_error=${encodeURIComponent("A nova senha precisa ter pelo menos 8 caracteres.")}`,
    );
  }

  if (newPassword !== confirmPassword) {
    redirect(
      `/minha-conta/perfil?pwd_error=${encodeURIComponent("A confirmação não confere com a nova senha.")}`,
    );
  }

  if (newPassword === currentPassword) {
    redirect(
      `/minha-conta/perfil?pwd_error=${encodeURIComponent("A nova senha precisa ser diferente da atual.")}`,
    );
  }

  const supabase = await createClient();

  // Confere a senha atual antes de trocar — sem isso, quem pegasse a
  // sessão já aberta (computador compartilhado, celular emprestado)
  // trocaria a senha e tomaria a conta sem nunca saber a senha original.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });

  if (signInError) {
    redirect(
      `/minha-conta/perfil?pwd_error=${encodeURIComponent("Senha atual incorreta.")}`,
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    redirect(`/minha-conta/perfil?pwd_error=${encodeURIComponent(updateError.message)}`);
  }

  await supabase.rpc("log_auth_event", { p_action: "PASSWORD_CHANGED" });

  redirect("/minha-conta/perfil?pwd_success=1");
}

export async function requestCancellation(formData: FormData) {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("status", "ATIVA")
    .maybeSingle();

  if (!subscription) {
    redirect(
      `/minha-conta/perfil?cancel_error=${encodeURIComponent("Nenhuma assinatura ativa encontrada.")}`,
    );
  }

  const reason = String(formData.get("reason") ?? "").trim() || null;

  const { error } = await supabase.rpc("request_subscription_cancellation", {
    p_subscription_id: subscription.id,
    p_reason: reason,
  });

  if (error) {
    redirect(`/minha-conta/perfil?cancel_error=${encodeURIComponent(error.message)}`);
  }

  redirect("/minha-conta/perfil?cancel_success=1");
}

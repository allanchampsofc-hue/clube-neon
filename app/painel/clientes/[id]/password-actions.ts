"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import { getRequestIp } from "@/lib/request-ip";

/**
 * Redefinição de senha feita pela equipe, para o cliente que esqueceu a
 * própria senha. É a alternativa segura ao "digite seu e-mail e uma senha
 * nova" — aqui alguém da equipe confere quem é a pessoa (nome, CPF,
 * número de membro) antes de trocar, e a ação fica registrada em
 * audit_logs com o operador que fez.
 *
 * Restrito a GERENTE+ de propósito: trocar a senha de alguém é, na
 * prática, poder entrar na conta dessa pessoa.
 */
export async function resetCustomerPassword(customerId: string, formData: FormData) {
  const { user } = await requireManager();

  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const redirectTo = `/painel/clientes/${customerId}`;

  if (newPassword.length < 8) {
    redirect(
      `${redirectTo}?pwd_error=${encodeURIComponent("A senha precisa ter pelo menos 8 caracteres.")}`,
    );
  }

  if (newPassword !== confirmPassword) {
    redirect(
      `${redirectTo}?pwd_error=${encodeURIComponent("A confirmação não confere com a nova senha.")}`,
    );
  }

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("user_id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer?.user_id) {
    redirect(
      `${redirectTo}?pwd_error=${encodeURIComponent("Esse cliente não tem login vinculado — não há senha pra redefinir.")}`,
    );
  }

  // updateUserById exige service_role: é a única forma de trocar a senha
  // de outra pessoa sem a senha atual dela.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(customer.user_id, {
    password: newPassword,
  });

  if (error) {
    redirect(`${redirectTo}?pwd_error=${encodeURIComponent(error.message)}`);
  }

  await supabase.rpc("log_audit_event", {
    p_action: "PASSWORD_RESET_BY_STAFF",
    p_entity: "customer",
    p_entity_id: customerId,
    p_after_state: { reset_by: user.id },
    p_ip_address: await getRequestIp(),
  });

  redirect(`${redirectTo}?pwd_success=1`);
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleCodes, type RoleCode } from "@/lib/auth";

const STAFF_ROLES: RoleCode[] = ["OPERADOR", "GERENTE", "ADMIN", "SUPER_ADMIN"];

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=Preencha e-mail e senha.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect("/login?error=E-mail ou senha inv%C3%A1lidos.");
  }

  const roles = await getUserRoleCodes(data.user.id);
  if (roles.some((role) => STAFF_ROLES.includes(role))) {
    redirect("/painel");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (customer) {
    redirect("/conta");
  }

  redirect("/nao-autorizado");
}

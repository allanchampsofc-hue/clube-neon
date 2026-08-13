import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RoleCode = "SUPER_ADMIN" | "ADMIN" | "GERENTE" | "OPERADOR" | "CLIENTE";

const STAFF_ROLES: RoleCode[] = ["OPERADOR", "GERENTE", "ADMIN", "SUPER_ADMIN"];
const ADMIN_ROLES: RoleCode[] = ["ADMIN", "SUPER_ADMIN"];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getUserRoleCodes(userId: string): Promise<RoleCode[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role_code")
    .eq("user_id", userId);

  return (data ?? []).map((row) => row.role_code as RoleCode);
}

/**
 * Exige que o usuário esteja autenticado e tenha uma das roles permitidas.
 * Redireciona pra /login (sem sessão) ou /nao-autorizado (sessão sem a role certa).
 */
export async function requireRole(allowedRoles: RoleCode[]) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const roles = await getUserRoleCodes(user.id);
  const role = roles.find((r) => allowedRoles.includes(r));
  if (!role) {
    redirect("/nao-autorizado");
  }

  return { user, roles, role };
}

export async function requireStaff() {
  return requireRole(STAFF_ROLES);
}

export async function requireAdmin() {
  return requireRole(ADMIN_ROLES);
}

export async function requireSuperAdmin() {
  return requireRole(["SUPER_ADMIN"]);
}

/**
 * Exige que o usuário esteja autenticado e tenha um registro em `customers`
 * vinculado (perfil CLIENTE). A checagem é pelo registro em `customers`, não
 * pela role — a role CLIENTE é apenas espelho dela (ver trigger
 * assign_cliente_role em supabase/migrations/00001_initial_schema.sql).
 */
export async function requireCustomer() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, member_number, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customer) {
    redirect("/nao-autorizado");
  }

  return { user, customer };
}

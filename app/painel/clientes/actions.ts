"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { customerFormSchema } from "@/lib/validations/customer";
import { getRequestIp } from "@/lib/request-ip";

function friendlyCustomerError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    if (error.message.includes("cpf")) return "Já existe um cliente com esse CPF.";
    if (error.message.includes("email")) return "Já existe um cliente com esse e-mail.";
    return "Já existe um cliente com esses dados.";
  }
  return error.message;
}

export async function createCustomer(formData: FormData) {
  await requireStaff();

  const parsed = customerFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    cpf: formData.get("cpf"),
    birth_date: formData.get("birth_date") || null,
    active: true,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/clientes/novo?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    redirect(
      `/painel/clientes/novo?error=${encodeURIComponent(friendlyCustomerError(error))}`,
    );
  }

  const ip = await getRequestIp();
  await supabase.rpc("log_audit_event", {
    p_action: "CUSTOMER_CREATED",
    p_entity: "customer",
    p_entity_id: data.id,
    p_after_state: parsed.data,
    p_ip_address: ip,
  });

  redirect(`/painel/clientes/${data.id}?success=1`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  await requireStaff();

  const parsed = customerFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    cpf: formData.get("cpf"),
    birth_date: formData.get("birth_date") || null,
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    redirect(`/painel/clientes/${customerId}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("customers")
    .select("name, email, phone, cpf, birth_date, active")
    .eq("id", customerId)
    .maybeSingle();

  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", customerId);

  if (error) {
    redirect(
      `/painel/clientes/${customerId}?error=${encodeURIComponent(friendlyCustomerError(error))}`,
    );
  }

  const ip = await getRequestIp();
  await supabase.rpc("log_audit_event", {
    p_action: "CUSTOMER_UPDATED",
    p_entity: "customer",
    p_entity_id: customerId,
    p_before_state: before,
    p_after_state: parsed.data,
    p_ip_address: ip,
  });

  redirect(`/painel/clientes/${customerId}?success=1`);
}

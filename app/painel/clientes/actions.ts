"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { customerFormSchema } from "@/lib/validations/customer";

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
  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", customerId);

  if (error) {
    redirect(
      `/painel/clientes/${customerId}?error=${encodeURIComponent(friendlyCustomerError(error))}`,
    );
  }

  redirect(`/painel/clientes/${customerId}?success=1`);
}

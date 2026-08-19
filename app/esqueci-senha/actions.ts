"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/esqueci-senha?error=Informe seu e-mail.");
  }

  const origin = await getSiteOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/redefinir-senha`,
  });

  // Sempre mostra sucesso, exista ou não o e-mail — não revela se uma conta
  // existe pra quem não tem acesso a ela.
  redirect("/esqueci-senha?success=1");
}

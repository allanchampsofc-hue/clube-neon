"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";

export async function updateDrawPrize(formData: FormData) {
  await requireManager();

  const prize = String(formData.get("next_draw_prize") ?? "").trim();
  if (!prize) {
    redirect(`/painel/sorteios?error=${encodeURIComponent("Informe o prêmio.")}`);
  }

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("system_config")
    .select("id")
    .limit(1)
    .single();

  const { error } = await supabase
    .from("system_config")
    .update({ next_draw_prize: prize })
    .eq("id", config!.id);

  if (error) {
    redirect(`/painel/sorteios?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sorteios?success=1");
}

export async function runDrawNow() {
  await requireManager();

  const supabase = await createClient();
  const { error } = await supabase.rpc("run_monthly_draw");

  if (error) {
    redirect(`/painel/sorteios?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/painel/sorteios?success=1");
}

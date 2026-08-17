"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // Loga antes do signOut — depois disso auth.uid() vira nulo e a RPC não
  // consegue mais saber quem estava saindo.
  await supabase.rpc("log_auth_event", { p_action: "LOGOUT" });
  await supabase.auth.signOut();
  redirect("/login");
}

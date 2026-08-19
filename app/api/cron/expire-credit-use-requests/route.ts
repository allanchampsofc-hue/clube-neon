import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader)) {
    // DEBUG TEMPORÁRIO — remover depois de diagnosticar o 401 dos crons.
    // Só expõe tamanhos, nunca o conteúdo do segredo.
    return NextResponse.json(
      {
        error: "Unauthorized",
        debug: {
          hasSecretEnv: Boolean(process.env.CRON_SECRET),
          secretEnvLength: process.env.CRON_SECRET?.length ?? 0,
          receivedHeaderLength: authHeader?.length ?? 0,
          receivedHeaderPresent: authHeader !== null,
        },
      },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("expire_old_credit_use_requests");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expired: data ?? 0 });
}

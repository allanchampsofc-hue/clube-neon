import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: dueSubscriptions, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("status", "ATIVA")
    .lte("current_period_end", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ subscriptionId: string; ok: boolean; error?: string }> = [];

  for (const subscription of dueSubscriptions ?? []) {
    const { error: rpcError } = await supabase.rpc(
      "process_subscription_cycle_rollover",
      { p_subscription_id: subscription.id },
    );

    results.push({
      subscriptionId: subscription.id,
      ok: !rpcError,
      error: rpcError?.message,
    });
  }

  return NextResponse.json({ processed: results.length, results });
}

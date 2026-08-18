import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: birthdaysData, error } = await supabase.rpc("get_todays_birthdays");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const birthdays = (birthdaysData ?? []) as Array<{
    customer_id: string;
    name: string;
    phone: string | null;
    plan_name: string;
  }>;

  const { data: config } = await supabase
    .from("system_config")
    .select("birthday_message, birthday_gift")
    .limit(1)
    .single();

  const year = new Date().getFullYear();
  const results: Array<{ customerId: string; ok: boolean; reason?: string }> = [];

  for (const customer of birthdays) {
    if (!customer.phone) {
      results.push({ customerId: customer.customer_id, ok: false, reason: "sem telefone" });
      continue;
    }

    const message = renderTemplate(config!.birthday_message, {
      nome: customer.name,
      mimo: config!.birthday_gift,
      plano: customer.plan_name,
    });

    try {
      await sendWhatsAppMessage(customer.phone, message);
      await supabase.from("birthday_notifications").insert({
        customer_id: customer.customer_id,
        year,
        sent_at: new Date().toISOString(),
        status: "SENT",
      });
      await supabase.from("audit_logs").insert({
        action: "BIRTHDAY_NOTIFIED",
        entity: "customer",
        entity_id: customer.customer_id,
        after_state: { year },
      });
      results.push({ customerId: customer.customer_id, ok: true });
    } catch (whatsappError) {
      const reason =
        whatsappError instanceof Error ? whatsappError.message : String(whatsappError);
      await supabase.from("birthday_notifications").insert({
        customer_id: customer.customer_id,
        year,
        status: "FAILED",
      });
      await supabase.from("audit_logs").insert({
        action: "WHATSAPP_SEND_FAILED",
        entity: "customer",
        entity_id: customer.customer_id,
        after_state: { context: "birthday", error: reason },
      });
      results.push({ customerId: customer.customer_id, ok: false, reason });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

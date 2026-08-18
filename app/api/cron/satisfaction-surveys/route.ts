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

  const { data: pendingData, error } = await supabase.rpc("get_pending_surveys_to_send");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = (pendingData ?? []) as Array<{
    id: string;
    customer_id: string;
    customer_name: string;
    phone: string;
  }>;

  const { data: config } = await supabase
    .from("system_config")
    .select("survey_message")
    .limit(1)
    .single();

  const results: Array<{ surveyId: string; ok: boolean }> = [];

  for (const survey of pending) {
    const message = renderTemplate(config!.survey_message, { nome: survey.customer_name });

    try {
      const { messageId } = await sendWhatsAppMessage(survey.phone, message);
      await supabase.rpc("mark_survey_sent", {
        p_survey_id: survey.id,
        p_whatsapp_message_id: messageId,
      });
      results.push({ surveyId: survey.id, ok: true });
    } catch (whatsappError) {
      await supabase.rpc("mark_survey_failed", { p_survey_id: survey.id });
      await supabase.from("audit_logs").insert({
        action: "WHATSAPP_SEND_FAILED",
        entity: "satisfaction_survey",
        entity_id: survey.id,
        after_state: {
          context: "survey",
          error:
            whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
        },
      });
      results.push({ surveyId: survey.id, ok: false });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

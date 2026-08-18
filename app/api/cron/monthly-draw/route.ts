import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("run_monthly_draw").single();

  if (error) {
    // Sem assinante elegível ou sorteio já rodado no mês — não é falha de
    // sistema, só não há nada a notificar.
    return NextResponse.json({ ok: false, reason: error.message });
  }

  const draw = data as {
    id: string;
    winner_customer_id: string;
    prize_description: string;
  };

  const { data: winner } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("id", draw.winner_customer_id)
    .single();

  let notified = false;
  if (winner?.phone) {
    try {
      await sendWhatsAppMessage(
        winner.phone,
        `🎉 Parabéns, ${winner.name}! Você foi sorteado no Clube Neon este mês!\n` +
          `Seu prêmio: ${draw.prize_description}.\n` +
          `Entre em contato com a Neon pra combinar. Com carinho, Clube Neon 🍕`,
      );
      notified = true;
      await supabase
        .from("monthly_draws")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", draw.id);
    } catch (whatsappError) {
      await supabase.from("audit_logs").insert({
        action: "WHATSAPP_SEND_FAILED",
        entity: "monthly_draw",
        entity_id: draw.id,
        after_state: {
          error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError),
        },
      });
    }
  }

  return NextResponse.json({ ok: true, draw, notified });
}

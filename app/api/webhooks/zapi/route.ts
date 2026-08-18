import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, formatPhoneE164 } from "@/lib/whatsapp";

/**
 * Webhook de mensagens recebidas da Z-API. Sem autenticação por token (a
 * Z-API não assina o payload no plano usado aqui) — a validação é só de
 * estrutura, e o pior caso de um payload forjado é uma tentativa de marcar
 * uma pesquisa como respondida, que só funciona se já existir uma pesquisa
 * SENT de verdade pro telefone informado (record_survey_answer não deixa
 * criar nada novo).
 *
 * Formato do payload não é 100% garantido sem acesso à documentação ao
 * vivo da Z-API — os campos abaixo (phone, text.message, messageId,
 * fromMe) cobrem o formato mais comum de webhook "on message received" da
 * Z-API pra mensagem de texto; ajuste se o payload real vier diferente
 * (dá pra conferir no próprio painel da Z-API, aba de Webhooks, que mostra
 * um payload de exemplo).
 *
 * Responde 200 rápido e processa a resposta depois (after()) — nunca faz
 * o webhook esperar o round-trip de gravar no banco + mandar o
 * agradecimento.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: true });
  }

  const payload = body as Record<string, unknown>;

  // Ignora eco de mensagens enviadas por nós mesmos (evita loop).
  if (payload.fromMe === true) {
    return NextResponse.json({ ok: true });
  }

  const rawPhone = payload.phone;
  const textObj = payload.text as Record<string, unknown> | undefined;
  const rawMessage =
    (typeof textObj?.message === "string" ? textObj.message : undefined) ??
    (typeof payload.body === "string" ? payload.body : undefined) ??
    (typeof payload.message === "string" ? payload.message : undefined);
  const messageId =
    (typeof payload.messageId === "string" ? payload.messageId : undefined) ??
    (typeof payload.id === "string" ? payload.id : undefined);

  if (typeof rawPhone !== "string" || typeof rawMessage !== "string" || !messageId) {
    return NextResponse.json({ ok: true });
  }

  const score = Number(rawMessage.trim());
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ ok: true });
  }

  const phone = formatPhoneE164(rawPhone);

  after(async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .rpc("record_survey_answer", {
        p_phone: phone,
        p_score: score,
        p_message_id: messageId,
      })
      .single();

    const survey = data as { customer_id: string } | null;
    if (!survey) return;

    const { data: customer } = await admin
      .from("customers")
      .select("name")
      .eq("id", survey.customer_id)
      .single();

    try {
      await sendWhatsAppMessage(
        phone,
        `Obrigado pela sua avaliação, ${customer?.name ?? "membro Neon"}! 💚`,
      );
    } catch {
      // Resposta já foi registrada — falha no agradecimento não é crítica.
    }
  });

  return NextResponse.json({ ok: true });
}

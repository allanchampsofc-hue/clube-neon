import { NextResponse, type NextRequest } from "next/server";
import { constructWebhookEvent } from "@/lib/payments/stripe-client";
import { handleStripeWebhookEvent } from "@/lib/payments/webhook-handlers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  // Precisa do corpo bruto (não parseado) pra verificação de assinatura.
  const rawBody = await request.text();

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assinatura inválida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotência: tenta reivindicar o evento inserindo a linha bruta.
  // Se já existe (reentrega do Stripe), busca o que já temos e só reprocessa
  // se ainda não tiver processed_at (ex: primeira tentativa falhou no meio).
  let eventRow: { id: string; processed_at: string | null } | null = null;

  const { data: inserted, error: insertError } = await supabase
    .from("payment_events")
    .insert({
      stripe_event_id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .select("id, processed_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("payment_events")
        .select("id, processed_at")
        .eq("stripe_event_id", event.id)
        .single();
      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      eventRow = existing;
    } else {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  } else {
    eventRow = inserted;
  }

  if (eventRow?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeWebhookEvent(event, supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao processar evento.";
    // Não marca processed_at — o Stripe reentrega em falha não-2xx, e a
    // próxima tentativa vai cair aqui de novo (idempotente).
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", event.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

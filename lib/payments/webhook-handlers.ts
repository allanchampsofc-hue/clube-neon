import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { mapStripeSubscriptionStatus } from "./subscription-status-map";

type AdminClient = ReturnType<typeof createAdminClient>;

// A partir da API 2025-03-31 do Stripe, a fatura não tem mais `subscription`
// nem `payment_intent` diretos — ficam sob `parent.subscription_details` e
// `confirmation_secret`, respectivamente.
function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

function extractPaymentIntentId(invoice: Stripe.Invoice): string | null {
  // client_secret tem o formato "{payment_intent_id}_secret_{random}".
  const clientSecret = invoice.confirmation_secret?.client_secret;
  if (!clientSecret) return null;
  const [paymentIntentId] = clientSecret.split("_secret_");
  return paymentIntentId || null;
}

/**
 * invoice.paid é o sinal inequívoco de "pagamento confirmado" — é o único
 * evento que dispara activate_subscription (libera crédito). Também cobre
 * a recuperação de uma assinatura INADIMPLENTE que voltou a pagar.
 */
async function handleInvoicePaid(event: Stripe.Event, supabase: AdminClient) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = extractSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  // Ainda não correlacionado — a ETAPA 15 (checkout) é quem grava
  // stripe_subscription_id na nossa assinatura. Sem isso não tem o que fazer.
  if (!subscription) return;

  const { error: paymentError } = await supabase.from("payments").insert({
    subscription_id: subscription.id,
    amount_cents: invoice.amount_paid,
    status: "PAGO",
    stripe_payment_intent_id: extractPaymentIntentId(invoice),
    paid_at: new Date().toISOString(),
  });
  if (paymentError) throw new Error(paymentError.message);

  if (subscription.status === "PENDENTE") {
    const { error } = await supabase.rpc("activate_subscription", {
      p_subscription_id: subscription.id,
    });
    // "Só é possível ativar..." significa que já foi ativada por outra
    // entrega do mesmo evento/corrida — não é um erro real, ignora.
    if (error && !error.message.includes("Só é possível ativar")) {
      throw new Error(error.message);
    }
  } else if (subscription.status === "INADIMPLENTE") {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "ATIVA" })
      .eq("id", subscription.id);
    if (error) throw new Error(error.message);
  }
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = extractSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (!subscription) return;

  const { error: paymentError } = await supabase.from("payments").insert({
    subscription_id: subscription.id,
    amount_cents: invoice.amount_due,
    status: "FALHOU",
    stripe_payment_intent_id: extractPaymentIntentId(invoice),
  });
  if (paymentError) throw new Error(paymentError.message);

  if (subscription.status === "ATIVA") {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "INADIMPLENTE" })
      .eq("id", subscription.id);
    if (error) throw new Error(error.message);
  }
}

/**
 * payment_intent.* são sinais de nível mais baixo que invoice.* — o registro
 * em `payments` normalmente já foi criado pelos handlers de invoice acima.
 * Aqui só atualiza o status se achar a linha; se não achar (ordem de entrega
 * dos webhooks não é garantida pelo Stripe), não faz nada — não é erro.
 */
async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const { error } = await supabase
    .from("payments")
    .update({ status: "PAGO", paid_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", pi.id);
  if (error) throw new Error(error.message);
}

async function handlePaymentIntentFailed(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const { error } = await supabase
    .from("payments")
    .update({ status: "FALHOU" })
    .eq("stripe_payment_intent_id", pi.id);
  if (error) throw new Error(error.message);
}

/**
 * Correlaciona a assinatura recém-criada no Stripe com a nossa, via
 * metadata.subscription_id — setado no checkout (ETAPA 15, ainda não
 * implementada). Sem esse metadata, não tem como saber qual é qual.
 */
async function handleSubscriptionCreated(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const sub = event.data.object as Stripe.Subscription;
  const ourSubscriptionId = sub.metadata?.subscription_id;
  if (!ourSubscriptionId) return;

  const { error } = await supabase
    .from("subscriptions")
    .update({ stripe_subscription_id: sub.id })
    .eq("id", ourSubscriptionId);
  if (error) throw new Error(error.message);
}

/**
 * Só sincroniza status pra assinaturas JÁ ativadas por nós — nunca dispara
 * ativação por aqui (isso é sempre via invoice.paid + activate_subscription).
 */
async function handleSubscriptionUpdated(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const sub = event.data.object as Stripe.Subscription;
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (!subscription || subscription.status === "PENDENTE") return;

  const mappedStatus = mapStripeSubscriptionStatus(sub.status);
  if (mappedStatus !== subscription.status) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: mappedStatus })
      .eq("id", subscription.id);
    if (error) throw new Error(error.message);
  }
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  const sub = event.data.object as Stripe.Subscription;
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "CANCELADA", cancel_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id);
  if (error) throw new Error(error.message);
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
  supabase: AdminClient,
) {
  switch (event.type) {
    case "invoice.paid":
      return handleInvoicePaid(event, supabase);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event, supabase);
    case "payment_intent.succeeded":
      return handlePaymentIntentSucceeded(event, supabase);
    case "payment_intent.payment_failed":
      return handlePaymentIntentFailed(event, supabase);
    case "customer.subscription.created":
      return handleSubscriptionCreated(event, supabase);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event, supabase);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event, supabase);
    default:
      // Evento que não tratamos — já foi registrado em payment_events antes
      // de chegar aqui, só ignora.
      return;
  }
}

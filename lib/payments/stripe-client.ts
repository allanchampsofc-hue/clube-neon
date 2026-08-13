import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Instância lazy do SDK do Stripe — só falha (env var ausente) quando
 * efetivamente usada, não no build/import do módulo. Reusada pela
 * StripePaymentService e pela rota de webhook (verificação de assinatura
 * precisa do client Stripe cru, não da abstração PaymentService).
 */
export function getStripeClient(): Stripe {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY não configurada — Stripe ainda não foi provisionado.",
      );
    }
    client = new Stripe(secretKey);
  }
  return client;
}

/**
 * Verifica a assinatura do webhook (header Stripe-Signature) contra o corpo
 * bruto da requisição. Lança se a assinatura for inválida — o chamador deve
 * responder 400 nesse caso, nunca processar um payload não verificado.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET não configurada — Stripe ainda não foi provisionado.",
    );
  }
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    webhookSecret,
  );
}

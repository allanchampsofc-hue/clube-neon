import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Instância lazy do SDK do Stripe — só falha (env var ausente) quando
 * efetivamente usada, não no build/import do módulo. Reusada pela
 * StripePaymentService e, na ETAPA 12, pela rota de webhook (verificação de
 * assinatura precisa do client Stripe cru, não da abstração PaymentService).
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

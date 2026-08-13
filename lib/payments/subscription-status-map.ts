import type Stripe from "stripe";
import type { SubscriptionStatus } from "@/lib/subscriptions";

/**
 * Mapeia o status de assinatura do Stripe pro nosso enum. Usado só pra
 * sincronizar (customer.subscription.updated) uma assinatura que JÁ foi
 * ativada pela gente — nunca dispara a ativação em si (isso é sempre via
 * activate_subscription, disparada por invoice.paid, que é o sinal
 * inequívoco de pagamento confirmado).
 */
export function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ATIVA";
    case "past_due":
    case "unpaid":
      return "INADIMPLENTE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELADA";
    case "paused":
      return "SUSPENSA";
    case "incomplete":
    default:
      return "PENDENTE";
  }
}

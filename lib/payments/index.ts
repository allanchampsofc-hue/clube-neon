import { StripePaymentService } from "./stripe-payment-service";
import type { PaymentService } from "./types";

export type { PaymentService } from "./types";
export type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  EnsureCustomerInput,
} from "./types";

let instance: PaymentService | null = null;

/**
 * Ponto único de acesso ao gateway de pagamento configurado. Todo o resto
 * do app deve chamar getPaymentService(), nunca instanciar StripePaymentService
 * (ou qualquer outra implementação) diretamente.
 */
export function getPaymentService(): PaymentService {
  if (!instance) {
    instance = new StripePaymentService();
  }
  return instance;
}

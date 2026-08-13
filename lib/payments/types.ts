export interface EnsureCustomerInput {
  /** ID do cliente no gateway, se já existir — evita duplicar. */
  externalCustomerId?: string | null;
  name: string;
  email: string | null;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionCheckoutInput {
  externalCustomerId: string;
  /** ID do preço no gateway (plans.stripe_price_id). */
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionCheckoutResult {
  checkoutUrl: string;
}

/**
 * Abstração sobre o gateway de pagamento — hoje só Stripe (StripePaymentService),
 * mas o resto do app depende só desta interface, nunca do SDK do Stripe
 * diretamente. Trocar de gateway no futuro significa trocar só a implementação.
 *
 * Verificação de assinatura de webhook fica fora daqui de propósito: é
 * inerentemente específica do gateway (o formato do payload difere entre
 * eles) e não cabe numa abstração genérica — fica em lib/payments/stripe-client.ts,
 * usada diretamente pela rota de webhook da ETAPA 12.
 */
export interface PaymentService {
  /** Garante um cliente no gateway, reaproveitando externalCustomerId se já existir. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;

  /** Cria uma sessão de checkout hospedada pelo gateway pra assinatura recorrente. */
  createSubscriptionCheckoutSession(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult>;

  /** Cancela a assinatura no gateway. */
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
}

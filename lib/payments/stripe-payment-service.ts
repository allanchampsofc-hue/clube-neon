import { getStripeClient } from "./stripe-client";
import type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  EnsureCustomerInput,
  PaymentService,
} from "./types";

export class StripePaymentService implements PaymentService {
  async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
    if (input.externalCustomerId) {
      return input.externalCustomerId;
    }

    const stripe = getStripeClient();
    const customer = await stripe.customers.create({
      name: input.name,
      email: input.email ?? undefined,
      metadata: input.metadata,
    });

    return customer.id;
  }

  async createSubscriptionCheckoutSession(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult> {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.externalCustomerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
    });

    if (!session.url) {
      throw new Error("Stripe não retornou uma URL de checkout.");
    }

    return { checkoutUrl: session.url };
  }

  async cancelSubscription(externalSubscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    await stripe.subscriptions.cancel(externalSubscriptionId);
  }
}

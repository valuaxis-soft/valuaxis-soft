/**
 * What billing needs from the payment provider, in plain objects. The Stripe
 * implementation lives in src/infrastructure/payments/stripe-gateway.ts, the
 * only module that imports the SDK; tests use a fake.
 */
import type { BillingEvent, BillingMetadata, StripeInterval } from "./billing-rules";

export type GatewayProduct = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  statementDescriptor: string | null;
  metadata: BillingMetadata;
};

export type GatewayPrice = {
  id: string;
  productId: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: StripeInterval | null;
  intervalCount: number | null;
  lookupKey: string | null;
  metadata: BillingMetadata;
};

export type GatewayCustomer = { id: string; metadata: BillingMetadata };

export type GatewaySubscription = {
  id: string;
  status: string;
  customerId: string;
  metadata: BillingMetadata;
  priceId: string | null;
  priceMetadata: BillingMetadata;
  startDate: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Set when the subscription is scheduled to end, from the portal or the API. */
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  cancellationReason: string | null;
};

export type GatewayCheckoutSession = {
  id: string;
  url: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  clientReferenceId: string | null;
  metadata: BillingMetadata;
};

export type GatewayPortalConfiguration = { id: string; metadata: BillingMetadata };

export type PortalConfigurationInput = {
  headline: string;
  returnUrl: string;
  /** Prices a customer may switch between in the portal. */
  products: Array<{ productId: string; priceIds: string[] }>;
  metadata: BillingMetadata;
};

export class WebhookSignatureError extends Error {
  constructor() {
    super("Invalid webhook signature.");
    this.name = "WebhookSignatureError";
  }
}

export interface BillingGateway {
  /** Null when the product does not exist. */
  retrieveProduct(id: string): Promise<GatewayProduct | null>;
  createProduct(input: { id: string; name: string; description: string | null; statementDescriptor: string; metadata: BillingMetadata }): Promise<GatewayProduct>;
  updateProduct(id: string, input: { name: string; description: string | null; statementDescriptor: string; active: true }): Promise<GatewayProduct>;

  retrievePrice(id: string): Promise<GatewayPrice | null>;
  findPriceByLookupKey(lookupKey: string): Promise<GatewayPrice | null>;
  createPrice(input: {
    productId: string;
    currency: string;
    unitAmount: number;
    interval: StripeInterval;
    intervalCount: number;
    lookupKey: string;
    nickname: string;
    metadata: BillingMetadata;
  }): Promise<GatewayPrice>;
  archivePrice(id: string): Promise<void>;

  /** Null when the customer does not exist or was deleted. */
  retrieveCustomer(id: string): Promise<GatewayCustomer | null>;
  createCustomer(input: { name: string; email: string | null; metadata: BillingMetadata; idempotencyKey: string }): Promise<GatewayCustomer>;

  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    clientReferenceId: string;
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
    metadata: BillingMetadata;
  }): Promise<GatewayCheckoutSession>;
  retrieveCheckoutSession(id: string): Promise<GatewayCheckoutSession | null>;

  retrieveSubscription(id: string): Promise<GatewaySubscription | null>;

  createPortalSession(input: { customerId: string; returnUrl: string; configurationId: string | null }): Promise<{ url: string }>;
  retrievePortalConfiguration(id: string): Promise<GatewayPortalConfiguration | null>;
  createPortalConfiguration(input: PortalConfigurationInput): Promise<GatewayPortalConfiguration>;
  updatePortalConfiguration(id: string, input: PortalConfigurationInput): Promise<GatewayPortalConfiguration>;

  /** Verifies the signature over the raw body; throws WebhookSignatureError when it does not match. */
  constructEvent(rawBody: string, signature: string, secret: string): BillingEvent;
}

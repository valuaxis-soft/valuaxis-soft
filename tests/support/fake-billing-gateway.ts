/**
 * An in-memory stand-in for Stripe. It keeps products, prices, customers,
 * checkout sessions and subscriptions as Stripe would, records every call
 * that writes, and lets a test play Stripe's side (pay a checkout, change a
 * subscription's status, add objects the "shop" created without tags).
 */
import { randomUUID } from "node:crypto";
import {
  WebhookSignatureError,
  type BillingGateway,
  type GatewayCheckoutSession,
  type GatewayCustomer,
  type GatewayPortalConfiguration,
  type GatewayPrice,
  type GatewayProduct,
  type GatewaySubscription,
} from "../../src/features/billing/billing-gateway";
import type { BillingEvent, BillingMetadata } from "../../src/features/billing/billing-rules";

const DAY = 24 * 60 * 60 * 1000;
const shortId = () => randomUUID().replace(/-/g, "").slice(0, 16);

type PendingSubscription = { priceId: string; trialDays: number | null; metadata: BillingMetadata };

export function createFakeBillingGateway() {
  const products = new Map<string, GatewayProduct>();
  const prices = new Map<string, GatewayPrice>();
  const customers = new Map<string, GatewayCustomer>();
  const sessions = new Map<string, GatewayCheckoutSession & { pending: PendingSubscription }>();
  const subscriptions = new Map<string, GatewaySubscription>();
  const portalConfigurations = new Map<string, GatewayPortalConfiguration>();
  const customerKeys = new Map<string, string>();
  /** Every call that created or changed something, in order. */
  const writes: string[] = [];
  const portalSessions: Array<{ customerId: string; configurationId: string | null }> = [];

  const gateway: BillingGateway = {
    async retrieveProduct(id) {
      return products.get(id) ?? null;
    },
    async createProduct(input) {
      if (products.has(input.id)) throw new Error(`Product ${input.id} already exists.`);
      const product = { id: input.id, name: input.name, description: input.description, active: true, statementDescriptor: input.statementDescriptor, metadata: input.metadata };
      products.set(product.id, product);
      writes.push(`product.create ${product.id}`);
      return product;
    },
    async updateProduct(id, input) {
      const product = { ...products.get(id)!, ...input };
      products.set(id, product);
      writes.push(`product.update ${id}`);
      return product;
    },
    async retrievePrice(id) {
      return prices.get(id) ?? null;
    },
    async findPriceByLookupKey(lookupKey) {
      return [...prices.values()].find((price) => price.lookupKey === lookupKey) ?? null;
    },
    async createPrice(input) {
      // transfer_lookup_key: the key moves to the new price.
      for (const price of prices.values()) if (price.lookupKey === input.lookupKey) price.lookupKey = null;
      const price: GatewayPrice = {
        id: `price_${shortId()}`,
        productId: input.productId,
        active: true,
        currency: input.currency,
        unitAmount: input.unitAmount,
        interval: input.interval,
        intervalCount: input.intervalCount,
        lookupKey: input.lookupKey,
        metadata: input.metadata,
      };
      prices.set(price.id, price);
      writes.push(`price.create ${price.id}`);
      return price;
    },
    async archivePrice(id) {
      prices.get(id)!.active = false;
      writes.push(`price.archive ${id}`);
    },
    async retrieveCustomer(id) {
      return customers.get(id) ?? null;
    },
    async createCustomer(input) {
      const known = customerKeys.get(input.idempotencyKey);
      if (known) return customers.get(known)!;
      const customer = { id: `cus_${shortId()}`, metadata: input.metadata };
      customers.set(customer.id, customer);
      customerKeys.set(input.idempotencyKey, customer.id);
      writes.push(`customer.create ${customer.id}`);
      return customer;
    },
    async createCheckoutSession(input) {
      const id = `cs_test_${shortId()}`;
      const session = {
        id,
        url: `https://checkout.stripe.test/${id}`,
        customerId: input.customerId,
        subscriptionId: null,
        clientReferenceId: input.clientReferenceId,
        metadata: input.metadata,
        pending: { priceId: input.priceId, trialDays: input.trialDays, metadata: input.metadata },
      };
      sessions.set(id, session);
      writes.push(`checkout.create ${id}`);
      return session;
    },
    async retrieveCheckoutSession(id) {
      return sessions.get(id) ?? null;
    },
    async retrieveSubscription(id) {
      return subscriptions.get(id) ?? null;
    },
    async createPortalSession(input) {
      portalSessions.push({ customerId: input.customerId, configurationId: input.configurationId });
      return { url: `https://billing.stripe.test/${input.customerId}` };
    },
    async retrievePortalConfiguration(id) {
      return portalConfigurations.get(id) ?? null;
    },
    async createPortalConfiguration(input) {
      const configuration = { id: `bpc_${shortId()}`, metadata: input.metadata };
      portalConfigurations.set(configuration.id, configuration);
      writes.push(`portal.create ${configuration.id}`);
      return configuration;
    },
    async updatePortalConfiguration(id) {
      writes.push(`portal.update ${id}`);
      return portalConfigurations.get(id)!;
    },
    constructEvent(rawBody, signature, secret) {
      if (signature !== fakeSignature(secret)) throw new WebhookSignatureError();
      return JSON.parse(rawBody) as BillingEvent;
    },
  };

  function addSubscription(input: { customerId: string; priceId: string; metadata: BillingMetadata; status?: string; trialDays?: number | null; startDate?: Date }) {
    const start = input.startDate ?? new Date(Math.floor(Date.now() / 1000) * 1000);
    const trialEnd = input.trialDays ? new Date(start.getTime() + input.trialDays * DAY) : null;
    const subscription: GatewaySubscription = {
      id: `sub_${shortId()}`,
      status: input.status ?? (trialEnd ? "trialing" : "active"),
      customerId: input.customerId,
      metadata: input.metadata,
      priceId: input.priceId,
      priceMetadata: prices.get(input.priceId)?.metadata ?? {},
      startDate: start,
      currentPeriodStart: start,
      currentPeriodEnd: trialEnd ?? new Date(start.getTime() + 30 * DAY),
      trialEnd,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      endedAt: null,
      cancellationReason: null,
    };
    subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  return {
    gateway,
    products,
    prices,
    customers,
    subscriptions,
    writes,
    portalSessions,
    /** The customer pays on Stripe's page: the session gets its subscription. */
    payCheckout(sessionId: string) {
      const session = sessions.get(sessionId)!;
      const subscription = addSubscription({ customerId: session.customerId!, ...session.pending });
      session.subscriptionId = subscription.id;
      return subscription;
    },
    /** A subscription created outside the checkout (or by the shop, when untagged). */
    addSubscription,
    /** Stripe changes the subscription: a failed charge, a cancellation in the portal, the end. */
    changeSubscription(id: string, patch: Partial<GatewaySubscription>) {
      const subscription = { ...subscriptions.get(id)!, ...patch };
      subscriptions.set(id, subscription);
      return subscription;
    },
    /** A signed webhook request about a subscription, as handleStripeWebhook receives it. */
    webhookRequest(type: string, subscriptionId: string, secret: string, options: { metadata?: BillingMetadata | null; id?: string } = {}) {
      const event: BillingEvent = {
        id: options.id ?? `evt_${shortId()}`,
        type,
        livemode: false,
        objectId: subscriptionId,
        metadata: options.metadata === undefined ? subscriptions.get(subscriptionId)?.metadata ?? null : options.metadata,
        subscriptionId,
      };
      return { event, rawBody: JSON.stringify(event), signature: fakeSignature(secret) };
    },
  };
}

export const fakeSignature = (secret: string) => `fake-signature:${secret}`;

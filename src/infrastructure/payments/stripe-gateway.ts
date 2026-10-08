/**
 * The only module that imports the Stripe SDK. It pins the API version, so a
 * change of the account's default version cannot change what the app reads,
 * and translates Stripe objects into the plain ones of billing-gateway.ts.
 *
 * It only ever touches objects by id (or by our own lookup key): it never
 * lists the account, which is shared with another business.
 */
import Stripe from "stripe";
import {
  WebhookSignatureError,
  type BillingGateway,
  type GatewayCheckoutSession,
  type GatewayPortalConfiguration,
  type GatewayPrice,
  type GatewayProduct,
  type GatewaySubscription,
  type PortalConfigurationInput,
} from "@/features/billing/billing-gateway";
import type { BillingEvent, StripeInterval } from "@/features/billing/billing-rules";

/** The version this code was written and tested against (stripe-node 23). */
const STRIPE_API_VERSION = "2026-09-30.endive";
/** Seconds a webhook signature stays valid; Stripe's own default. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

const date = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
const id = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

function isMissing(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError && (error.code === "resource_missing" || error.statusCode === 404);
}

/** Null instead of an error when the object does not exist. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function toProduct(product: Stripe.Product): GatewayProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    active: product.active,
    statementDescriptor: product.statement_descriptor ?? null,
    metadata: product.metadata,
  };
}

function toPrice(price: Stripe.Price): GatewayPrice {
  return {
    id: price.id,
    productId: id(price.product) ?? "",
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount,
    interval: (price.recurring?.interval as StripeInterval | undefined) ?? null,
    intervalCount: price.recurring?.interval_count ?? null,
    lookupKey: price.lookup_key,
    metadata: price.metadata,
  };
}

function toSubscription(subscription: Stripe.Subscription): GatewaySubscription {
  // Valuaxis subscriptions have one item; since API version 2025-03-31 the period lives on it.
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    status: subscription.status,
    customerId: id(subscription.customer) ?? "",
    metadata: subscription.metadata,
    priceId: item?.price.id ?? null,
    priceMetadata: item?.price.metadata ?? {},
    startDate: new Date(subscription.start_date * 1000),
    currentPeriodStart: date(item?.current_period_start),
    currentPeriodEnd: date(item?.current_period_end),
    trialEnd: date(subscription.trial_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: date(subscription.cancel_at),
    canceledAt: date(subscription.canceled_at),
    endedAt: date(subscription.ended_at),
    cancellationReason: subscription.cancellation_details?.feedback ?? subscription.cancellation_details?.reason ?? null,
  };
}

function toCheckoutSession(session: Stripe.Checkout.Session): GatewayCheckoutSession {
  return {
    id: session.id,
    url: session.url,
    customerId: id(session.customer),
    subscriptionId: id(session.subscription),
    clientReferenceId: session.client_reference_id,
    metadata: session.metadata ?? {},
  };
}

const toPortalConfiguration = (configuration: Stripe.BillingPortal.Configuration): GatewayPortalConfiguration => ({
  id: configuration.id,
  metadata: configuration.metadata ?? {},
});

function portalConfigurationParams(input: PortalConfigurationInput) {
  return {
    name: "Valuaxis",
    business_profile: { headline: input.headline },
    default_return_url: input.returnUrl,
    metadata: input.metadata,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // The subscription ends with the period already paid, never on the spot.
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: input.products.length
        ? {
            enabled: true,
            default_allowed_updates: ["price"],
            proration_behavior: "create_prorations",
            products: input.products.map((product) => ({ product: product.productId, prices: product.priceIds })),
          }
        : { enabled: false },
    },
  } satisfies Stripe.BillingPortal.ConfigurationCreateParams;
}

/**
 * The event reduced to what billing decides on: the object's Valuaxis tags and
 * the subscription it is about. An invoice carries its subscription's tags in
 * parent.subscription_details.
 */
export function toBillingEvent(event: Stripe.Event): BillingEvent {
  const base = { id: event.id, type: event.type, livemode: event.livemode };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      return { ...base, objectId: session.id, metadata: session.metadata, subscriptionId: id(session.subscription) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const subscription = event.data.object;
      return { ...base, objectId: subscription.id, metadata: subscription.metadata, subscriptionId: subscription.id };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const details = invoice.parent?.subscription_details ?? null;
      return { ...base, objectId: invoice.id ?? "", metadata: details?.metadata ?? null, subscriptionId: id(details?.subscription) };
    }
    default: {
      const object = event.data.object as { id?: unknown };
      return { ...base, objectId: typeof object.id === "string" ? object.id : "", metadata: null, subscriptionId: null };
    }
  }
}

export function createStripeGateway(secretKey: string): BillingGateway {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "Valuaxis", url: "https://valuaxis.com" },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });

  return {
    async retrieveProduct(productId) {
      const product = await orNull(stripe.products.retrieve(productId));
      return product && !("deleted" in product && product.deleted) ? toProduct(product) : null;
    },
    async createProduct(input) {
      return toProduct(
        await stripe.products.create({
          id: input.id,
          name: input.name,
          description: input.description ?? undefined,
          statement_descriptor: input.statementDescriptor,
          metadata: input.metadata,
        }),
      );
    },
    async updateProduct(productId, input) {
      return toProduct(
        await stripe.products.update(productId, {
          name: input.name,
          description: input.description ?? "",
          statement_descriptor: input.statementDescriptor,
          active: input.active,
        }),
      );
    },

    async retrievePrice(priceId) {
      const price = await orNull(stripe.prices.retrieve(priceId));
      return price ? toPrice(price) : null;
    },
    async findPriceByLookupKey(lookupKey) {
      // Not a listing of the account: it returns only the price holding our own key.
      const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      return data[0] ? toPrice(data[0]) : null;
    },
    async createPrice(input) {
      return toPrice(
        await stripe.prices.create({
          product: input.productId,
          currency: input.currency.toLowerCase(),
          unit_amount: input.unitAmount,
          recurring: { interval: input.interval, interval_count: input.intervalCount },
          // The amount already includes the tax (see priceBreakdown).
          tax_behavior: "inclusive",
          lookup_key: input.lookupKey,
          transfer_lookup_key: true,
          nickname: input.nickname,
          metadata: input.metadata,
        }),
      );
    },
    async archivePrice(priceId) {
      await stripe.prices.update(priceId, { active: false });
    },

    async retrieveCustomer(customerId) {
      const customer = await orNull(stripe.customers.retrieve(customerId));
      if (!customer || customer.deleted) return null;
      return { id: customer.id, metadata: customer.metadata };
    },
    async createCustomer(input) {
      const customer = await stripe.customers.create(
        { name: input.name, email: input.email ?? undefined, preferred_locales: ["es-419"], metadata: input.metadata },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: customer.id, metadata: customer.metadata };
    },

    async createCheckoutSession(input) {
      return toCheckoutSession(
        await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: input.customerId,
          client_reference_id: input.clientReferenceId,
          line_items: [{ price: input.priceId, quantity: 1 }],
          locale: "es-419",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
          subscription_data: {
            metadata: input.metadata,
            ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
          },
        }),
      );
    },
    async retrieveCheckoutSession(sessionId) {
      const session = await orNull(stripe.checkout.sessions.retrieve(sessionId));
      return session ? toCheckoutSession(session) : null;
    },

    async retrieveSubscription(subscriptionId) {
      const subscription = await orNull(stripe.subscriptions.retrieve(subscriptionId));
      return subscription ? toSubscription(subscription) : null;
    },

    async createPortalSession(input) {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
        locale: "es-419",
        ...(input.configurationId ? { configuration: input.configurationId } : {}),
      });
      return { url: session.url };
    },
    async retrievePortalConfiguration(configurationId) {
      const configuration = await orNull(stripe.billingPortal.configurations.retrieve(configurationId));
      return configuration ? toPortalConfiguration(configuration) : null;
    },
    async createPortalConfiguration(input) {
      return toPortalConfiguration(await stripe.billingPortal.configurations.create(portalConfigurationParams(input)));
    },
    async updatePortalConfiguration(configurationId, input) {
      return toPortalConfiguration(await stripe.billingPortal.configurations.update(configurationId, portalConfigurationParams(input)));
    },

    constructEvent(rawBody, signature, secret) {
      try {
        return toBillingEvent(stripe.webhooks.constructEvent(rawBody, signature, secret, WEBHOOK_TOLERANCE_SECONDS));
      } catch (error) {
        if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new WebhookSignatureError();
        throw error;
      }
    },
  };
}


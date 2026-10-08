/**
 * Pure billing rules: no database, no Stripe. The client's Stripe account is
 * shared with another business, so everything Valuaxis creates there carries
 * `app=valuaxis` and anything without that tag is not ours.
 */
import { Prisma } from "@prisma/client";

export const BILLING_PROVIDER = "STRIPE";
export const BILLING_CURRENCY = "MXN";
export const BILLING_APP_TAG = "valuaxis";
/** Shown on the card statement of subscription charges (set on the Stripe Product). */
export const BILLING_STATEMENT_DESCRIPTOR = "VALUAXIS";
/** Days a past-due subscription keeps paid use while Stripe retries the charge. */
export const BILLING_GRACE_DAYS = 7;

export type BillingMetadata = Record<string, string>;

/** The tags every Stripe object created by Valuaxis carries. */
export function valuaxisMetadata(extra: BillingMetadata = {}): BillingMetadata {
  return { app: BILLING_APP_TAG, ...extra };
}

/** True only for objects Valuaxis created; the shop's objects have no such tag. */
export function isValuaxisObject(metadata: BillingMetadata | null | undefined): boolean {
  return metadata?.app === BILLING_APP_TAG;
}

// ---- Catalog ---------------------------------------------------------------

export type StripeInterval = "day" | "week" | "month" | "year";

const INTERVALS: Record<string, StripeInterval> = { DIA: "day", SEMANA: "week", MES: "month", ANO: "year" };

/** The Stripe interval of a PrecioPlan, or null when it is not recurring (UNICO). */
export function stripeInterval(billingInterval: string): StripeInterval | null {
  return INTERVALS[billingInterval] ?? null;
}

/** Stripe ids and lookup keys are derived from our own ids, so nothing is ever searched or listed. */
export const stripeProductId = (planPublicId: string) => `valuaxis_plan_${planPublicId.replace(/-/g, "")}`;
export const stripeLookupKey = (pricePublicId: string) => `valuaxis_precio_${pricePublicId.replace(/-/g, "")}`;

type Amount = Prisma.Decimal | string | number;

/**
 * What the customer pays per period. NImporte is the price before tax and
 * NImpuestoPorcentaje the tax on top; Stripe charges the total as one
 * tax-inclusive amount (Stripe Tax stays off), and the page shows the breakdown.
 */
export function priceBreakdown(amount: Amount, taxPercent: Amount) {
  const subtotal = new Prisma.Decimal(amount);
  const total = subtotal.mul(new Prisma.Decimal(taxPercent).div(100).add(1)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    subtotal: subtotal.toNumber(),
    tax: total.sub(subtotal).toNumber(),
    total: total.toNumber(),
    /** Centavos, as Stripe's unit_amount. */
    unitAmount: total.mul(100).toNumber(),
  };
}

export type DesiredPrice = { productId: string; currency: string; unitAmount: number; interval: StripeInterval; intervalCount: number };
export type ExistingPrice = DesiredPrice & { id: string; active: boolean; metadata: BillingMetadata };

/**
 * A Stripe Price's amount cannot be edited: when anything that defines the
 * charge changed, a new Price replaces it and the old one is archived.
 */
export function priceSyncDecision(existing: ExistingPrice | null, desired: DesiredPrice): "create" | "keep" | "replace" {
  if (!existing) return "create";
  const same =
    existing.active &&
    existing.productId === desired.productId &&
    existing.currency.toLowerCase() === desired.currency.toLowerCase() &&
    existing.unitAmount === desired.unitAmount &&
    existing.interval === desired.interval &&
    existing.intervalCount === desired.intervalCount;
  return same ? "keep" : "replace";
}

// ---- Subscription status ---------------------------------------------------

/** Keys of the EstadoSuscripcion catalog (migration 025). */
export type SubscriptionStateKey = "BORRADOR" | "PRUEBA" | "ACTIVA" | "PAGO_PENDIENTE" | "VENCIDA" | "SUSPENDIDA" | "CANCELADA";

const STRIPE_STATUS: Record<string, { state: SubscriptionStateKey; ended: boolean }> = {
  trialing: { state: "PRUEBA", ended: false },
  active: { state: "ACTIVA", ended: false },
  past_due: { state: "PAGO_PENDIENTE", ended: false },
  // The first payment has not gone through yet; Stripe expires it after 23 hours.
  incomplete: { state: "PAGO_PENDIENTE", ended: false },
  unpaid: { state: "SUSPENDIDA", ended: false },
  paused: { state: "SUSPENDIDA", ended: false },
  canceled: { state: "CANCELADA", ended: true },
  incomplete_expired: { state: "VENCIDA", ended: true },
};

/**
 * The catalog state of a Stripe subscription status. `ended` means Stripe will
 * never charge it again, so the organization goes back to the free base plan.
 * A status this code does not know is treated as suspended, never as paid.
 */
export function mapStripeStatus(status: string): { state: SubscriptionStateKey; ended: boolean } {
  return STRIPE_STATUS[status] ?? { state: "SUSPENDIDA", ended: false };
}

/** Past due keeps paid use for BILLING_GRACE_DAYS from the start of the unpaid period. */
export function graceEnd(status: string, currentPeriodStart: Date | null): Date | null {
  if (status !== "past_due" || !currentPeriodStart) return null;
  return new Date(currentPeriodStart.getTime() + BILLING_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * "Does this subscription allow paid use right now?" Nothing enforces it yet:
 * it only drives the notices of the billing page.
 */
export function allowsPaidUse(
  subscription: { stateAllowsPaidUse: boolean; stateKey: string; graceEndsAt: Date | null; finalizedAt: Date | null } | null,
  now = new Date(),
): boolean {
  if (!subscription || subscription.finalizedAt) return false;
  if (subscription.stateAllowsPaidUse) return true;
  return subscription.stateKey === "PAGO_PENDIENTE" && subscription.graceEndsAt !== null && subscription.graceEndsAt > now;
}

// ---- Webhook events --------------------------------------------------------

/** Events the webhook acts on; every other type is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type BillingEvent = {
  id: string;
  type: string;
  livemode: boolean;
  objectId: string;
  /** The object's own tags; for an invoice, the tags of its subscription. */
  metadata: BillingMetadata | null;
  subscriptionId: string | null;
};

export type EventDecision =
  | { action: "ignore"; reason: "UNHANDLED_TYPE" | "NOT_VALUAXIS" | "NO_SUBSCRIPTION" }
  | { action: "reconcile"; subscriptionId: string };

/** Decides from the event alone, before anything is stored or asked of Stripe. */
export function decideEvent(event: BillingEvent): EventDecision {
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return { action: "ignore", reason: "UNHANDLED_TYPE" };
  if (!isValuaxisObject(event.metadata)) return { action: "ignore", reason: "NOT_VALUAXIS" };
  if (!event.subscriptionId) return { action: "ignore", reason: "NO_SUBSCRIPTION" };
  return { action: "reconcile", subscriptionId: event.subscriptionId };
}

// ---- Presentation ----------------------------------------------------------

const STATE_LABELS: Record<string, string> = {
  BORRADOR: "Plan gratuito",
  PRUEBA: "En periodo de prueba",
  ACTIVA: "Activa",
  PAGO_PENDIENTE: "Pago pendiente",
  VENCIDA: "Vencida",
  SUSPENDIDA: "Suspendida por falta de pago",
  CANCELADA: "Cancelada",
};

export const subscriptionStateLabel = (stateKey: string) => STATE_LABELS[stateKey] ?? stateKey;

/** "al mes", "cada 3 meses", "al año". */
export function billingPeriodLabel(billingInterval: string, count: number): string {
  const names: Record<string, [string, string, string]> = {
    DIA: ["al día", "día", "días"],
    SEMANA: ["a la semana", "semana", "semanas"],
    MES: ["al mes", "mes", "meses"],
    ANO: ["al año", "año", "años"],
  };
  const name = names[billingInterval];
  if (!name) return "";
  return count === 1 ? name[0] : `cada ${count} ${name[2]}`;
}

// ---- Subscription row ------------------------------------------------------

export type SubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string;
  priceId: string | null;
  startDate: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  cancellationReason: string | null;
};

/**
 * The Suscripcion columns that mirror a Stripe subscription. Everything comes
 * from Stripe's own data and nothing from the clock, so the success page and
 * the webhook write the same row whichever runs first, however many times.
 */
export function subscriptionFields(subscription: SubscriptionSnapshot) {
  const { state, ended } = mapStripeStatus(subscription.status);
  const hasPeriod =
    subscription.currentPeriodStart !== null &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd > subscription.currentPeriodStart;
  const cancelsAt = ended ? null : subscription.cancelAt ?? (subscription.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null);
  const isTrial = subscription.status === "trialing" && subscription.trialEnd !== null && subscription.trialEnd > subscription.startDate;
  return {
    state,
    ended,
    /** When Stripe stopped it; null while it is alive. */
    endedAt: ended ? subscription.endedAt ?? subscription.canceledAt : null,
    columns: {
      SProveedorPago: BILLING_PROVIDER,
      SIdentificadorExterno: subscription.id,
      BCancelarAlFinalPeriodo: cancelsAt !== null,
      BRenovacionAutomatica: !ended && cancelsAt === null,
      BEsPrueba: isTrial,
      DFechaInicio: subscription.startDate,
      DFechaFinPrueba: subscription.trialEnd,
      DFechaPeriodoActualInicio: hasPeriod ? subscription.currentPeriodStart : null,
      DFechaPeriodoActualFin: hasPeriod ? subscription.currentPeriodEnd : null,
      DFechaGraciaFin: graceEnd(subscription.status, subscription.currentPeriodStart),
      DFechaCancelacion: subscription.canceledAt,
      SMotivoCancelacion: subscription.canceledAt ? `Stripe: ${subscription.cancellationReason ?? "cancellation_requested"}` : null,
      JMetadatos: {
        stripe: {
          customer: subscription.customerId,
          status: subscription.status,
          price: subscription.priceId,
          cancelAt: cancelsAt?.toISOString() ?? null,
        },
      },
    },
  };
}

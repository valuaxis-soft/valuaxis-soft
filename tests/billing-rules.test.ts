import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BILLING_GRACE_DAYS,
  allowsPaidUse,
  billingPeriodLabel,
  decideEvent,
  graceEnd,
  isValuaxisObject,
  mapStripeStatus,
  priceBreakdown,
  priceSyncDecision,
  stripeInterval,
  stripeLookupKey,
  stripeProductId,
  subscriptionFields,
  subscriptionStateLabel,
  valuaxisMetadata,
  type BillingEvent,
  type ExistingPrice,
  type SubscriptionSnapshot,
} from "../src/features/billing/billing-rules";

const DAY = 24 * 60 * 60 * 1000;
const start = new Date("2026-10-01T12:00:00Z");

test("every Stripe status maps to a state of the catalog; only cancelled and expired end the subscription", () => {
  const expected: Record<string, [string, boolean]> = {
    trialing: ["PRUEBA", false],
    active: ["ACTIVA", false],
    past_due: ["PAGO_PENDIENTE", false],
    incomplete: ["PAGO_PENDIENTE", false],
    unpaid: ["SUSPENDIDA", false],
    paused: ["SUSPENDIDA", false],
    canceled: ["CANCELADA", true],
    incomplete_expired: ["VENCIDA", true],
  };
  for (const [status, [state, ended]] of Object.entries(expected)) {
    assert.deepEqual(mapStripeStatus(status), { state, ended }, status);
  }
});

test("a status this code does not know never counts as paid", () => {
  assert.deepEqual(mapStripeStatus("something_new"), { state: "SUSPENDIDA", ended: false });
});

test("paid use: allowed by the state, or past due within the grace period", () => {
  const base = { stateAllowsPaidUse: false, stateKey: "PAGO_PENDIENTE", graceEndsAt: new Date(start.getTime() + DAY), finalizedAt: null };
  assert.equal(allowsPaidUse(null, start), false);
  assert.equal(allowsPaidUse({ ...base, stateAllowsPaidUse: true, stateKey: "ACTIVA", graceEndsAt: null }, start), true);
  assert.equal(allowsPaidUse({ ...base, stateAllowsPaidUse: true, stateKey: "PRUEBA", graceEndsAt: null }, start), true);
  // The free base plan is not paid use.
  assert.equal(allowsPaidUse({ ...base, stateKey: "BORRADOR", graceEndsAt: null }, start), false);
  assert.equal(allowsPaidUse(base, start), true);
  assert.equal(allowsPaidUse(base, new Date(start.getTime() + DAY)), false, "the grace period is over at its end");
  assert.equal(allowsPaidUse({ ...base, graceEndsAt: null }, start), false);
  // Grace only applies to a pending payment, and never to a finalized subscription.
  assert.equal(allowsPaidUse({ ...base, stateKey: "SUSPENDIDA" }, start), false);
  assert.equal(allowsPaidUse({ ...base, stateAllowsPaidUse: true, finalizedAt: start }, start), false);
});

test("grace runs from the start of the unpaid period, only while past due", () => {
  assert.equal(graceEnd("past_due", start)?.getTime(), start.getTime() + BILLING_GRACE_DAYS * DAY);
  assert.equal(graceEnd("active", start), null);
  assert.equal(graceEnd("unpaid", start), null);
  assert.equal(graceEnd("past_due", null), null);
});

test("only objects tagged app=valuaxis are ours", () => {
  assert.equal(isValuaxisObject(valuaxisMetadata({ organizacion: "x" })), true);
  assert.equal(isValuaxisObject({}), false);
  assert.equal(isValuaxisObject(null), false);
  assert.equal(isValuaxisObject({ app: "woocommerce" }), false);
  assert.equal(isValuaxisObject({ App: "valuaxis" }), false);
});

const event = (patch: Partial<BillingEvent>): BillingEvent => ({
  id: "evt_1",
  type: "customer.subscription.updated",
  livemode: false,
  objectId: "sub_1",
  metadata: valuaxisMetadata(),
  subscriptionId: "sub_1",
  ...patch,
});

test("the shop's events are ignored: untagged objects never reach a reconciliation", () => {
  assert.deepEqual(decideEvent(event({})), { action: "reconcile", subscriptionId: "sub_1" });
  assert.deepEqual(decideEvent(event({ metadata: null })), { action: "ignore", reason: "NOT_VALUAXIS" });
  assert.deepEqual(decideEvent(event({ metadata: { order_id: "1234" } })), { action: "ignore", reason: "NOT_VALUAXIS" });
  // A one-off payment of the shop also completes a checkout session.
  assert.deepEqual(decideEvent(event({ type: "checkout.session.completed", metadata: {}, subscriptionId: null })), { action: "ignore", reason: "NOT_VALUAXIS" });
  assert.deepEqual(decideEvent(event({ type: "invoice.paid", metadata: null })), { action: "ignore", reason: "NOT_VALUAXIS" });
});

test("unknown event types are ignored, tagged or not", () => {
  for (const type of ["charge.succeeded", "invoice.payment_succeeded", "customer.updated", "made.up"]) {
    assert.deepEqual(decideEvent(event({ type })), { action: "ignore", reason: "UNHANDLED_TYPE" }, type);
  }
});

test("the handled events all lead to the subscription they are about", () => {
  for (const type of [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]) {
    assert.deepEqual(decideEvent(event({ type })), { action: "reconcile", subscriptionId: "sub_1" }, type);
  }
  assert.deepEqual(decideEvent(event({ type: "checkout.session.completed", subscriptionId: null })), { action: "ignore", reason: "NO_SUBSCRIPTION" });
});

test("the charge is the price plus its tax, in centavos", () => {
  assert.deepEqual(priceBreakdown("499.00", "16"), { subtotal: 499, tax: 79.84, total: 578.84, unitAmount: 57884 });
  assert.deepEqual(priceBreakdown("1499", 0), { subtotal: 1499, tax: 0, total: 1499, unitAmount: 149900 });
  // Half a centavo rounds up, without floating point drift.
  assert.equal(priceBreakdown("0.35", "50").unitAmount, 53);
  assert.equal(priceBreakdown("1234.56", "16").unitAmount, 143209);
});

test("a price is kept when nothing changed, and replaced (never edited) when the charge changed", () => {
  const desired = { productId: "prod_1", currency: "mxn", unitAmount: 57884, interval: "month" as const, intervalCount: 1 };
  const existing: ExistingPrice = { ...desired, id: "price_1", active: true, metadata: valuaxisMetadata() };
  assert.equal(priceSyncDecision(null, desired), "create");
  assert.equal(priceSyncDecision(existing, desired), "keep");
  assert.equal(priceSyncDecision({ ...existing, currency: "MXN" }, desired), "keep");
  assert.equal(priceSyncDecision(existing, { ...desired, unitAmount: 60000 }), "replace");
  assert.equal(priceSyncDecision(existing, { ...desired, interval: "year" }), "replace");
  assert.equal(priceSyncDecision(existing, { ...desired, intervalCount: 3 }), "replace");
  assert.equal(priceSyncDecision({ ...existing, active: false }, desired), "replace", "an archived price cannot be sold again");
  assert.equal(priceSyncDecision({ ...existing, productId: "prod_other" }, desired), "replace");
});

test("Stripe ids and intervals derive from our own data", () => {
  assert.equal(stripeProductId("fb4cbb3f-d78d-4c59-a4dd-6afe2baa35ce"), "valuaxis_plan_fb4cbb3fd78d4c59a4dd6afe2baa35ce");
  assert.equal(stripeLookupKey("dc55121a-1228-43fc-a061-0f4a9ddd8699"), "valuaxis_precio_dc55121a122843fca0610f4a9ddd8699");
  assert.deepEqual(["DIA", "SEMANA", "MES", "ANO", "UNICO"].map(stripeInterval), ["day", "week", "month", "year", null]);
});

const snapshot = (patch: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  id: "sub_1",
  status: "active",
  customerId: "cus_1",
  priceId: "price_1",
  startDate: start,
  currentPeriodStart: start,
  currentPeriodEnd: new Date(start.getTime() + 30 * DAY),
  trialEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  cancellationReason: null,
  ...patch,
});

test("an active subscription renews, with its period", () => {
  const { state, ended, endedAt, columns } = subscriptionFields(snapshot());
  assert.deepEqual([state, ended, endedAt], ["ACTIVA", false, null]);
  assert.equal(columns.BRenovacionAutomatica, true);
  assert.equal(columns.BCancelarAlFinalPeriodo, false);
  assert.equal(columns.BEsPrueba, false);
  assert.equal(columns.DFechaPeriodoActualFin?.getTime(), start.getTime() + 30 * DAY);
  assert.equal(columns.DFechaGraciaFin, null);
  assert.equal(columns.SMotivoCancelacion, null);
});

test("a trial keeps its end date", () => {
  const trialEnd = new Date(start.getTime() + 7 * DAY);
  const { state, columns } = subscriptionFields(snapshot({ status: "trialing", trialEnd, currentPeriodEnd: trialEnd }));
  assert.equal(state, "PRUEBA");
  assert.equal(columns.BEsPrueba, true);
  assert.equal(columns.DFechaFinPrueba, trialEnd);
});

test("a scheduled cancellation is recorded with its date and a reason, as the table requires", () => {
  const periodEnd = new Date(start.getTime() + 30 * DAY);
  for (const patch of [{ cancelAtPeriodEnd: true }, { cancelAt: periodEnd }]) {
    const { state, columns } = subscriptionFields(snapshot({ ...patch, canceledAt: start, cancellationReason: "cancellation_requested" }));
    assert.equal(state, "ACTIVA");
    assert.equal(columns.BCancelarAlFinalPeriodo, true);
    assert.equal(columns.BRenovacionAutomatica, false);
    assert.equal(columns.JMetadatos.stripe.cancelAt, periodEnd.toISOString());
    assert.equal(columns.SMotivoCancelacion, "Stripe: cancellation_requested");
  }
});

test("past due gets a grace date; a cancelled subscription ends when Stripe ended it", () => {
  const pastDue = subscriptionFields(snapshot({ status: "past_due" }));
  assert.equal(pastDue.state, "PAGO_PENDIENTE");
  assert.equal(pastDue.columns.DFechaGraciaFin?.getTime(), start.getTime() + BILLING_GRACE_DAYS * DAY);

  const endedAt = new Date(start.getTime() + 30 * DAY);
  const cancelled = subscriptionFields(snapshot({ status: "canceled", canceledAt: start, endedAt, cancelAtPeriodEnd: true }));
  assert.deepEqual([cancelled.state, cancelled.ended, cancelled.endedAt], ["CANCELADA", true, endedAt]);
  assert.equal(cancelled.columns.BRenovacionAutomatica, false);
  assert.equal(cancelled.columns.BCancelarAlFinalPeriodo, false);
  assert.equal(cancelled.columns.SMotivoCancelacion, "Stripe: cancellation_requested");
});

test("the same subscription always produces the same row, whoever reconciles it", () => {
  const input = snapshot({ status: "past_due", cancelAtPeriodEnd: true, canceledAt: start });
  assert.deepEqual(subscriptionFields(input), subscriptionFields({ ...input }));
});

test("a period Stripe did not report is stored as no period, never as half of one", () => {
  const { columns } = subscriptionFields(snapshot({ currentPeriodEnd: null }));
  assert.deepEqual([columns.DFechaPeriodoActualInicio, columns.DFechaPeriodoActualFin], [null, null]);
});

test("states and periods read in plain Spanish", () => {
  assert.equal(subscriptionStateLabel("PAGO_PENDIENTE"), "Pago pendiente");
  assert.equal(subscriptionStateLabel("BORRADOR"), "Plan gratuito");
  assert.equal(billingPeriodLabel("MES", 1), "al mes");
  assert.equal(billingPeriodLabel("ANO", 1), "al año");
  assert.equal(billingPeriodLabel("MES", 3), "cada 3 meses");
});

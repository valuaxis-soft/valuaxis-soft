import assert from "node:assert/strict";
import { test } from "node:test";
import { decideEvent, priceSyncDecision, type BillingEvent } from "../src/features/billing/billing-rules";
import {
  CREDIT_MOVEMENT_TYPES,
  concludeCreditDecision,
  creditMovementLabel,
  isValidMovement,
  packagePricing,
  stripePackageLookupKey,
  stripePackageProductId,
} from "../src/features/billing/credit-rules";

test("each movement type has the sign the database enforces", () => {
  assert.equal(isValidMovement("COMPRA", 10), true);
  assert.equal(isValidMovement("COMPRA", 0), false);
  assert.equal(isValidMovement("COMPRA", -1), false);
  assert.equal(isValidMovement("CONSUMO", -1), true);
  assert.equal(isValidMovement("CONSUMO", 1), false);
  assert.equal(isValidMovement("AJUSTE", 5), true);
  assert.equal(isValidMovement("AJUSTE", -5), true);
  assert.equal(isValidMovement("AJUSTE", 0), false);
  assert.equal(isValidMovement("COMPRA", 1.5), false, "credits are whole");
  assert.deepEqual(Object.values(CREDIT_MOVEMENT_TYPES), ["COMPRA", "CONSUMO", "AJUSTE"]);
});

test("the first conclusion consumes; a later one of the same valuation never does", () => {
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: 3, enforced: true }), { action: "consume" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: true, balance: 3, enforced: true }), { action: "skip", reason: "ALREADY_CONSUMED" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: true, balance: 0, enforced: true }), { action: "skip", reason: "ALREADY_CONSUMED" }, "re-concluding is free even without balance");
});

test("enforcement off records the consumption whatever the balance; on, it blocks at zero or below", () => {
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: 0, enforced: false }), { action: "consume" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: -4, enforced: false }), { action: "consume" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: 0, enforced: true }), { action: "block", reason: "NO_BALANCE" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: -1, enforced: true }), { action: "block", reason: "NO_BALANCE" });
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, balance: 1, enforced: true }), { action: "consume" });
});

test("a package's pricing: tax-inclusive total in centavos and the price per credit before tax", () => {
  // 10 at 140 = 1,400 + 16% = 1,624.00
  assert.deepEqual(packagePricing({ ICreditos: 10, NImporte: "1400.00", NImpuestoPorcentaje: "16" }), {
    subtotal: 1400,
    tax: 224,
    total: 1624,
    unitAmount: 162400,
    perCredit: 140,
  });
  assert.equal(packagePricing({ ICreditos: 30, NImporte: "3750.00", NImpuestoPorcentaje: "16" }).perCredit, 125);
  assert.equal(packagePricing({ ICreditos: 3, NImporte: "100.00", NImpuestoPorcentaje: "0" }).perCredit, 33.33, "rounded to centavos");
});

test("package ids in Stripe derive from our public id and never collide with plan ids", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.equal(stripePackageProductId(id), "valuaxis_paquete_0f8fad5bd9cb469fa16570867728950e");
  assert.equal(stripePackageLookupKey(id), "valuaxis_paquete_precio_0f8fad5bd9cb469fa16570867728950e");
});

test("a one-time price is kept while nothing changed and replaced when the amount or product does", () => {
  const existing = { id: "price_1", productId: "prod_a", currency: "mxn", unitAmount: 17400, interval: null, intervalCount: null, active: true, metadata: {} };
  const desired = { productId: "prod_a", currency: "MXN", unitAmount: 17400, interval: null, intervalCount: null };
  assert.equal(priceSyncDecision(existing, desired), "keep");
  assert.equal(priceSyncDecision(existing, { ...desired, unitAmount: 18000 }), "replace");
  assert.equal(priceSyncDecision({ ...existing, interval: "month", intervalCount: 1 }, desired), "replace", "a recurring price is not a one-time price");
  assert.equal(priceSyncDecision(null, desired), "create");
});

test("a checkout event without a subscription is a package purchase; one with a subscription still reconciles it", () => {
  const base: BillingEvent = { id: "evt_1", type: "checkout.session.completed", livemode: false, objectId: "cs_1", metadata: { app: "valuaxis" }, subscriptionId: null, checkoutSessionId: "cs_1" };
  assert.deepEqual(decideEvent(base), { action: "reconcile-purchase", checkoutSessionId: "cs_1" });
  assert.deepEqual(decideEvent({ ...base, subscriptionId: "sub_1" }), { action: "reconcile", subscriptionId: "sub_1" });
  assert.deepEqual(decideEvent({ ...base, metadata: {} }), { action: "ignore", reason: "NOT_VALUAXIS" }, "the shop's one-time payments are dropped");
  assert.deepEqual(decideEvent({ ...base, checkoutSessionId: null }), { action: "ignore", reason: "NO_SUBSCRIPTION" });
});

test("movement labels are Spanish for the three types", () => {
  assert.equal(creditMovementLabel("COMPRA"), "Compra de paquete");
  assert.equal(creditMovementLabel("CONSUMO"), "Avalúo concluido");
  assert.equal(creditMovementLabel("AJUSTE"), "Ajuste manual");
  assert.equal(creditMovementLabel("OTRO"), "OTRO");
});

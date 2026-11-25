import assert from "node:assert/strict";
import { test } from "node:test";
import { decideEvent, priceSyncDecision, type BillingEvent } from "../src/features/billing/billing-rules";
import {
  CREDIT_MOVEMENT_TYPES,
  MAX_PURCHASE_QUANTITY,
  TRIAL_CREDITS,
  addOneMonth,
  concludeCreditDecision,
  consumptionSource,
  createCreditDecision,
  creditMovementLabel,
  creditSummary,
  isValidMovement,
  packagePricing,
  preTaxAmountFor,
  purchaseTotals,
  stripePackageLookupKey,
  stripePackageProductId,
} from "../src/features/billing/credit-rules";
import { bankTransferForDisplay } from "../src/features/billing/payment-instructions";
import { buildBillingNoticeHtml, buildBillingNoticeText } from "../src/features/notifications/templates/billing-notice";

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

test("movement labels are Spanish for the three types, and say what the tags in JMetadatos mean", () => {
  assert.equal(creditMovementLabel("COMPRA"), "Compra");
  assert.equal(creditMovementLabel("CONSUMO"), "Avalúo concluido", "a consumption from before the policies, without tags");
  assert.equal(creditMovementLabel("CONSUMO", { moment: "CREATION", source: "PAID" }), "Avalúo creado");
  assert.equal(creditMovementLabel("CONSUMO", { moment: "CREATION", source: "TRIAL" }), "Avalúo creado (prueba)");
  assert.equal(creditMovementLabel("CONSUMO", { moment: "CONCLUSION", source: "PAID" }), "Avalúo concluido");
  assert.equal(creditMovementLabel("AJUSTE"), "Ajuste manual");
  assert.equal(creditMovementLabel("AJUSTE", { kind: "TRIAL_GRANT" }), "Prueba gratuita");
  assert.equal(creditMovementLabel("AJUSTE", { kind: "TRIAL_EXPIRY" }), "Vencimiento de la prueba");
  assert.equal(creditMovementLabel("OTRO"), "OTRO");
});

test("the trial lasts until the same day of the next month; a missing day is the month's last", () => {
  assert.equal(TRIAL_CREDITS, 3);
  assert.equal(addOneMonth(new Date("2026-11-25T18:30:00Z")).toISOString(), "2026-12-25T18:30:00.000Z");
  assert.equal(addOneMonth(new Date("2026-12-15T06:00:00Z")).toISOString(), "2027-01-15T06:00:00.000Z");
  assert.equal(addOneMonth(new Date("2027-01-31T12:00:00Z")).toISOString(), "2027-02-28T12:00:00.000Z");
  assert.equal(addOneMonth(new Date("2028-01-31T12:00:00Z")).toISOString(), "2028-02-29T12:00:00.000Z");
});

const trialLedger = (overrides: Partial<{ granted: number; usedFromTrial: number; expiredWritten: number }> = {}) => ({
  granted: 3,
  usedFromTrial: 0,
  expiredWritten: 0,
  expiresAt: new Date("2026-12-25T00:00:00Z"),
  ...overrides,
});
const beforeExpiry = new Date("2026-12-24T23:59:59Z");
const afterExpiry = new Date("2026-12-25T00:00:00Z");

test("an account without trial: the balance is the ledger's sum, all of it paid", () => {
  assert.deepEqual(creditSummary(7, null), { balance: 7, paid: 7, trial: null });
  assert.deepEqual(creditSummary(-2, null), { balance: -2, paid: -2, trial: null });
});

test("trial credits count until their month ends and are consumed before paid ones", () => {
  // 3 of trial + 2 bought; one valuation created from the trial.
  const during = creditSummary(4, trialLedger({ usedFromTrial: 1 }), beforeExpiry);
  assert.deepEqual([during.balance, during.paid, during.trial?.available, during.trial?.expired], [4, 2, 2, false]);
  assert.equal(consumptionSource(during), "TRIAL", "trial first");

  const trialSpent = creditSummary(2, trialLedger({ usedFromTrial: 3 }), beforeExpiry);
  assert.deepEqual([trialSpent.balance, trialSpent.paid, trialSpent.trial?.available], [2, 2, 0]);
  assert.equal(consumptionSource(trialSpent), "PAID");
});

test("unused trial credits stop counting at expiry, before and after their expiry movement is written; paid ones never expire", () => {
  // 3 of trial + 2 bought, one trial used: 2 trial credits expire.
  const pending = creditSummary(4, trialLedger({ usedFromTrial: 1 }), afterExpiry);
  assert.deepEqual([pending.balance, pending.paid, pending.trial?.available, pending.trial?.pendingExpiry, pending.trial?.expired], [2, 2, 0, 2, true]);
  assert.equal(consumptionSource(pending), "PAID");

  // Once the TRIAL_EXPIRY of −2 is in the ledger, the sum is 2 and nothing is pending.
  const written = creditSummary(2, trialLedger({ usedFromTrial: 1, expiredWritten: 2 }), new Date("2027-06-01T00:00:00Z"));
  assert.deepEqual([written.balance, written.paid, written.trial?.pendingExpiry], [2, 2, 0]);
});

test("creating consumes; with the charge on, no balance blocks; off, nothing is blocked", () => {
  assert.deepEqual(createCreditDecision({ balance: 1, enforced: true }), { action: "consume" });
  assert.deepEqual(createCreditDecision({ balance: 0, enforced: true }), { action: "block", reason: "NO_BALANCE" });
  assert.deepEqual(createCreditDecision({ balance: -3, enforced: true }), { action: "block", reason: "NO_BALANCE" });
  assert.deepEqual(createCreditDecision({ balance: 0, enforced: false }), { action: "consume" });
  assert.deepEqual(createCreditDecision({ balance: -3, enforced: false }), { action: "consume" });
});

test("transition: a valuation concluded before the ledger is never charged on a later conclusion", () => {
  assert.deepEqual(
    concludeCreditDecision({ alreadyConsumed: false, previouslyConcluded: true, balance: 0, enforced: true }),
    { action: "skip", reason: "PREVIOUSLY_CONCLUDED" },
  );
  assert.deepEqual(concludeCreditDecision({ alreadyConsumed: false, previouslyConcluded: false, balance: 2, enforced: true }), { action: "consume" }, "created before, never concluded: charged now");
});

test("buying by unit: the total is the unit price times the quantity, with its IVA", () => {
  const unit = packagePricing({ ICreditos: 1, NImporte: "146.55", NImpuestoPorcentaje: "16" });
  assert.equal(unit.total, 170);
  assert.deepEqual(purchaseTotals(unit, 1), { quantity: 1, unitTotal: 170, subtotal: 146.55, tax: 23.45, total: 170 });
  assert.deepEqual(purchaseTotals(unit, 3), { quantity: 3, unitTotal: 170, subtotal: 439.65, tax: 70.35, total: 510 });
  assert.equal(MAX_PURCHASE_QUANTITY, 100);
});

test("a price with IVA is stored before tax so that the total rounds back to it exactly", () => {
  assert.equal(preTaxAmountFor("170", "16"), "146.55");
  assert.equal(preTaxAmountFor("190", "16"), "163.79");
  assert.equal(preTaxAmountFor("200.00", "0"), "200.00");
  for (const price of ["99.99", "185.50", "1234.56"]) {
    const preTax = preTaxAmountFor(price, "16")!;
    assert.equal(packagePricing({ ICreditos: 1, NImporte: preTax, NImpuestoPorcentaje: "16" }).total, Number(price));
  }
});

test("transfer data are «Por definir» until the owner fills them; complete, they are ready", () => {
  const empty = bankTransferForDisplay();
  assert.equal(empty.ready, false);
  assert.ok(empty.rows.every((row) => row.value === "Por definir"));
  const filled = bankTransferForDisplay({ bank: "Banco Inventado", clabe: "000000000000000000", holder: "Titular de prueba", creditTerm: "2 días hábiles", receiptsEmail: "pagos@example.test" });
  assert.equal(filled.ready, true);
  assert.equal(filled.rows[3].value, "Dentro de 2 días hábiles siguientes a que se confirme el pago");
});

test("the billing notice email lays out the lines, the details and the link, escaped", () => {
  const content = {
    subject: "Confirmación",
    greeting: "Hola, Despacho <Prueba>:",
    lines: ["Recibimos tu pago."],
    details: [{ label: "Total pagado", value: "$510.00 MXN" }],
    link: { label: "Ver", url: "https://example.test/organizacion/facturacion" },
  };
  const text = buildBillingNoticeText(content);
  assert.match(text, /Recibimos tu pago\./);
  assert.match(text, /Total pagado: \$510\.00 MXN/);
  assert.match(text, /https:\/\/example\.test\/organizacion\/facturacion/);
  const html = buildBillingNoticeHtml(content);
  assert.match(html, /Despacho &lt;Prueba&gt;/);
  assert.match(html, /<strong>\$510\.00 MXN<\/strong>/);
});

/**
 * The real Stripe gateway, offline: verifying a webhook signature and reading
 * an event need no network. The secret and the key are made up for the test.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { WebhookSignatureError } from "../src/features/billing/billing-gateway";
import { decideEvent } from "../src/features/billing/billing-rules";
import { createStripeGateway, toBillingEvent } from "../src/infrastructure/payments/stripe-gateway";
import { proxy } from "../src/proxy";

const SECRET = "whsec_unit_test_only";
const stripe = new Stripe("sk_test_unit_test_only");
const gateway = createStripeGateway("sk_test_unit_test_only");
const tags = { app: "valuaxis", organizacion: "82ff7525-3f1b-4b51-a8c3-33c534421cca" };

const eventPayload = (type: string, object: Record<string, unknown>) =>
  JSON.stringify({ id: "evt_test_1", object: "event", api_version: "2026-09-30.endive", created: 1791000000, livemode: false, type, data: { object } });
const sign = (payload: string, options: { secret?: string; timestamp?: number } = {}) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? SECRET, timestamp: options.timestamp });

const subscriptionPayload = eventPayload("customer.subscription.updated", { id: "sub_1", object: "subscription", metadata: tags });

test("a correctly signed event is accepted and read", () => {
  const event = gateway.constructEvent(subscriptionPayload, sign(subscriptionPayload), SECRET);
  assert.deepEqual(event, { id: "evt_test_1", type: "customer.subscription.updated", livemode: false, objectId: "sub_1", metadata: tags, subscriptionId: "sub_1" });
});

test("a wrong secret, an altered body, a malformed header and an old signature are rejected", () => {
  const rejected = (payload: string, header: string) => assert.throws(() => gateway.constructEvent(payload, header, SECRET), WebhookSignatureError);
  rejected(subscriptionPayload, sign(subscriptionPayload, { secret: "whsec_someone_else" }));
  rejected(subscriptionPayload.replace("sub_1", "sub_2"), sign(subscriptionPayload));
  rejected(subscriptionPayload, "not-a-signature");
  rejected(subscriptionPayload, "t=1791000000,v1=00");
  // Replay protection: five minutes of tolerance.
  rejected(subscriptionPayload, sign(subscriptionPayload, { timestamp: Math.floor(Date.now() / 1000) - 301 }));
});

const read = (type: string, object: Record<string, unknown>) => toBillingEvent(JSON.parse(eventPayload(type, object)) as Stripe.Event);

test("a checkout session event carries the session's tags and its subscription", () => {
  const event = read("checkout.session.completed", { id: "cs_test_1", object: "checkout.session", metadata: tags, subscription: "sub_9" });
  assert.deepEqual([event.objectId, event.subscriptionId, event.metadata], ["cs_test_1", "sub_9", tags]);
  assert.deepEqual(decideEvent(event), { action: "reconcile", subscriptionId: "sub_9" });
});

test("an invoice event is ours through its subscription's tags, not the invoice's own", () => {
  const ours = read("invoice.paid", {
    id: "in_1",
    object: "invoice",
    metadata: {},
    parent: { type: "subscription_details", quote_details: null, subscription_details: { subscription: "sub_7", metadata: tags } },
  });
  assert.deepEqual(decideEvent(ours), { action: "reconcile", subscriptionId: "sub_7" });

  // The shop's invoices: a one-off invoice without parent, and a subscription of the shop.
  const oneOff = read("invoice.payment_failed", { id: "in_2", object: "invoice", metadata: { app: "valuaxis" }, parent: null });
  assert.deepEqual(decideEvent(oneOff), { action: "ignore", reason: "NOT_VALUAXIS" });
  const shop = read("invoice.paid", {
    id: "in_3",
    object: "invoice",
    metadata: {},
    parent: { type: "subscription_details", quote_details: null, subscription_details: { subscription: "sub_shop", metadata: { order_id: "991" } } },
  });
  assert.deepEqual(decideEvent(shop), { action: "ignore", reason: "NOT_VALUAXIS" });
});

test("an event type this code does not know is read without failing, and ignored", () => {
  const event = read("charge.refunded", { id: "ch_1", object: "charge", metadata: tags });
  assert.equal(event.metadata, null);
  assert.deepEqual(decideEvent(event), { action: "ignore", reason: "UNHANDLED_TYPE" });
  assert.deepEqual(decideEvent(read("v2.made.up", {})), { action: "ignore", reason: "UNHANDLED_TYPE" });
});

test("the proxy lets only POST /api/stripe/webhook through without the same-origin check", async () => {
  const from = (method: string, path: string) =>
    proxy(new NextRequest(`https://valuaxissoft.com${path}`, { method, headers: { origin: "https://hooks.stripe.example" } }));
  assert.notEqual((await from("POST", "/api/stripe/webhook")).status, 403);
  for (const [method, path] of [
    ["PUT", "/api/stripe/webhook"],
    ["POST", "/api/stripe/webhook/"],
    ["POST", "/api/stripe/webhook/extra"],
    ["POST", "/api/stripe"],
    ["POST", "/api/organizacion/facturacion/checkout"],
  ]) {
    assert.equal((await from(method, path)).status, 403, `${method} ${path}`);
  }
});

/**
 * Billing against the local database, with an in-memory Stripe
 * (tests/support/fake-billing-gateway.ts): catalog sync, checkout, the two
 * reconciliation paths (success page and webhook), cancellation, tenant
 * isolation and the events of the other business that shares the account.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { syncBillingCatalog } from "../../src/features/billing/billing-catalog.service";
import { BILLING_GRACE_DAYS, stripeProductId, valuaxisMetadata } from "../../src/features/billing/billing-rules";
import { handleStripeWebhook } from "../../src/features/billing/billing-webhook.service";
import { BillingError, getBillingOverview, openPortal, startCheckout } from "../../src/features/billing/billing.service";
import {
  applySubscription,
  findBillingCustomer,
  reconcileCheckoutSession,
  reconcileSubscription,
  refreshOrganizationSubscription,
} from "../../src/features/billing/subscription-sync.service";
import { createFakeBillingGateway, fakeSignature } from "../support/fake-billing-gateway";
import { assertLocalDatabase, createAuthUserFixture, prisma } from "./support";

const SECRET = "whsec_integration_only";
const DAY = 24 * 60 * 60 * 1000;
const createdPlans: number[] = [];

after(async () => {
  // Test plans must not stay on sale in the local catalog.
  await prisma.plan.updateMany({ where: { IdPlan: { in: createdPlans } }, data: { BActivo: false, BEsPublico: false } });
  await prisma.$disconnect();
});

/** A sellable plan with one monthly price in MXN: $100.00 + 16%. */
async function createPlan(options: { trialDays?: number; amount?: string } = {}) {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const plan = await prisma.plan.create({
    data: {
      SClave: `PRUEBA_COBRO_${suffix}`,
      SNombre: `Plan de prueba ${suffix}`,
      SDescripcion: "Creado por billing.integration.ts",
      BEsGratuito: false,
      BEsPublico: true,
      BPermitePrueba: Boolean(options.trialDays),
      IDiasPrueba: options.trialDays ?? null,
      IOrden: 900,
    },
  });
  createdPlans.push(plan.IdPlan);
  const price = await prisma.precioPlan.create({
    data: { IdPlan: plan.IdPlan, SClave: `PRUEBA_COBRO_${suffix}_MES`, SMoneda: "MXN", SIntervaloCobro: "MES", NImporte: options.amount ?? "100.00", NImpuestoPorcentaje: "16" },
  });
  return { plan, price };
}

/** An organization with its administrator, as the route handlers see them. */
async function createAdmin(label: string) {
  const fixture = await createAuthUserFixture({ label });
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  const user: AuthUser = {
    id: fixture.userId,
    name: label,
    email: fixture.email,
    role: "ADMINISTRADOR",
    permissions: ["SUSCRIPCION_ADMINISTRAR", "FACTURACION_VER"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };
  return { user, organization };
}

const subscriptionsOf = (organizationId: number) =>
  prisma.suscripcion.findMany({
    where: { IdOrganizacion: organizationId },
    include: { plan: true, estadoSuscripcion: true },
    orderBy: { IdSuscripcion: "asc" },
  });

async function currentOf(organizationId: number) {
  const current = (await subscriptionsOf(organizationId)).filter((row) => row.DFechaFinalizacion === null);
  assert.equal(current.length, 1, "an organization has exactly one current subscription");
  return current[0];
}

/** Everything that defines the row except the bookkeeping timestamp. */
async function rowSnapshot(organizationId: number) {
  const rows = await subscriptionsOf(organizationId);
  return JSON.stringify(rows.map(({ DFechaModificacion: _ignored, plan: _plan, estadoSuscripcion, ...row }) => ({ ...row, IdSuscripcion: String(row.IdSuscripcion), IdPrecioPlan: String(row.IdPrecioPlan), state: estadoSuscripcion.SClave })));
}

const webhookEvents = (subscriptionId: string) =>
  prisma.eventoWebhookPago.findMany({ where: { JPayloadSanitizado: { path: ["subscription"], equals: subscriptionId } } });

/** Subscribes the organization through the checkout and the success page. */
async function subscribe(fake: ReturnType<typeof createFakeBillingGateway>, user: AuthUser, pricePublicId: string) {
  const started = await startCheckout(user, pricePublicId, fake.gateway);
  assert.equal(started.destination, "checkout");
  const sessionId = started.url.split("/").pop()!;
  const subscription = fake.payCheckout(sessionId);
  const result = await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId);
  assert.equal(result.applied, true);
  return { sessionId, subscription };
}

describe("catalog sync", () => {
  test("creates a tagged product and price once, and replaces (never edits) a price whose amount changed", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    const only = { planId: plan.IdPlan };

    const first = await syncBillingCatalog(fake.gateway, only);
    assert.deepEqual(first.products.map((item) => item.action), ["created"]);
    assert.deepEqual(first.prices.map((item) => item.action), ["created"]);
    const product = fake.products.get(stripeProductId(plan.UIdentificadorPublico))!;
    assert.equal(product.metadata.app, "valuaxis");
    assert.equal(product.statementDescriptor, "VALUAXIS");
    const stored = await prisma.precioPlan.findUniqueOrThrow({ where: { IdPrecioPlan: price.IdPrecioPlan } });
    const stripePrice = fake.prices.get(stored.SIdentificadorExterno!)!;
    assert.deepEqual(
      [stripePrice.unitAmount, stripePrice.currency, stripePrice.interval, stripePrice.metadata.app, stripePrice.metadata.precio],
      [11600, "mxn", "month", "valuaxis", price.UIdentificadorPublico],
    );

    // Idempotent: nothing is written the second time.
    const writes = fake.writes.length;
    const second = await syncBillingCatalog(fake.gateway, only);
    assert.deepEqual([...second.products, ...second.prices].map((item) => item.action), ["unchanged", "unchanged"]);
    assert.equal(fake.writes.length, writes);

    await prisma.precioPlan.update({ where: { IdPrecioPlan: price.IdPrecioPlan }, data: { NImporte: "150.00" } });
    const third = await syncBillingCatalog(fake.gateway, only);
    assert.deepEqual(third.prices.map((item) => item.action), ["replaced"]);
    const replaced = await prisma.precioPlan.findUniqueOrThrow({ where: { IdPrecioPlan: price.IdPrecioPlan } });
    assert.notEqual(replaced.SIdentificadorExterno, stored.SIdentificadorExterno);
    assert.equal(fake.prices.get(replaced.SIdentificadorExterno!)!.unitAmount, 17400);
    assert.deepEqual([stripePrice.active, stripePrice.unitAmount], [false, 11600], "the old price is archived with its amount untouched");

    // A database restored without the Stripe id finds the price again by its lookup key.
    await prisma.precioPlan.update({ where: { IdPrecioPlan: price.IdPrecioPlan }, data: { SIdentificadorExterno: null } });
    const fourth = await syncBillingCatalog(fake.gateway, only);
    assert.deepEqual(fourth.prices.map((item) => [item.action, item.priceId]), [["unchanged", replaced.SIdentificadorExterno]]);
  });

  test("an object in Stripe that is not tagged as ours is never modified", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    fake.products.set(stripeProductId(plan.UIdentificadorPublico), {
      id: stripeProductId(plan.UIdentificadorPublico),
      name: "De la tienda",
      description: null,
      active: true,
      statementDescriptor: null,
      metadata: {},
    });
    await assert.rejects(syncBillingCatalog(fake.gateway, { planId: plan.IdPlan }), /not tagged app=valuaxis/);
    assert.deepEqual(fake.writes, []);
    assert.equal((await prisma.precioPlan.findUniqueOrThrow({ where: { IdPrecioPlan: price.IdPrecioPlan } })).SIdentificadorExterno, null);
  });

  test("free, private, inactive, expired, one-off and non-MXN prices are not published", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    const base = { IdPlan: plan.IdPlan, SMoneda: "MXN", SIntervaloCobro: "MES", NImporte: "10.00" };
    const key = (name: string) => `${price.SClave}_${name}`;
    await prisma.precioPlan.createMany({
      data: [
        { ...base, SClave: key("USD"), SMoneda: "USD" },
        { ...base, SClave: key("UNICO"), SIntervaloCobro: "UNICO" },
        { ...base, SClave: key("INACTIVO"), BActivo: false },
        { ...base, SClave: key("VENCIDO"), DFechaVigenciaInicio: new Date(Date.now() - 10 * DAY), DFechaVigenciaFin: new Date(Date.now() - DAY) },
        { ...base, SClave: key("FUTURO"), DFechaVigenciaInicio: new Date(Date.now() + DAY) },
      ],
    });
    const report = await syncBillingCatalog(fake.gateway, { planId: plan.IdPlan });
    assert.deepEqual(report.prices.map((item) => item.price), [price.SClave]);

    for (const hidden of [{ BEsGratuito: true }, { BEsPublico: false }, { BActivo: false }]) {
      await prisma.plan.update({ where: { IdPlan: plan.IdPlan }, data: hidden });
      assert.deepEqual((await syncBillingCatalog(fake.gateway, { planId: plan.IdPlan })).products, [], JSON.stringify(hidden));
      await prisma.plan.update({ where: { IdPlan: plan.IdPlan }, data: { BEsGratuito: false, BEsPublico: true, BActivo: true } });
    }
  });
});

describe("checkout and reconciliation", () => {
  test("checkout → success page → webhook replay → cancel: one row per Stripe subscription, same state from every path", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    const { user, organization } = await createAdmin("cobro");

    // A new organization starts on the free base plan (database trigger).
    const base = await currentOf(user.organizationId);
    assert.deepEqual([base.plan.SClave, base.estadoSuscripcion.SClave], ["BORRADOR", "BORRADOR"]);
    const before = await getBillingOverview(user.organizationId, fake.gateway);
    assert.deepEqual([before.enabled, before.current?.paid, before.current?.paidUse], [true, false, false]);
    assert.ok(before.plans.some((item) => item.id === plan.UIdentificadorPublico && item.prices[0].total === 116));

    const started = await startCheckout(user, price.UIdentificadorPublico, fake.gateway);
    assert.equal(started.destination, "checkout");
    const sessionId = started.url.split("/").pop()!;
    const customer = await findBillingCustomer(user.organizationId);
    assert.deepEqual(fake.customers.get(customer!.SIdentificadorExterno)?.metadata, valuaxisMetadata({ organizacion: organization.UIdentificadorPublico }));
    const session = (await fake.gateway.retrieveCheckoutSession(sessionId))!;
    assert.equal(session.clientReferenceId, organization.UIdentificadorPublico);
    assert.deepEqual(session.metadata, valuaxisMetadata({ organizacion: organization.UIdentificadorPublico, plan: plan.SClave, precio: price.UIdentificadorPublico }));

    // Nothing changes until Stripe has a subscription: an abandoned checkout leaves the plan as it was.
    assert.deepEqual(await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId), { applied: false, reason: "NOT_FOUND" });
    assert.equal((await currentOf(user.organizationId)).IdSuscripcion, base.IdSuscripcion);

    const subscription = fake.payCheckout(sessionId);
    assert.deepEqual(await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId), { applied: true, organizationId: user.organizationId, state: "ACTIVA" });
    const active = await currentOf(user.organizationId);
    assert.deepEqual(
      [active.plan.SClave, active.estadoSuscripcion.SClave, active.SProveedorPago, active.SIdentificadorExterno, active.IdPrecioPlan, active.BRenovacionAutomatica],
      [plan.SClave, "ACTIVA", "STRIPE", subscription.id, price.IdPrecioPlan, true],
    );
    assert.deepEqual([active.DFechaPeriodoActualInicio, active.DFechaPeriodoActualFin], [subscription.currentPeriodStart, subscription.currentPeriodEnd]);
    assert.notEqual((await prisma.suscripcion.findUniqueOrThrow({ where: { IdSuscripcion: base.IdSuscripcion } })).DFechaFinalizacion, null);

    // The success page reloaded, and the webhook's events arriving late and twice: the row does not move.
    const settled = await rowSnapshot(user.organizationId);
    await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId);
    const events = ["checkout.session.completed", "customer.subscription.created", "invoice.paid"].map((type) => fake.webhookRequest(type, subscription.id, SECRET));
    for (const request of [...events, ...events]) {
      const response = await handleStripeWebhook(request, fake.gateway, SECRET);
      assert.equal(response.status, 200);
    }
    assert.equal(await rowSnapshot(user.organizationId), settled);
    const stored = await webhookEvents(subscription.id);
    assert.equal(stored.length, 3);
    assert.ok(stored.every((event) => event.BProcesado && event.BVerificado && event.IIntentosProcesamiento === 1), "each event is processed exactly once");
    assert.deepEqual((await handleStripeWebhook(events[0], fake.gateway, SECRET)).body, { received: true, duplicate: true });

    const overview = await getBillingOverview(user.organizationId, fake.gateway);
    assert.deepEqual([overview.current?.paid, overview.current?.paidUse, overview.current?.stateLabel, overview.current?.cancelsAt], [true, true, "Activa", null]);
    assert.equal(overview.current?.periodEndsAt, subscription.currentPeriodEnd!.toISOString());
    assert.equal(overview.plans.find((item) => item.id === plan.UIdentificadorPublico)?.prices[0].current, true);

    // Cancelled in the portal for the end of the period.
    const canceledAt = new Date(subscription.startDate.getTime() + DAY);
    fake.changeSubscription(subscription.id, { cancelAtPeriodEnd: true, canceledAt, cancellationReason: "cancellation_requested" });
    await refreshOrganizationSubscription(fake.gateway, user.organizationId);
    const scheduled = await currentOf(user.organizationId);
    assert.deepEqual([scheduled.estadoSuscripcion.SClave, scheduled.BCancelarAlFinalPeriodo, scheduled.BRenovacionAutomatica], ["ACTIVA", true, false]);
    assert.equal((await getBillingOverview(user.organizationId, fake.gateway)).current?.cancelsAt, subscription.currentPeriodEnd!.toISOString());

    // The period ends: Stripe deletes the subscription and tells the webhook.
    fake.changeSubscription(subscription.id, { status: "canceled", endedAt: subscription.currentPeriodEnd });
    const deleted = fake.webhookRequest("customer.subscription.deleted", subscription.id, SECRET);
    assert.deepEqual((await handleStripeWebhook(deleted, fake.gateway, SECRET)).body, { received: true, state: "CANCELADA" });
    const rows = await subscriptionsOf(user.organizationId);
    const ended = rows.find((row) => row.SIdentificadorExterno === subscription.id)!;
    assert.deepEqual([ended.estadoSuscripcion.SClave, ended.DFechaFinalizacion, ended.DFechaCancelacion], ["CANCELADA", subscription.currentPeriodEnd, canceledAt]);
    const back = await currentOf(user.organizationId);
    assert.deepEqual([back.plan.SClave, back.estadoSuscripcion.SClave, back.SProveedorPago], ["BORRADOR", "BORRADOR", null]);
    assert.equal(rows.length, 3, "the first base row, the Stripe subscription and the new base row");

    // The page reloaded afterwards changes nothing, and the organization can subscribe again.
    const final = await rowSnapshot(user.organizationId);
    await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId);
    await reconcileSubscription(fake.gateway, subscription.id);
    assert.equal(await rowSnapshot(user.organizationId), final);
    assert.equal((await startCheckout(user, price.UIdentificadorPublico, fake.gateway)).destination, "checkout");
  });

  test("the webhook alone activates the plan when the customer never returns to the success page", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    const { user } = await createAdmin("solo-webhook");
    const started = await startCheckout(user, price.UIdentificadorPublico, fake.gateway);
    const sessionId = started.url.split("/").pop()!;
    const subscription = fake.payCheckout(sessionId);

    const response = await handleStripeWebhook(fake.webhookRequest("checkout.session.completed", subscription.id, SECRET), fake.gateway, SECRET);
    assert.deepEqual(response, { status: 200, body: { received: true, state: "ACTIVA" } });
    assert.equal((await currentOf(user.organizationId)).plan.SClave, plan.SClave);

    const fromWebhook = await rowSnapshot(user.organizationId);
    await reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId);
    assert.equal(await rowSnapshot(user.organizationId), fromWebhook, "the success page converges to the same row");
  });

  test("the success page and the webhook at the same moment leave one subscription", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const { user } = await createAdmin("simultaneo");
    const started = await startCheckout(user, price.UIdentificadorPublico, fake.gateway);
    const sessionId = started.url.split("/").pop()!;
    const subscription = fake.payCheckout(sessionId);
    const results = await Promise.all([
      reconcileCheckoutSession(fake.gateway, user.organizationId, sessionId),
      handleStripeWebhook(fake.webhookRequest("customer.subscription.created", subscription.id, SECRET), fake.gateway, SECRET),
      handleStripeWebhook(fake.webhookRequest("invoice.paid", subscription.id, SECRET), fake.gateway, SECRET),
      reconcileSubscription(fake.gateway, subscription.id),
    ]);
    assert.equal(results[1].status, 200);
    assert.equal(results[2].status, 200);
    assert.equal((await currentOf(user.organizationId)).SIdentificadorExterno, subscription.id);
    assert.equal((await subscriptionsOf(user.organizationId)).length, 2);
  });

  test("a plan with a trial starts in trial, once; failed payments go through grace to suspension", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan({ trialDays: 7 });
    const { user } = await createAdmin("prueba");
    const offered = (await getBillingOverview(user.organizationId, fake.gateway)).plans.find((item) => item.id === plan.UIdentificadorPublico);
    assert.equal(offered?.trialDays, 7);

    const { subscription } = await subscribe(fake, user, price.UIdentificadorPublico);
    const trial = await currentOf(user.organizationId);
    assert.deepEqual([trial.estadoSuscripcion.SClave, trial.BEsPrueba, trial.DFechaFinPrueba], ["PRUEBA", true, subscription.trialEnd]);
    const overview = await getBillingOverview(user.organizationId, fake.gateway);
    assert.deepEqual([overview.current?.paidUse, overview.current?.trialEndsAt], [true, subscription.trialEnd!.toISOString()]);
    assert.equal(overview.plans.find((item) => item.id === plan.UIdentificadorPublico)?.trialDays, null, "the trial is not offered twice");

    // The trial ends and the card is declined.
    const periodStart = subscription.trialEnd!;
    fake.changeSubscription(subscription.id, { status: "past_due", currentPeriodStart: periodStart, currentPeriodEnd: new Date(periodStart.getTime() + 30 * DAY) });
    await handleStripeWebhook(fake.webhookRequest("invoice.payment_failed", subscription.id, SECRET), fake.gateway, SECRET);
    const pastDue = await currentOf(user.organizationId);
    assert.deepEqual([pastDue.estadoSuscripcion.SClave, pastDue.BEsPrueba], ["PAGO_PENDIENTE", false]);
    assert.equal(pastDue.DFechaGraciaFin?.getTime(), periodStart.getTime() + BILLING_GRACE_DAYS * DAY);
    const inGrace = await getBillingOverview(user.organizationId, fake.gateway, new Date(periodStart.getTime() + DAY));
    assert.deepEqual([inGrace.current?.paidUse, inGrace.current?.stateLabel], [true, "Pago pendiente"]);
    const afterGrace = await getBillingOverview(user.organizationId, fake.gateway, new Date(periodStart.getTime() + (BILLING_GRACE_DAYS + 1) * DAY));
    assert.equal(afterGrace.current?.paidUse, false);

    // Stripe gives up retrying.
    fake.changeSubscription(subscription.id, { status: "unpaid" });
    await handleStripeWebhook(fake.webhookRequest("customer.subscription.updated", subscription.id, SECRET), fake.gateway, SECRET);
    const suspended = await currentOf(user.organizationId);
    assert.deepEqual([suspended.estadoSuscripcion.SClave, suspended.DFechaGraciaFin, suspended.SIdentificadorExterno], ["SUSPENDIDA", null, subscription.id]);

    // The card is fixed: the same subscription is active again.
    fake.changeSubscription(subscription.id, { status: "active" });
    await handleStripeWebhook(fake.webhookRequest("invoice.paid", subscription.id, SECRET), fake.gateway, SECRET);
    assert.equal((await currentOf(user.organizationId)).estadoSuscripcion.SClave, "ACTIVA");

    // A second subscription after this one ends does not get another trial.
    fake.changeSubscription(subscription.id, { status: "canceled", endedAt: new Date() });
    await reconcileSubscription(fake.gateway, subscription.id);
    const again = await startCheckout(user, price.UIdentificadorPublico, fake.gateway);
    assert.equal(fake.payCheckout(again.url.split("/").pop()!).status, "active");
  });

  test("an organization with a live subscription is sent to the portal instead of buying a second one", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const other = await createPlan({ amount: "300.00" });
    const { user } = await createAdmin("una-sola");
    const { subscription } = await subscribe(fake, user, price.UIdentificadorPublico);
    const checkouts = () => fake.writes.filter((write) => write.startsWith("checkout.create")).length;
    const created = checkouts();

    for (const choice of [price, other.price]) {
      const result = await startCheckout(user, choice.UIdentificadorPublico, fake.gateway);
      assert.equal(result.destination, "portal");
    }
    assert.equal(checkouts(), created, "no second checkout session");
    assert.equal(fake.subscriptions.size, 1);
    assert.equal(fake.portalSessions.at(-1)?.customerId, subscription.customerId);
    assert.deepEqual(await openPortal(user, fake.gateway), { url: `https://billing.stripe.test/${subscription.customerId}` });

    // The plan was changed in the portal: the same row follows the new price.
    await syncBillingCatalog(fake.gateway, { planId: other.plan.IdPlan });
    const newPrice = await prisma.precioPlan.findUniqueOrThrow({ where: { IdPrecioPlan: other.price.IdPrecioPlan } });
    fake.changeSubscription(subscription.id, { priceId: newPrice.SIdentificadorExterno, priceMetadata: fake.prices.get(newPrice.SIdentificadorExterno!)!.metadata });
    await refreshOrganizationSubscription(fake.gateway, user.organizationId);
    const changed = await currentOf(user.organizationId);
    assert.deepEqual([changed.plan.SClave, changed.IdPrecioPlan, changed.SIdentificadorExterno], [other.plan.SClave, other.price.IdPrecioPlan, subscription.id]);

    // A subscriber on a price since replaced in Stripe is still recognized by the tag of the old price.
    await prisma.precioPlan.update({ where: { IdPrecioPlan: other.price.IdPrecioPlan }, data: { NImporte: "350.00" } });
    await syncBillingCatalog(fake.gateway, { planId: other.plan.IdPlan });
    await refreshOrganizationSubscription(fake.gateway, user.organizationId);
    assert.equal((await currentOf(user.organizationId)).IdPrecioPlan, other.price.IdPrecioPlan);
  });

  test("a price that is not on sale cannot be bought, and nothing is bought without Stripe", async () => {
    const fake = createFakeBillingGateway();
    const { plan, price } = await createPlan();
    const { user } = await createAdmin("no-vendible");
    const rejects = (promise: Promise<unknown>, status: number) =>
      assert.rejects(promise, (error: unknown) => error instanceof BillingError && error.status === status);

    await rejects(startCheckout(user, randomUUID(), fake.gateway), 404);
    await prisma.plan.update({ where: { IdPlan: plan.IdPlan }, data: { BEsPublico: false } });
    await rejects(startCheckout(user, price.UIdentificadorPublico, fake.gateway), 404);
    await prisma.plan.update({ where: { IdPlan: plan.IdPlan }, data: { BEsPublico: true } });

    // Payments not enabled: the page still shows the plan, and the actions say so.
    const overview = await getBillingOverview(user.organizationId, null);
    assert.deepEqual([overview.enabled, overview.current?.stateKey], [false, "BORRADOR"]);
    await rejects(startCheckout(user, price.UIdentificadorPublico, null), 503);
    await rejects(openPortal(user, null), 503);
    await rejects(openPortal(user, fake.gateway), 409);
    assert.deepEqual(fake.writes, []);
    assert.equal(await findBillingCustomer(user.organizationId), null);
  });
});

describe("tenant isolation", () => {
  test("an organization never sees or acts on another's customer, session or subscription", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const a = await createAdmin("inquilino-a");
    const b = await createAdmin("inquilino-b");
    const { sessionId, subscription } = await subscribe(fake, a.user, price.UIdentificadorPublico);
    const customerA = (await findBillingCustomer(a.user.organizationId))!.SIdentificadorExterno;
    const snapshotA = await rowSnapshot(a.user.organizationId);
    const snapshotB = await rowSnapshot(b.user.organizationId);

    // B opens the success page with A's session id (a guessed or leaked URL).
    assert.deepEqual(await reconcileCheckoutSession(fake.gateway, b.user.organizationId, sessionId), { applied: false, reason: "NOT_FOUND" });
    // B has no customer: no portal, and never A's.
    await assert.rejects(openPortal(b.user, fake.gateway), BillingError);
    assert.ok(fake.portalSessions.every((session) => session.customerId !== customerA));
    assert.equal((await getBillingOverview(b.user.organizationId, fake.gateway)).current?.paid, false);

    // B subscribes on its own: a different customer, its own subscription.
    const own = await subscribe(fake, b.user, price.UIdentificadorPublico);
    const customerB = (await findBillingCustomer(b.user.organizationId))!.SIdentificadorExterno;
    assert.notEqual(customerB, customerA);
    assert.equal((await currentOf(b.user.organizationId)).SIdentificadorExterno, own.subscription.id);
    assert.deepEqual(await openPortal(b.user, fake.gateway), { url: `https://billing.stripe.test/${customerB}` });
    assert.equal(await rowSnapshot(a.user.organizationId), snapshotA);

    // A session of B's with A's organization in the address is still not A's.
    assert.deepEqual(await reconcileCheckoutSession(fake.gateway, a.user.organizationId, own.sessionId), { applied: false, reason: "NOT_FOUND" });

    // A subscription claiming to be B's (tags) but held by A's customer is refused,
    // as is A's subscription re-tagged as B's.
    const forged = fake.addSubscription({ customerId: customerA, priceId: subscription.priceId!, metadata: valuaxisMetadata({ organizacion: b.organization.UIdentificadorPublico }) });
    assert.deepEqual(await applySubscription(forged), { applied: false, reason: "CUSTOMER_MISMATCH" });
    const retagged = fake.changeSubscription(subscription.id, { metadata: valuaxisMetadata({ organizacion: b.organization.UIdentificadorPublico }) });
    assert.deepEqual(await applySubscription(retagged), { applied: false, reason: "CUSTOMER_MISMATCH" });
    const moved = fake.changeSubscription(subscription.id, { customerId: customerB });
    assert.deepEqual(await applySubscription(moved), { applied: false, reason: "CUSTOMER_MISMATCH" });
    assert.equal(await rowSnapshot(a.user.organizationId), snapshotA);
    assert.notEqual(await rowSnapshot(b.user.organizationId), snapshotB);
    assert.equal((await currentOf(b.user.organizationId)).SIdentificadorExterno, own.subscription.id);
  });

  test("a stored customer id that is not this organization's own tagged customer is never used", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const a = await createAdmin("cliente-a");
    const b = await createAdmin("cliente-b");
    await subscribe(fake, a.user, price.UIdentificadorPublico);
    const customerA = (await findBillingCustomer(a.user.organizationId))!;
    // The database refuses to give B the customer A already holds.
    await assert.rejects(
      prisma.clientePago.create({ data: { IdOrganizacion: b.user.organizationId, IdProveedorPago: customerA.IdProveedorPago, SIdentificadorExterno: customerA.SIdentificadorExterno } }),
    );

    // B's row pointing at a customer of the shop (no tags), or at one tagged for another organization.
    const shop = { id: `cus_tienda_${randomUUID().slice(0, 8)}`, metadata: {} };
    const foreign = { id: `cus_otra_org_${randomUUID().slice(0, 8)}`, metadata: valuaxisMetadata({ organizacion: a.organization.UIdentificadorPublico }) };
    for (const customer of [shop, foreign]) {
      fake.customers.set(customer.id, customer);
      const key = { IdOrganizacion: b.user.organizationId, IdProveedorPago: customerA.IdProveedorPago };
      await prisma.clientePago.upsert({ where: { IdOrganizacion_IdProveedorPago: key }, create: { ...key, SIdentificadorExterno: customer.id }, update: { SIdentificadorExterno: customer.id } });
      const writes = fake.writes.length;
      await assert.rejects(startCheckout(b.user, price.UIdentificadorPublico, fake.gateway), BillingError);
      await assert.rejects(openPortal(b.user, fake.gateway), BillingError);
      assert.equal(fake.writes.length, writes);
      assert.ok(fake.portalSessions.every((session) => session.customerId !== customer.id));
    }
  });
});

describe("webhook", () => {
  test("events of the business that shares the Stripe account are acknowledged and dropped", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const { user, organization } = await createAdmin("tienda");
    const { subscription } = await subscribe(fake, user, price.UIdentificadorPublico);
    const snapshot = await rowSnapshot(user.organizationId);
    const shopSubscription = fake.addSubscription({ customerId: "cus_tienda", priceId: "price_tienda", metadata: { order_id: "1042" } });
    let retrieved = 0;
    const watched = { ...fake.gateway, retrieveSubscription: (id: string) => (retrieved++, fake.gateway.retrieveSubscription(id)) };

    for (const type of ["customer.subscription.created", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed", "checkout.session.completed", "customer.subscription.deleted"]) {
      const response = await handleStripeWebhook(fake.webhookRequest(type, shopSubscription.id, SECRET), watched, SECRET);
      assert.deepEqual(response, { status: 200, body: { received: true, ignored: "NOT_VALUAXIS" } }, type);
    }
    // Event types Valuaxis does not use, even about its own subscription.
    for (const type of ["charge.succeeded", "payment_intent.succeeded", "customer.updated", "product.updated"]) {
      const response = await handleStripeWebhook(fake.webhookRequest(type, subscription.id, SECRET), watched, SECRET);
      assert.deepEqual(response.body, { received: true, ignored: "UNHANDLED_TYPE" }, type);
    }
    assert.equal(retrieved, 0, "Stripe is not asked about objects that are not ours");
    assert.deepEqual(await webhookEvents(shopSubscription.id), [], "and nothing of theirs is stored");
    assert.equal(await rowSnapshot(user.organizationId), snapshot);

    // An event whose payload claims our tag for a subscription that is not ours in Stripe.
    const lying = fake.webhookRequest("customer.subscription.updated", shopSubscription.id, SECRET, { metadata: valuaxisMetadata({ organizacion: organization.UIdentificadorPublico }) });
    assert.deepEqual((await handleStripeWebhook(lying, fake.gateway, SECRET)).body, { received: true, ignored: "NOT_VALUAXIS" });
    // A tagged subscription of an organization that does not exist here (another environment).
    const elsewhere = fake.addSubscription({ customerId: "cus_x", priceId: "price_x", metadata: valuaxisMetadata({ organizacion: randomUUID() }) });
    assert.deepEqual((await handleStripeWebhook(fake.webhookRequest("customer.subscription.created", elsewhere.id, SECRET), fake.gateway, SECRET)).body, {
      received: true,
      ignored: "UNKNOWN_ORGANIZATION",
    });
    // A subscription deleted in Stripe before we could read it.
    assert.deepEqual((await handleStripeWebhook(fake.webhookRequest("invoice.paid", "sub_gone", SECRET, { metadata: valuaxisMetadata() }), fake.gateway, SECRET)).body, {
      received: true,
      ignored: "NOT_FOUND",
    });
    assert.equal(await rowSnapshot(user.organizationId), snapshot);
  });

  test("without a valid signature nothing is read; without a secret nothing is accepted", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const { user } = await createAdmin("firma");
    const { subscription } = await subscribe(fake, user, price.UIdentificadorPublico);
    fake.changeSubscription(subscription.id, { status: "canceled", endedAt: new Date() });
    const request = fake.webhookRequest("customer.subscription.deleted", subscription.id, SECRET);
    const snapshot = await rowSnapshot(user.organizationId);

    assert.equal((await handleStripeWebhook({ ...request, signature: null }, fake.gateway, SECRET)).status, 400);
    assert.equal((await handleStripeWebhook({ ...request, signature: fakeSignature("whsec_other") }, fake.gateway, SECRET)).status, 400);
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal((await handleStripeWebhook({ rawBody: "not json", signature: fakeSignature(SECRET) }, fake.gateway, SECRET)).status, 400);
    } finally {
      console.warn = warn;
    }
    assert.equal((await handleStripeWebhook(request, fake.gateway, "")).status, 503);
    assert.equal((await handleStripeWebhook(request, fake.gateway, undefined)).status, 503);
    assert.equal((await handleStripeWebhook(request, null, SECRET)).status, 503);
    assert.equal((await handleStripeWebhook({ rawBody: "x".repeat(1_000_001), signature: fakeSignature(SECRET) }, fake.gateway, SECRET)).status, 413);
    assert.equal(await rowSnapshot(user.organizationId), snapshot);
    assert.deepEqual(await prisma.eventoWebhookPago.findMany({ where: { SIdentificadorEvento: request.event.id } }), []);

    // The same request, properly signed, is the one that cancels.
    assert.equal((await handleStripeWebhook(request, fake.gateway, SECRET)).status, 200);
    assert.equal((await currentOf(user.organizationId)).plan.SClave, "BORRADOR");
  });

  test("an event that fails is answered 500 and processed when Stripe sends it again", async () => {
    const fake = createFakeBillingGateway();
    const { price } = await createPlan();
    const { user } = await createAdmin("reintento");
    const started = await startCheckout(user, price.UIdentificadorPublico, fake.gateway);
    const subscription = fake.payCheckout(started.url.split("/").pop()!);
    const request = fake.webhookRequest("customer.subscription.created", subscription.id, SECRET);
    const down = { ...fake.gateway, retrieveSubscription: async () => Promise.reject(new Error("Stripe is unreachable")) };

    const original = console.error;
    console.error = () => {};
    try {
      assert.equal((await handleStripeWebhook(request, down, SECRET)).status, 500);
    } finally {
      console.error = original;
    }
    const failed = await prisma.eventoWebhookPago.findFirstOrThrow({ where: { SIdentificadorEvento: request.event.id } });
    assert.deepEqual([failed.BProcesado, failed.IIntentosProcesamiento, failed.SMensajeError], [false, 1, "Stripe is unreachable"]);
    assert.equal((await currentOf(user.organizationId)).plan.SClave, "BORRADOR");

    assert.deepEqual((await handleStripeWebhook(request, fake.gateway, SECRET)).body, { received: true, state: "ACTIVA" });
    const retried = await prisma.eventoWebhookPago.findFirstOrThrow({ where: { SIdentificadorEvento: request.event.id } });
    assert.deepEqual([retried.BProcesado, retried.IIntentosProcesamiento, retried.SMensajeError], [true, 2, null]);
  });
});

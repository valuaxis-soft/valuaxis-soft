/**
 * Pay per appraisal against the local database, with an in-memory Stripe
 * (tests/support/fake-billing-gateway.ts): package sync, the one-time
 * checkout, crediting once from the success page and the webhook, the
 * consumption on conclude (once per valuation), the enforcement flag, manual
 * adjustments and tenant isolation.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { BillingError } from "../../src/features/billing/billing-errors";
import { getBillingOverview } from "../../src/features/billing/billing.service";
import { stripePackageProductId } from "../../src/features/billing/credit-rules";
import { reconcilePackageCheckout, startPackageCheckout, syncCreditPackages } from "../../src/features/billing/credit-packages.service";
import { adjustCredits, getCreditBalance, listCreditMovements, setCreditEnforcement } from "../../src/features/billing/credits.service";
import { handleStripeWebhook } from "../../src/features/billing/billing-webhook.service";
import {
  concludeValuation,
  reopenValuation,
  saveValuationSections,
  ValuationWorkflowError,
  type SectionPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { createFakeBillingGateway } from "../support/fake-billing-gateway";
import { assertLocalDatabase, createAuthUserFixture, prisma } from "./support";

const SECRET = "whsec_credits_integration_only";
const createdPackages: number[] = [];

after(async () => {
  // Test packages must not stay on sale in the local catalog.
  await prisma.paqueteCreditos.updateMany({ where: { IdPaqueteCreditos: { in: createdPackages } }, data: { BActivo: false, BEsPublico: false } });
  await prisma.$disconnect();
});

/** A sellable package: 10 credits at $140.00 each + 16%. */
async function createPackage(options: { credits?: number; amount?: string } = {}) {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const pkg = await prisma.paqueteCreditos.create({
    data: {
      SClave: `PRUEBA_CREDITOS_${suffix}`,
      SNombre: `Paquete de prueba ${suffix}`,
      SDescripcion: "Creado por billing-credits.integration.ts",
      ICreditos: options.credits ?? 10,
      NImporte: options.amount ?? "1400.00",
      NImpuestoPorcentaje: "16",
      IOrden: 900,
    },
  });
  createdPackages.push(pkg.IdPaqueteCreditos);
  return pkg;
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
    permissions: ["SUSCRIPCION_ADMINISTRAR", "FACTURACION_VER", "AVALUO_CONCLUIR"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };
  return { user, organization };
}

/** A valuation of the organization with enough content to be concluded. */
async function createConcludableValuation(user: AuthUser) {
  const [state, appraisalType, propertyType, operationType] = await Promise.all([
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
  ]);
  const valuation = await prisma.avaluo.create({
    data: {
      IdOrganizacion: user.organizationId,
      IdUsuarioCreador: user.id,
      IdEstadoAvaluo: state.IdEstadoAvaluo,
      IdTipoAvaluo: appraisalType.IdTipoAvaluo,
      IdTipoInmueble: propertyType.IdTipoInmueble,
      IdTipoOperacion: operationType.IdTipoOperacion,
      SFolio: `CRED-${randomUUID().slice(0, 8)}`,
      STitulo: "Avalúo de prueba de créditos",
      DFechaModificacion: new Date(),
    },
  });
  const sections: SectionPayload[] = [
    {
      id: "costos",
      label: "ENF. COSTOS",
      title: "ENF. COSTOS",
      blocks: [{ id: "bloque-terreno", title: "Terreno", concepts: [{ id: "concepto-valor-unitario", label: "Valor unitario", value: "7,000.00" }], subBlocks: [], tables: [] }],
    },
  ];
  await saveValuationSections({ publicId: valuation.UIdentificadorPublico, organizationId: user.organizationId, user, sections });
  return valuation;
}

const conclude = (user: AuthUser, publicId: string) => concludeValuation({ publicId, organizationId: user.organizationId, user });
const reopen = (user: AuthUser, publicId: string) =>
  reopenValuation({ publicId, organizationId: user.organizationId, user, reason: "Corrección", acceptedText: "Acepto reabrir el avalúo" });

const purchaseRows = (organizationId: number) => prisma.movimientoCreditos.findMany({ where: { IdOrganizacion: organizationId, STipo: "COMPRA" } });

/** Buys the package through the checkout and Stripe's page; returns the session to reconcile. */
async function buy(fake: ReturnType<typeof createFakeBillingGateway>, user: AuthUser, packagePublicId: string) {
  const started = await startPackageCheckout(user, packagePublicId, fake.gateway);
  const sessionId = started.url.split("/").pop()!;
  fake.payPurchase(sessionId);
  return sessionId;
}

describe("package catalog", () => {
  test("syncs a tagged product and a one-time price once; a changed amount replaces (never edits) the price", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const only = { packageId: pkg.IdPaqueteCreditos };

    const first = await syncCreditPackages(fake.gateway, only);
    assert.deepEqual(first.map((item) => item.action), ["created"]);
    const product = fake.products.get(stripePackageProductId(pkg.UIdentificadorPublico))!;
    assert.equal(product.metadata.app, "valuaxis");
    const stored = await prisma.paqueteCreditos.findUniqueOrThrow({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos } });
    const price = fake.prices.get(stored.SIdentificadorExterno!)!;
    assert.deepEqual([price.unitAmount, price.currency, price.interval, price.metadata.app, price.metadata.creditos], [162400, "mxn", null, "valuaxis", "10"]);

    const writes = fake.writes.length;
    assert.deepEqual((await syncCreditPackages(fake.gateway, only)).map((item) => item.action), ["unchanged"]);
    assert.equal(fake.writes.length, writes, "a second run writes nothing");

    await prisma.paqueteCreditos.update({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos }, data: { NImporte: "1500.00" } });
    assert.deepEqual((await syncCreditPackages(fake.gateway, only)).map((item) => item.action), ["replaced"]);
    const replaced = await prisma.paqueteCreditos.findUniqueOrThrow({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos } });
    assert.notEqual(replaced.SIdentificadorExterno, stored.SIdentificadorExterno);
    assert.deepEqual([price.active, price.unitAmount], [false, 162400], "the old price is archived with its amount untouched");
  });

  test("the overview lists the packages with their per-credit price and the organization starts at zero, enforcement off", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage({ credits: 30, amount: "3750.00" });
    const { user } = await createAdmin("resumen");
    const overview = await getBillingOverview(user.organizationId, fake.gateway);
    const shown = overview.credits.packages.find((item) => item.id === pkg.UIdentificadorPublico);
    assert.ok(shown);
    assert.deepEqual([shown.credits, shown.subtotal, shown.total, shown.perCredit], [30, 3750, 4350, 125]);
    assert.deepEqual([overview.credits.balance, overview.credits.enforced, overview.credits.movements, overview.hasCustomer], [0, false, [], false]);
  });
});

describe("purchase", () => {
  test("the success page credits the package once; the webhook replay and a second visit add nothing", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const { user, organization } = await createAdmin("compra");

    const sessionId = await buy(fake, user, pkg.UIdentificadorPublico);
    const session = fake.gateway.retrieveCheckoutSession(sessionId);
    assert.equal((await session)!.mode, "payment");
    assert.equal((await session)!.metadata.organizacion, organization.UIdentificadorPublico);

    const first = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(first.applied);
    assert.deepEqual([first.credited, first.credits, first.balance], [true, 10, 10]);

    const again = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(again.applied);
    assert.deepEqual([again.credited, again.balance], [false, 10]);

    const request = fake.purchaseWebhookRequest(sessionId, SECRET);
    const webhook = await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, fake.gateway, SECRET);
    assert.deepEqual(webhook, { status: 200, body: { received: true, credits: 10, credited: false } });
    // The same event delivered again is a duplicate before anything is asked of Stripe.
    const replay = await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, fake.gateway, SECRET);
    assert.deepEqual(replay, { status: 200, body: { received: true, duplicate: true } });

    assert.equal((await purchaseRows(user.organizationId)).length, 1);
    assert.equal(await getCreditBalance(user.organizationId), 10);
    const overview = await getBillingOverview(user.organizationId, fake.gateway);
    assert.equal(overview.hasCustomer, true);
    assert.equal(overview.credits.movements[0]?.type, "COMPRA");
    assert.equal(overview.credits.movements[0]?.credits, 10);
  });

  test("the webhook alone credits the purchase when it arrives before the success page", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage({ credits: 1, amount: "150.00" });
    const { user } = await createAdmin("webhook");
    const sessionId = await buy(fake, user, pkg.UIdentificadorPublico);

    const request = fake.purchaseWebhookRequest(sessionId, SECRET);
    const webhook = await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, fake.gateway, SECRET);
    assert.deepEqual(webhook.body, { received: true, credits: 1, credited: true });
    const page = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(page.applied && !page.credited);
    assert.equal(await getCreditBalance(user.organizationId), 1);
  });

  test("an unpaid session credits nothing; it is credited once Stripe says paid", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const { user } = await createAdmin("pendiente");
    const started = await startPackageCheckout(user, pkg.UIdentificadorPublico, fake.gateway);
    const sessionId = started.url.split("/").pop()!;

    assert.deepEqual(await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId }), { applied: false, reason: "NOT_PAID" });
    assert.equal(await getCreditBalance(user.organizationId), 0);
    fake.payPurchase(sessionId);
    const paid = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(paid.applied && paid.credited);
  });

  test("a package that is not on sale cannot be bought, and nothing without Stripe", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    await prisma.paqueteCreditos.update({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos }, data: { BEsPublico: false } });
    const { user } = await createAdmin("retirado");
    await assert.rejects(startPackageCheckout(user, pkg.UIdentificadorPublico, fake.gateway), (error: unknown) => error instanceof BillingError && error.status === 404);
    await assert.rejects(startPackageCheckout(user, randomUUID(), fake.gateway), (error: unknown) => error instanceof BillingError && error.status === 404);
    await assert.rejects(startPackageCheckout(user, pkg.UIdentificadorPublico, null), (error: unknown) => error instanceof BillingError && error.status === 503);
  });
});

describe("consumption on conclude", () => {
  test("the first conclusion consumes one credit with the valuation's reference; reopening and concluding again is free", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const { user } = await createAdmin("consumo");
    const sessionId = await buy(fake, user, pkg.UIdentificadorPublico);
    await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    const valuation = await createConcludableValuation(user);

    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), 9);
    const movements = await listCreditMovements(user.organizationId);
    assert.equal(movements[0]?.type, "CONSUMO");
    assert.deepEqual(movements[0]?.valuation, { id: valuation.UIdentificadorPublico, folio: valuation.SFolio });

    // Concluding an already concluded valuation is a no-op.
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), 9);

    await reopen(user, valuation.UIdentificadorPublico);
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), 9, "re-concluding the same valuation does not consume again");
    assert.equal((await prisma.movimientoCreditos.count({ where: { IdAvaluo: valuation.IdAvaluo } })), 1);
  });

  test("with enforcement off, concluding without balance records the consumption and the balance goes negative", async () => {
    const { user } = await createAdmin("sin-cobro");
    const valuation = await createConcludableValuation(user);
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), -1);
    const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { IdAvaluo: valuation.IdAvaluo } });
    assert.equal(concluded.BBloqueado, true);
  });

  test("with enforcement on, concluding without balance is blocked with a message and the link to buy, and nothing is written", async () => {
    const { user } = await createAdmin("con-cobro");
    await setCreditEnforcement(user.organizationId, true);
    const valuation = await createConcludableValuation(user);

    await assert.rejects(conclude(user, valuation.UIdentificadorPublico), (error: unknown) => {
      assert.ok(error instanceof ValuationWorkflowError);
      assert.equal(error.status, 409);
      assert.match(error.message, /Plan y facturación/);
      assert.equal(error.link, "/organizacion/facturacion");
      return true;
    });
    const untouched = await prisma.avaluo.findUniqueOrThrow({ where: { IdAvaluo: valuation.IdAvaluo } });
    assert.equal(untouched.BBloqueado, false, "the valuation stays open");
    assert.equal(await getCreditBalance(user.organizationId), 0);

    // A manual adjustment (a courtesy credit) unblocks it.
    const adjusted = await adjustCredits({ organizationId: user.organizationId, credits: 1, reason: "Cortesía de prueba" });
    assert.equal(adjusted.balance, 1);
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), 0);

    // At zero again, the next valuation is blocked; a re-conclusion of the paid one is not.
    const another = await createConcludableValuation(user);
    await assert.rejects(conclude(user, another.UIdentificadorPublico), ValuationWorkflowError);
    await reopen(user, valuation.UIdentificadorPublico);
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await getCreditBalance(user.organizationId), 0);
  });

  test("adjustments must be whole, non-zero and justified", async () => {
    const { user } = await createAdmin("ajustes");
    await assert.rejects(adjustCredits({ organizationId: user.organizationId, credits: 0, reason: "x" }));
    await assert.rejects(adjustCredits({ organizationId: user.organizationId, credits: 2, reason: "  " }));
    await adjustCredits({ organizationId: user.organizationId, credits: -2, reason: "Corrección" });
    assert.equal(await getCreditBalance(user.organizationId), -2);
    assert.equal((await listCreditMovements(user.organizationId))[0]?.typeLabel, "Ajuste manual");
  });
});

describe("tenant isolation", () => {
  test("A's purchase is A's: B cannot reconcile A's session, B's balance stays untouched and the webhook credits only A", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const a = await createAdmin("tenant-a");
    const b = await createAdmin("tenant-b");
    const sessionId = await buy(fake, a.user, pkg.UIdentificadorPublico);

    assert.deepEqual(await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: b.user.organizationId }), { applied: false, reason: "NOT_FOUND" });
    assert.equal(await getCreditBalance(b.user.organizationId), 0);
    assert.equal(await getCreditBalance(a.user.organizationId), 0, "a foreign attempt credits no one");

    const request = fake.purchaseWebhookRequest(sessionId, SECRET);
    await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, fake.gateway, SECRET);
    assert.equal(await getCreditBalance(a.user.organizationId), 10);
    assert.equal(await getCreditBalance(b.user.organizationId), 0);

    const overviewB = await getBillingOverview(b.user.organizationId, fake.gateway);
    assert.deepEqual([overviewB.credits.balance, overviewB.credits.movements.length], [0, 0]);
  });

  test("a session whose tags name another organization than its customer is refused, as is an untagged one", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createPackage();
    const a = await createAdmin("forged-a");
    const b = await createAdmin("forged-b");
    const sessionId = await buy(fake, a.user, pkg.UIdentificadorPublico);
    const session = (await fake.gateway.retrieveCheckoutSession(sessionId))!;
    session.metadata = { ...session.metadata, organizacion: b.organization.UIdentificadorPublico };
    session.clientReferenceId = b.organization.UIdentificadorPublico;
    assert.deepEqual(await reconcilePackageCheckout(fake.gateway, sessionId), { applied: false, reason: "CUSTOMER_MISMATCH" });

    session.metadata = {};
    assert.deepEqual(await reconcilePackageCheckout(fake.gateway, sessionId), { applied: false, reason: "NOT_VALUAXIS" });
    assert.equal(await getCreditBalance(a.user.organizationId), 0);
    assert.equal(await getCreditBalance(b.user.organizationId), 0);
  });
});

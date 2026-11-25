/**
 * The commercial policies (15 Nov 2026) against the local database: an
 * Avalúo Disponible is consumed when «Crear avalúo» (or «Duplicar») is
 * pressed, never again on concluding or reopening; the free trial of a new
 * account (three for a month, consumed first, expiring); the transition of
 * valuations created before the change (charged on conclusion, once); the
 * block with the charge on; the purchase by unit with its confirmation email
 * and its record; and the price change notice.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test, type TestContext } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { POST as postValuation } from "../../src/app/api/avaluos/route";
import { POST as postDuplicate } from "../../src/app/api/avaluos/[id]/duplicar/route";
import { overridePhoneVerificationRequired } from "../../src/features/account/phone/phone-verification-provider";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import type { AuthUser } from "../../src/features/auth/model";
import { registerLocalUser } from "../../src/features/auth/services/registration.service";
import { parseRegisterInput } from "../../src/features/auth/validations/register.schema";
import { getBillingOverview } from "../../src/features/billing/billing.service";
import { addOneMonth } from "../../src/features/billing/credit-rules";
import { reconcilePackageCheckout, recordOfflinePayment, startPackageCheckout } from "../../src/features/billing/credit-packages.service";
import {
  NoCreditsError,
  consumeCreditOnCreation,
  getCreditSummary,
  grantTrialCredits,
  listCreditMovements,
  setCreditEnforcement,
} from "../../src/features/billing/credits.service";
import {
  PriceNoticeError,
  announcePriceChange,
  applyDuePriceNotice,
  cancelPriceNotice,
  findUnitPackage,
  getActivePriceNotice,
  sendPriceNoticeEmails,
} from "../../src/features/billing/unit-price.service";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import {
  concludeValuation,
  reopenValuation,
  saveValuationSections,
  type SectionPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { getEmailService, type BillingNoticeInput } from "../../src/infrastructure/email/email.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createFakeBillingGateway } from "../support/fake-billing-gateway";
import { TestCookieJar, assertLocalDatabase, createAuthUserFixture, createValuationFixture, prisma, withCookies } from "./support";

const createdPackages: number[] = [];

before(async () => {
  assertLocalDatabase();
  overridePhoneVerificationRequired(false);
  // A unit price on sale, as production has AVALUO_1; an empty database gets one of these tests.
  if (!(await findUnitPackage())) {
    const pkg = await prisma.paqueteCreditos.create({ data: { SClave: `PRUEBA_UNIDAD_BASE_${randomUUID().slice(0, 8)}`, SNombre: "1 avalúo (prueba)", ICreditos: 1, NImporte: "146.55", IOrden: 999 } });
    createdPackages.push(pkg.IdPaqueteCreditos);
  }
});
after(async () => {
  overridePhoneVerificationRequired(undefined);
  // Nothing of these tests stays on sale or announced in the local database.
  await prisma.paqueteCreditos.updateMany({ where: { IdPaqueteCreditos: { in: createdPackages } }, data: { BActivo: false, BEsPublico: false } });
  await prisma.avisoPrecio.updateMany({ where: { DFechaCancelacion: null, DFechaAplicacion: null }, data: { DFechaCancelacion: new Date() } });
  await prisma.$disconnect();
});

const captureBillingEmails = (t: TestContext) => {
  const sent: BillingNoticeInput[] = [];
  t.mock.method(getEmailService(), "sendBillingNotice", async (input: BillingNoticeInput) => {
    sent.push(input);
  });
  return sent;
};

/** An organization with its administrator, as the route handlers see them. */
async function createAdmin(label: string) {
  const fixture = await createAuthUserFixture({ label });
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  const user: AuthUser = {
    id: fixture.userId,
    name: label,
    email: fixture.email,
    role: "ADMINISTRADOR",
    permissions: ["SUSCRIPCION_ADMINISTRAR", "FACTURACION_VER", "AVALUO_CONCLUIR", "AVALUO_REABRIR", "AVALUO_EDITAR"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };
  return { user, organization };
}

/** A valuation row as «Crear avalúo» leaves it, with content to conclude; `charged` runs the creation hook. */
async function createValuation(user: AuthUser, options: { charged: boolean; now?: Date }) {
  const [state, appraisalType, propertyType, operationType] = await Promise.all([
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
  ]);
  const folio = `POL-${randomUUID().slice(0, 8)}`;
  const valuation = await prisma.$transaction(async (tx) => {
    const created = await tx.avaluo.create({
      data: {
        IdOrganizacion: user.organizationId,
        IdUsuarioCreador: user.id,
        IdEstadoAvaluo: state.IdEstadoAvaluo,
        IdTipoAvaluo: appraisalType.IdTipoAvaluo,
        IdTipoInmueble: propertyType.IdTipoInmueble,
        IdTipoOperacion: operationType.IdTipoOperacion,
        SFolio: folio,
        STitulo: "Avalúo de prueba de políticas",
        DFechaModificacion: new Date(),
      },
    });
    if (options.charged) await consumeCreditOnCreation(tx, { organizationId: user.organizationId, valuationId: created.IdAvaluo, folio, userId: user.id, now: options.now });
    return created;
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
const consumptionsOf = (valuationId: number) => prisma.movimientoCreditos.count({ where: { IdAvaluo: valuationId, STipo: "CONSUMO" } });
const balanceOf = async (organizationId: number, now?: Date) => (await getCreditSummary(organizationId, prisma, now)).balance;
const give = (organizationId: number, credits: number) =>
  prisma.movimientoCreditos.create({ data: { IdOrganizacion: organizationId, STipo: "AJUSTE", ICreditos: credits, SDescripcion: "Saldo de prueba" } });

describe("consumption at creation", () => {
  test("creating consumes one; concluding, reopening and concluding again never consume another", async () => {
    const { user } = await createAdmin("crear-consume");
    await give(user.organizationId, 2);
    const valuation = await createValuation(user, { charged: true });
    assert.equal(await balanceOf(user.organizationId), 1);
    const [movement] = await listCreditMovements(user.organizationId, 1);
    assert.deepEqual([movement.type, movement.typeLabel, movement.valuation?.folio], ["CONSUMO", "Avalúo creado", valuation.SFolio]);

    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await balanceOf(user.organizationId), 1, "concluding does not consume");
    await reopen(user, valuation.UIdentificadorPublico);
    await conclude(user, valuation.UIdentificadorPublico);
    assert.equal(await balanceOf(user.organizationId), 1, "reopening and concluding again does not consume");
    assert.equal(await consumptionsOf(valuation.IdAvaluo), 1);
  });

  test("with the charge on and no balance, creating is blocked and nothing is written; off, nothing is blocked", async () => {
    const { user } = await createAdmin("crear-bloqueo");
    await setCreditEnforcement(user.organizationId, true);
    const before = await prisma.avaluo.count({ where: { IdOrganizacion: user.organizationId } });
    await assert.rejects(createValuation(user, { charged: true }), (error: unknown) => {
      assert.ok(error instanceof NoCreditsError);
      assert.match(error.message, /no tiene avalúos disponibles/);
      assert.equal(error.link, "/organizacion/facturacion");
      return true;
    });
    assert.equal(await prisma.avaluo.count({ where: { IdOrganizacion: user.organizationId } }), before, "the valuation rolled back with the refusal");
    assert.equal(await balanceOf(user.organizationId), 0);

    await setCreditEnforcement(user.organizationId, false);
    await createValuation(user, { charged: true });
    assert.equal(await balanceOf(user.organizationId), -1, "without the charge the consumption is recorded and the balance goes negative");
  });
});

describe("«Crear avalúo» and «Duplicar» through their routes", () => {
  type Body = { error?: string; code?: string; link?: string; data?: Record<string, unknown> };
  type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

  async function signIn(fixture: Awaited<ReturnType<typeof createValuationFixture>>) {
    const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } });
    await prisma.miembroOrganizacion.create({ data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() } });
    const token = createSecureToken();
    await prisma.sesion.create({
      data: { IdUsuario: fixture.user.id, IdOrganizacion: fixture.organizationId, STokenHash: hashToken(token), DFechaExpiracion: new Date(Date.now() + 3_600_000), DFechaUltimaActividad: new Date() },
    });
    const jar = new TestCookieJar();
    jar.set(AUTH_SESSION_COOKIE, token);
    return jar;
  }

  /** Both routes revalidate and schedule notices with after(): they run inside a request of an action. */
  async function call(jar: TestCookieJar, handler: Handler, path: string, body: unknown, id = "") {
    const request = new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.71", "user-agent": "Pruebas" },
      body: JSON.stringify(body),
    });
    const response = await withCookies(jar, () => {
      const workStore = { route: "/integration-test", incrementalCache: {}, afterContext: { after: () => undefined } } as unknown as WorkStore;
      const unitStore = { type: "request", phase: "action", cookies: jar, userspaceMutableCookies: jar } as unknown as WorkUnitStore;
      return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, () => handler(request, { params: Promise.resolve({ id }) })));
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
  }

  test("each consumes one at creation; with the charge on and no balance both answer the message and the link to buy", async () => {
    const fixture = await createValuationFixture();
    const jar = await signIn(fixture);
    const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
    const form = {
      title: "Casa de prueba",
      clientName: "Cliente inventado",
      appraisalTypeId: catalogs.appraisalTypes[0].id,
      propertyTypeId: catalogs.propertyTypes[0].id,
      operationTypeId: catalogs.operationTypes[0].id,
    };
    await give(fixture.organizationId, 2);
    await setCreditEnforcement(fixture.organizationId, true);

    const created = await call(jar, postValuation as Handler, "/api/avaluos", form);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(await balanceOf(fixture.organizationId), 1);
    const copy = await call(jar, postDuplicate as Handler, `/api/avaluos/${fixture.publicId}/duplicar`, {}, fixture.publicId);
    assert.equal(copy.status, 201, JSON.stringify(copy.body));
    assert.equal(await balanceOf(fixture.organizationId), 0);

    const refused = await call(jar, postValuation as Handler, "/api/avaluos", form);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "NO_CREDITS");
    assert.equal(refused.body.link, "/organizacion/facturacion");
    assert.match(refused.body.error!, /Compra avalúos en Plan y facturación/);
    const refusedCopy = await call(jar, postDuplicate as Handler, `/api/avaluos/${fixture.publicId}/duplicar`, {}, fixture.publicId);
    assert.equal(refusedCopy.status, 409);
    assert.equal(refusedCopy.body.link, "/organizacion/facturacion");
    assert.equal(await balanceOf(fixture.organizationId), 0, "a refused creation consumes nothing");
  });
});

describe("transition of valuations created before the change", () => {
  test("one created before and never charged is charged on its first conclusion, once; with the charge on and no balance it cannot conclude", async () => {
    const { user } = await createAdmin("transicion");
    const legacy = await createValuation(user, { charged: false });
    await give(user.organizationId, 1);
    await conclude(user, legacy.UIdentificadorPublico);
    assert.equal(await balanceOf(user.organizationId), 0, "no free pass");
    const [movement] = await listCreditMovements(user.organizationId, 1);
    assert.equal(movement.typeLabel, "Avalúo concluido");
    await reopen(user, legacy.UIdentificadorPublico);
    await conclude(user, legacy.UIdentificadorPublico);
    assert.equal(await consumptionsOf(legacy.IdAvaluo), 1, "no double charge");

    await setCreditEnforcement(user.organizationId, true);
    const another = await createValuation(user, { charged: false });
    await assert.rejects(conclude(user, another.UIdentificadorPublico), /se creó antes del cobro al crear/);
  });

  test("one concluded before the ledger existed is not charged when reopened and concluded again", async () => {
    const { user } = await createAdmin("transicion-antigua");
    const old = await createValuation(user, { charged: false });
    await conclude(user, old.UIdentificadorPublico);
    // As if it had been concluded before migration 040: no consumption row.
    await prisma.movimientoCreditos.deleteMany({ where: { IdAvaluo: old.IdAvaluo } });
    await setCreditEnforcement(user.organizationId, true);
    await reopen(user, old.UIdentificadorPublico);
    await conclude(user, old.UIdentificadorPublico);
    assert.equal(await consumptionsOf(old.IdAvaluo), 0);
    assert.equal(await balanceOf(user.organizationId), 0);
  });
});

describe("free trial", () => {
  test("a new registration gets three Avalúos Disponibles until the same day of the next month", async (t) => {
    t.mock.method(getEmailService(), "sendVerificationEmail", async () => undefined);
    const form = new FormData();
    const fields = { name: "Prueba", paternalLastName: "Gratuita", email: `prueba-${randomUUID().slice(0, 8)}@example.test`, password: "Clave-Segura-2026!", confirmPassword: "Clave-Segura-2026!", acceptedTerms: "on" };
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const parsed = parseRegisterInput(form);
    assert.ok(parsed.ok);
    const startedAt = new Date();
    const result = await registerLocalUser(parsed.data);
    assert.ok(result.ok);
    const membership = await prisma.miembroOrganizacion.findFirstOrThrow({ where: { IdUsuario: result.userId } });
    const summary = await getCreditSummary(membership.IdOrganizacion);
    assert.deepEqual([summary.balance, summary.paid, summary.trial?.granted, summary.trial?.available], [3, 0, 3, 3]);
    const expected = addOneMonth(startedAt).getTime();
    assert.ok(Math.abs(summary.trial!.expiresAt.getTime() - expected) < 60_000, "a month after registering");
    const [grant] = await listCreditMovements(membership.IdOrganizacion, 1);
    assert.equal(grant.typeLabel, "Prueba gratuita");
  });

  test("trial ones are consumed before paid ones; unused ones expire at the month, paid ones never", async () => {
    const { user } = await createAdmin("prueba-orden");
    const registeredAt = new Date("2026-11-01T18:00:00Z");
    const expiry = addOneMonth(registeredAt);
    const during = new Date(expiry.getTime() - 60_000);
    const later = new Date(expiry.getTime() + 24 * 3_600_000);
    await prisma.$transaction((tx) => grantTrialCredits(tx, user.organizationId, registeredAt));
    await prisma.$transaction((tx) => grantTrialCredits(tx, user.organizationId, registeredAt));
    await give(user.organizationId, 2);

    let summary = await getCreditSummary(user.organizationId, prisma, during);
    assert.deepEqual([summary.balance, summary.paid, summary.trial?.available], [5, 2, 3], "granted once, whoever calls twice");

    const first = await createValuation(user, { charged: true, now: during });
    const [movement] = await listCreditMovements(user.organizationId, 1);
    assert.equal(movement.typeLabel, "Avalúo creado (prueba)");
    summary = await getCreditSummary(user.organizationId, prisma, during);
    assert.deepEqual([summary.balance, summary.paid, summary.trial?.available], [4, 2, 2], "the trial went first; the paid ones are intact");
    assert.equal(await consumptionsOf(first.IdAvaluo), 1);

    // A month later: the two unused trial ones no longer count, the paid ones do.
    summary = await getCreditSummary(user.organizationId, prisma, later);
    assert.deepEqual([summary.balance, summary.paid, summary.trial?.available, summary.trial?.pendingExpiry], [2, 2, 0, 2]);

    // The next ledger write records the expiry and consumes a paid one.
    await createValuation(user, { charged: true, now: later });
    const [consumption, expiryRow] = await listCreditMovements(user.organizationId, 2);
    assert.deepEqual([consumption.typeLabel, expiryRow.typeLabel, expiryRow.credits], ["Avalúo creado", "Vencimiento de la prueba", -2]);
    summary = await getCreditSummary(user.organizationId, prisma, new Date(later.getTime() + 365 * 24 * 3_600_000));
    assert.deepEqual([summary.balance, summary.paid, summary.trial?.pendingExpiry], [1, 1, 0], "a year later the paid one is still there");
    const raw = await prisma.movimientoCreditos.aggregate({ where: { IdOrganizacion: user.organizationId }, _sum: { ICreditos: true } });
    assert.equal(raw._sum.ICreditos, 1, "the ledger's sum and the balance agree once the expiry is written");
  });
});

describe("purchase by unit", () => {
  async function createUnitPackage() {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const pkg = await prisma.paqueteCreditos.create({
      data: { SClave: `PRUEBA_UNIDAD_${suffix}`, SNombre: `1 avalúo de prueba ${suffix}`, ICreditos: 1, NImporte: "146.55", NImpuestoPorcentaje: "16", IOrden: 950 },
    });
    createdPackages.push(pkg.IdPaqueteCreditos);
    return pkg;
  }

  test("3 by card: Stripe charges 3 × $170.00, the ledger keeps price, amount, method and reference, and the email says the balance", async (t) => {
    const sent = captureBillingEmails(t);
    const fake = createFakeBillingGateway();
    const pkg = await createUnitPackage();
    const { user, organization } = await createAdmin("compra-unidad");
    await prisma.organizacion.update({ where: { IdOrganizacion: organization.IdOrganizacion }, data: { SCorreo: "despacho-compra@example.test" } });

    const started = await startPackageCheckout(user, pkg.UIdentificadorPublico, fake.gateway, 3);
    const sessionId = started.url.split("/").pop()!;
    const session = (await fake.gateway.retrieveCheckoutSession(sessionId))!;
    assert.deepEqual([session.amountTotal, session.metadata.creditos, session.metadata.cantidad, session.metadata.precio_unitario], [51000, "3", "3", "170.00"]);
    fake.payPurchase(sessionId);

    const first = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(first.applied && first.credited);
    assert.equal(first.balance, 3);
    const again = await reconcilePackageCheckout(fake.gateway, sessionId, { organizationId: user.organizationId });
    assert.ok(again.applied && !again.credited);

    assert.equal(sent.length, 1, "one confirmation per payment, however many times it is reconciled");
    assert.equal(sent[0].to, "despacho-compra@example.test");
    assert.match(sent[0].lines.join(" "), /abonamos 3 avalúos disponibles/);
    assert.match(sent[0].lines.join(" "), /Tu saldo es de 3 avalúos disponibles/);
    assert.deepEqual(
      sent[0].details.filter((detail) => ["Total pagado", "Forma de pago", "Referencia"].includes(detail.label)).map((detail) => detail.value),
      ["$510.00 MXN (IVA incluido, sin comisiones)", "Tarjeta (Stripe)", sessionId],
    );

    const [purchase] = await listCreditMovements(user.organizationId, 1);
    assert.deepEqual(purchase.purchase, { quantity: 3, unitPrice: 170, amount: 510, method: "TARJETA", methodLabel: "Tarjeta (Stripe)", reference: sessionId });
    const audit = await prisma.auditoria.findFirst({ where: { IdOrganizacion: user.organizationId, SAccion: "BILLING_PURCHASE_CONFIRMATION_SENT" } });
    assert.ok(audit, "the email sent is recorded");
  });

  test("a quantity outside 1 to 100 is refused before anything reaches Stripe", async () => {
    const fake = createFakeBillingGateway();
    const pkg = await createUnitPackage();
    const { user } = await createAdmin("compra-cantidad");
    for (const quantity of [0, 101, 1.5]) {
      await assert.rejects(startPackageCheckout(user, pkg.UIdentificadorPublico, fake.gateway, quantity), /de 1 a 100/);
    }
    assert.equal(fake.writes.filter((write) => write.startsWith("checkout")).length, 0);
  });

  test("a transfer confirmed by the operator is credited once at the unit price, with its reference, and confirmed by email", async (t) => {
    const sent = captureBillingEmails(t);
    const { user } = await createAdmin("transferencia");
    const reference = `SPEI-${randomUUID().slice(0, 8)}`;
    const first = await recordOfflinePayment({ organizationId: user.organizationId, credits: 2, method: "TRANSFERENCIA", reference });
    assert.ok(first.credited);
    assert.equal(first.balance, 2);
    assert.equal(first.purchase.amount, first.purchase.unitPrice * 2);
    const again = await recordOfflinePayment({ organizationId: user.organizationId, credits: 2, method: "TRANSFERENCIA", reference });
    assert.equal(again.credited, false);
    assert.equal((await getCreditSummary(user.organizationId)).balance, 2);
    assert.equal(sent.length, 1);
    const [movement] = await listCreditMovements(user.organizationId, 1);
    assert.deepEqual([movement.purchase?.methodLabel, movement.purchase?.reference], ["Transferencia", reference]);
  });

  test("the overview shows the unit price, the balance split, the transfer data placeholders and no plans on offer", async () => {
    const { user } = await createAdmin("resumen-politicas");
    await prisma.$transaction((tx) => grantTrialCredits(tx, user.organizationId));
    const overview = await getBillingOverview(user.organizationId, null);
    assert.ok(overview.credits.unitPrice, "a unit price is on sale in the local catalog");
    assert.equal(overview.credits.maxQuantity, 100);
    assert.deepEqual([overview.credits.balance, overview.credits.paid, overview.credits.trial?.available], [3, 0, 3]);
    assert.equal(overview.subscriptionsOffered, false);
    assert.equal(overview.bankTransfer.ready, false);
    assert.ok(overview.bankTransfer.rows.some((row) => row.value === "Por definir"));
  });
});

describe("price change notice", () => {
  test("announced at least a month ahead, shown and emailed once; applied on its date without touching what was paid", async (t) => {
    const sent = captureBillingEmails(t);
    // Notices left by an earlier interrupted run would block a new one.
    await prisma.avisoPrecio.updateMany({ where: { DFechaCancelacion: null, DFechaAplicacion: null }, data: { DFechaCancelacion: new Date() } });
    const now = new Date();
    const tooSoon = new Date(now.getTime() + 20 * 24 * 3_600_000);
    await assert.rejects(announcePriceChange({ newPrice: "190", effectiveAt: tooSoon, now, apply: true }), PriceNoticeError);

    const effectiveAt = new Date(addOneMonth(now).getTime() + 24 * 3_600_000);
    const dryRun = await announcePriceChange({ newPrice: "190", effectiveAt, now, apply: false });
    assert.equal(dryRun.recorded, false);
    assert.equal(await getActivePriceNotice(now), null, "a simulation records nothing");

    const announced = await announcePriceChange({ newPrice: "190", effectiveAt, now, apply: true });
    assert.ok(announced.recorded);
    await assert.rejects(announcePriceChange({ newPrice: "200", effectiveAt, now, apply: true }), /Ya hay un cambio pendiente/);
    const shown = await getActivePriceNotice(now);
    assert.deepEqual([shown?.id, shown?.newPrice, shown?.effectiveAt], [announced.notice.UIdentificadorPublico, 190, effectiveAt.toISOString()]);
    const overview = await getBillingOverview((await createAdmin("aviso-banner")).user.organizationId, null, now);
    assert.equal(overview.priceNotice?.newPrice, 190, "Plan y facturación shows the banner");

    // Everyone active gets it; here, two users of this test (the local database has thousands).
    const recipients = await Promise.all(["aviso-a", "aviso-b"].map(async (label) => {
      const fixture = await createAuthUserFixture({ label });
      return { IdUsuario: fixture.userId, SCorreo: fixture.email, SNombre: label };
    }));
    const emails = await sendPriceNoticeEmails(announced.notice.UIdentificadorPublico, { recipients });
    assert.deepEqual(emails, { sent: 2, failed: 0, alreadySent: false });
    assert.deepEqual(sent.map((email) => email.to), recipients.map((user) => user.SCorreo));
    const audits = await prisma.auditoria.count({ where: { SAccion: "BILLING_PRICE_NOTICE_EMAILED", SIdentificadorEntidad: announced.notice.UIdentificadorPublico } });
    assert.equal(audits, 2, "each email is recorded with its recipient");
    assert.match(sent[0].lines[0], /\$190\.00 MXN con IVA incluido/);
    assert.match(sent[0].lines[1], /ya pagaste no cambian/);
    assert.deepEqual(await sendPriceNoticeEmails(announced.notice.UIdentificadorPublico, { recipients }), { sent: 0, failed: 0, alreadySent: true }, "never twice");

    // Applied on its date, to a package of this test (the local catalog's price stays as it is).
    const { user } = await createAdmin("aviso-pagado");
    await give(user.organizationId, 4);
    const pkg = await prisma.paqueteCreditos.create({
      data: { SClave: `PRUEBA_AVISO_${randomUUID().slice(0, 8)}`, SNombre: "Unidad del aviso", ICreditos: 1, NImporte: "146.55", BActivo: false, BEsPublico: false },
    });
    createdPackages.push(pkg.IdPaqueteCreditos);
    await prisma.avisoPrecio.update({ where: { IdAvisoPrecio: announced.notice.IdAvisoPrecio }, data: { SClavePaquete: pkg.SClave } });
    assert.equal(await applyDuePriceNotice(new Date(effectiveAt.getTime() - 1)), null, "not before its date");
    const applied = await applyDuePriceNotice(new Date(effectiveAt.getTime() + 1));
    assert.equal(applied?.UIdentificadorPublico, announced.notice.UIdentificadorPublico);
    assert.equal(await applyDuePriceNotice(new Date(effectiveAt.getTime() + 2)), null, "applied once");
    const repriced = await prisma.paqueteCreditos.findUniqueOrThrow({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos } });
    assert.equal(repriced.NImporte.toFixed(2), "163.79", "$190.00 with IVA");
    assert.equal(await getActivePriceNotice(new Date(effectiveAt.getTime() + 1)), null, "the banner goes once it applies");
    assert.equal(await balanceOf(user.organizationId), 4, "what was paid is untouched");
  });

  test("a cancelled notice is not shown", async () => {
    await prisma.avisoPrecio.updateMany({ where: { DFechaCancelacion: null, DFechaAplicacion: null }, data: { DFechaCancelacion: new Date() } });
    const now = new Date();
    const announced = await announcePriceChange({ newPrice: "185", effectiveAt: new Date(addOneMonth(now).getTime() + 3_600_000), now, apply: true });
    assert.ok(announced.recorded);
    await cancelPriceNotice(announced.notice.UIdentificadorPublico);
    assert.equal(await getActivePriceNotice(now), null);
  });
});

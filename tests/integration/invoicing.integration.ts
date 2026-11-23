/**
 * CFDI invoicing of package purchases against the local database, with an
 * in-memory Stripe and a local fake of Facturapi spoken to over HTTP by the
 * real gateway: the webhook's purchase is invoiced once and emailed, retries
 * never invoice twice, an organization without fiscal data is left for the
 * global invoice, and the monthly global invoice in dry run and applied.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test, type TestContext } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { BillingError } from "../../src/features/billing/billing-errors";
import { getBillingOverview } from "../../src/features/billing/billing.service";
import { handleStripeWebhook } from "../../src/features/billing/billing-webhook.service";
import { startPackageCheckout } from "../../src/features/billing/credit-packages.service";
import { buildIndividualInvoice, fiscalDataSchema } from "../../src/features/billing/invoice-rules";
import {
  downloadInvoiceFile,
  getFiscalData,
  invoicePurchase,
  issueGlobalInvoice,
  retryInvoice,
  saveFiscalData,
} from "../../src/features/billing/invoicing.service";
import { getEmailService, type InvoiceEmailInput } from "../../src/infrastructure/email/email.service";
import { createFacturapiGateway } from "../../src/infrastructure/invoicing/facturapi-gateway";
import { createFakeBillingGateway } from "../support/fake-billing-gateway";
import { FAKE_FACTURAPI_KEY, startFakeFacturapiServer } from "../support/fake-facturapi-server";
import { assertLocalDatabase, createAuthUserFixture, prisma } from "./support";

const SECRET = "whsec_invoicing_integration_only";
const createdPackages: number[] = [];
let facturapi: Awaited<ReturnType<typeof startFakeFacturapiServer>>;
let gateway: ReturnType<typeof createFacturapiGateway>;

before(async () => {
  facturapi = await startFakeFacturapiServer();
  gateway = createFacturapiGateway(FAKE_FACTURAPI_KEY, facturapi.baseUrl);
});

after(async () => {
  await facturapi.close();
  await prisma.paqueteCreditos.updateMany({ where: { IdPaqueteCreditos: { in: createdPackages } }, data: { BActivo: false, BEsPublico: false } });
  await prisma.$disconnect();
});

/** "1 avalúo" at the agreed price: $146.55 + 16 % = $170.00. */
async function createPackage() {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const pkg = await prisma.paqueteCreditos.create({
    data: { SClave: `PRUEBA_CFDI_${suffix}`, SNombre: `1 avalúo de prueba ${suffix}`, ICreditos: 1, NImporte: "146.55", NImpuestoPorcentaje: "16", IOrden: 900 },
  });
  createdPackages.push(pkg.IdPaqueteCreditos);
  return pkg;
}

async function createAdmin(label: string) {
  const fixture = await createAuthUserFixture({ label });
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  const user: AuthUser = {
    id: fixture.userId,
    name: label,
    email: fixture.email,
    role: "ADMINISTRADOR",
    permissions: ["SUSCRIPCION_ADMINISTRAR", "FACTURACION_VER", "FACTURACION_ADMINISTRAR"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };
  return { user, organization };
}

// The SAT's test RFC and a made-up name.
const FISCAL = fiscalDataSchema.parse({
  rfc: "EKU9003173C9",
  legalName: "Escuela Kemper Urgate S.A. de C.V.",
  taxSystem: "601",
  zip: "42501",
  cfdiUse: "G03",
  email: "facturas-cfdi@example.test",
});

/** Pays a package in the fake Stripe and delivers the webhook, as Stripe would. */
async function buyThroughWebhook(stripe: ReturnType<typeof createFakeBillingGateway>, user: AuthUser) {
  const pkg = await createPackage();
  const started = await startPackageCheckout(user, pkg.UIdentificadorPublico, stripe.gateway);
  const sessionId = started.url.split("/").pop()!;
  stripe.payPurchase(sessionId);
  const request = stripe.purchaseWebhookRequest(sessionId, SECRET);
  const response = await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, stripe.gateway, SECRET);
  return { sessionId, request, response };
}

function captureInvoiceEmails(t: TestContext) {
  const sent: InvoiceEmailInput[] = [];
  t.mock.method(getEmailService(), "sendInvoiceEmail", async (input: InvoiceEmailInput) => {
    sent.push(input);
  });
  return sent;
}

const rowsOf = (organizationId: number) => prisma.cfdiPago.findMany({ where: { IdOrganizacion: organizationId } });
const creationsFor = (reference: string) => facturapi.invoices.filter((invoice) => invoice.external_id === reference).length;

describe("fiscal data", () => {
  test("saves the fiscal data on the organization (the legal name and RFC are the letterhead's) and reports them complete", async () => {
    const { user, organization } = await createAdmin("cfdi-datos");
    assert.equal((await getFiscalData(user.organizationId)).complete, false);
    const saved = await saveFiscalData(user, FISCAL);
    assert.deepEqual(saved, { ...FISCAL, complete: true });
    const row = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: organization.IdOrganizacion } });
    assert.deepEqual([row.SRFC, row.SRazonSocial, row.SRegimenFiscal, row.SCodigoPostalFiscal, row.SUsoCfdi], ["EKU9003173C9", FISCAL.legalName, "601", "42501", "G03"]);
    const audit = await prisma.auditoria.findFirstOrThrow({ where: { IdOrganizacion: organization.IdOrganizacion, SAccion: "BILLING_FISCAL_DATA_UPDATED" } });
    assert.equal((audit.JMetadatos as { rfc: string }).rfc, "EKU…C9", "the audit never keeps the RFC in full");
  });
});

describe("invoice of a purchase", () => {
  test("the webhook's purchase is invoiced once, emailed with PDF and XML, and shown in Movimientos with its files", async (t) => {
    const sent = captureInvoiceEmails(t);
    const stripe = createFakeBillingGateway();
    const { user } = await createAdmin("cfdi-webhook");
    await saveFiscalData(user, FISCAL);

    const { sessionId, request, response } = await buyThroughWebhook(stripe, user);
    assert.equal(response.status, 200);
    assert.equal(response.invoicePayment, sessionId, "the route invoices this payment after answering");

    const first = await invoicePurchase(gateway, response.invoicePayment!);
    assert.equal(first.action, "issued");
    // The success page, a second delivery and the replay of the event change nothing.
    assert.equal((await invoicePurchase(gateway, sessionId)).action, "already-invoiced");
    const replay = await handleStripeWebhook({ rawBody: request.rawBody, signature: request.signature }, stripe.gateway, SECRET);
    assert.equal(replay.invoicePayment, undefined);
    assert.equal(creationsFor(sessionId), 1);

    const [row] = await rowsOf(user.organizationId);
    assert.deepEqual([row.SEstado, row.STipo, row.NSubtotal.toFixed(2), row.NImpuestos.toFixed(2), row.NTotal.toFixed(2)], ["EMITIDA", "INDIVIDUAL", "146.55", "23.45", "170.00"]);
    assert.ok(row.SUuid && row.DFechaCorreo);
    const stamped = facturapi.invoices.find((invoice) => invoice.external_id === sessionId)!;
    assert.equal(stamped.total, 170, "Facturapi's total is exactly what Stripe charged");
    assert.deepEqual(stamped.body.customer, { legal_name: "ESCUELA KEMPER URGATE", tax_id: "EKU9003173C9", tax_system: "601", email: FISCAL.email, address: { zip: "42501" } });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, FISCAL.email);
    assert.deepEqual([sent[0].pdf.filename.endsWith(".pdf"), sent[0].xml.filename.endsWith(".xml")], [true, true]);
    assert.match(sent[0].xml.content.toString(), new RegExp(row.SUuid!));

    const overview = await getBillingOverview(user.organizationId, stripe.gateway);
    const invoice = overview.credits.movements[0].invoice!;
    assert.deepEqual([invoice.state, invoice.downloadable, invoice.retryable, invoice.emailed], ["EMITIDA", true, false, true]);
    const pdf = await downloadInvoiceFile(user.organizationId, invoice.id, "pdf", gateway);
    assert.match(pdf.content.toString(), /%PDF/);

    const issuedAudit = await prisma.auditoria.count({ where: { IdOrganizacion: user.organizationId, SAccion: "BILLING_INVOICE_ISSUED" } });
    assert.equal(issuedAudit, 1);
  });

  test("a refusal is kept with Facturapi's message; «Reintentar factura» with corrected data issues it once, and no second time", async (t) => {
    captureInvoiceEmails(t);
    const stripe = createFakeBillingGateway();
    const { user } = await createAdmin("cfdi-reintento");
    await saveFiscalData(user, { ...FISCAL, zip: "99999" });
    const { sessionId } = await buyThroughWebhook(stripe, user);

    facturapi.refuseNext("El código postal del receptor no coincide con el registrado en el SAT.");
    const failed = await invoicePurchase(gateway, sessionId);
    assert.equal(failed.action, "failed");
    const overview = await getBillingOverview(user.organizationId, stripe.gateway);
    const shown = overview.credits.movements[0].invoice!;
    assert.deepEqual([shown.state, shown.retryable, shown.error], ["FALLIDA", true, "El código postal del receptor no coincide con el registrado en el SAT."]);
    // The webhook again: the failed payment is not retried on its own.
    assert.equal((await invoicePurchase(gateway, sessionId)).action, "skipped");
    assert.equal(creationsFor(sessionId), 0);

    await saveFiscalData(user, FISCAL);
    const retried = await retryInvoice(user, shown.id, gateway);
    assert.deepEqual([retried.state, retried.emailed, retried.error], ["EMITIDA", true, null]);
    assert.equal(creationsFor(sessionId), 1);
    assert.equal((await rowsOf(user.organizationId)).length, 1);
    await assert.rejects(retryInvoice(user, shown.id, gateway), (error: unknown) => error instanceof BillingError && error.status === 409);
    assert.equal(await prisma.auditoria.count({ where: { IdOrganizacion: user.organizationId, SAccion: { in: ["BILLING_INVOICE_FAILED", "BILLING_INVOICE_RETRIED", "BILLING_INVOICE_ISSUED"] } } }), 3);

    // Another organization cannot retry or download it.
    const other = await createAdmin("cfdi-ajena");
    await assert.rejects(retryInvoice(other.user, shown.id, gateway), (error: unknown) => error instanceof BillingError && error.status === 404);
    await assert.rejects(downloadInvoiceFile(other.user.organizationId, shown.id, "xml", gateway), (error: unknown) => error instanceof BillingError && error.status === 404);
  });

  test("an invoice Facturapi created whose answer was lost is adopted, not created again", async (t) => {
    captureInvoiceEmails(t);
    const stripe = createFakeBillingGateway();
    const { user } = await createAdmin("cfdi-perdida");
    await saveFiscalData(user, FISCAL);
    const { sessionId } = await buyThroughWebhook(stripe, user);
    // The same request already reached Facturapi (a timeout on our side): its key is taken.
    const lost = buildIndividualInvoice({ fiscal: FISCAL, paymentReference: sessionId, description: "Paquete", totalCents: 17000, taxPercent: 16, productKey: "81112106", unitKey: "E48" });
    await gateway.createInvoice(lost.payload);
    assert.equal(creationsFor(sessionId), 1);

    const result = await invoicePurchase(gateway, sessionId);
    assert.equal(result.action, "issued");
    assert.equal(creationsFor(sessionId), 1);
    const [row] = await rowsOf(user.organizationId);
    assert.equal(row.SIdentificadorExterno, facturapi.invoices.find((invoice) => invoice.external_id === sessionId)!.id);
  });

  test("an organization without fiscal data is not invoiced individually, and nothing is issued without Facturapi", async () => {
    const stripe = createFakeBillingGateway();
    const { user } = await createAdmin("cfdi-sin-datos");
    const { sessionId } = await buyThroughWebhook(stripe, user);
    assert.deepEqual(await invoicePurchase(gateway, sessionId), { action: "skipped", reason: "NO_FISCAL_DATA" });
    assert.deepEqual(await invoicePurchase(null, sessionId), { action: "skipped", reason: "NOT_CONFIGURED" });
    assert.equal((await rowsOf(user.organizationId)).length, 0);
    assert.equal(creationsFor(sessionId), 0);
    const overview = await getBillingOverview(user.organizationId, stripe.gateway);
    assert.equal(overview.credits.movements[0].invoice, null);
  });
});

describe("global invoice", () => {
  test("a dry run lists the month's uninvoiced payments and writes nothing; --apply issues one CFDI for all of them, once", async (t) => {
    captureInvoiceEmails(t);
    const stripe = createFakeBillingGateway();
    // A month no other test uses, so the local database's other purchases stay out.
    const month = `${2200 + Math.floor(Math.random() * 700)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
    const inMonth = new Date(`${month}-15T18:00:00Z`);

    const a = await createAdmin("cfdi-global-a");
    const b = await createAdmin("cfdi-global-b");
    const withData = await createAdmin("cfdi-global-con-datos");
    await saveFiscalData(withData.user, FISCAL);
    const payments = [await buyThroughWebhook(stripe, a.user), await buyThroughWebhook(stripe, b.user), await buyThroughWebhook(stripe, withData.user)];
    await invoicePurchase(gateway, payments[2].sessionId);
    await prisma.movimientoCreditos.updateMany({ where: { SReferenciaExterna: { in: payments.map((payment) => payment.sessionId) } }, data: { DFechaCreacion: inMonth } });
    await prisma.cfdiPago.updateMany({ where: { SReferenciaPago: payments[2].sessionId }, data: { DFechaPago: inMonth } });

    const before = facturapi.creations();
    const dry = await issueGlobalInvoice(gateway, month, { apply: false });
    assert.deepEqual(dry.payments.map((payment) => payment.reference).sort(), [payments[0].sessionId, payments[1].sessionId].sort());
    assert.deepEqual([dry.subtotal, dry.tax, dry.total, dry.issued], [293.1, 46.9, 340, null]);
    assert.equal(facturapi.creations(), before);
    assert.equal(await prisma.cfdiPago.count({ where: { SPeriodoGlobal: month } }), 0);

    facturapi.refuseNext("Servicio del SAT no disponible.");
    const refused = await issueGlobalInvoice(gateway, month, { apply: true });
    assert.equal(refused.error, "Servicio del SAT no disponible.");
    assert.equal(await prisma.cfdiPago.count({ where: { SPeriodoGlobal: month, SEstado: "FALLIDA" } }), 2);

    const applied = await issueGlobalInvoice(gateway, month, { apply: true });
    assert.equal(applied.error, null);
    assert.ok(applied.issued?.uuid);
    const rows = await prisma.cfdiPago.findMany({ where: { SPeriodoGlobal: month } });
    assert.deepEqual(rows.map((row) => [row.STipo, row.SEstado, row.SUuid]), [["GLOBAL", "EMITIDA", applied.issued!.uuid], ["GLOBAL", "EMITIDA", applied.issued!.uuid]]);
    const stamped = facturapi.invoices.at(-1)!;
    assert.equal(stamped.total, 340);
    assert.deepEqual((stamped.body as { global: unknown }).global, { periodicity: "month", months: month.slice(5), year: Number(month.slice(0, 4)) });
    assert.equal((stamped.body as { items: unknown[] }).items.length, 2);

    const again = await issueGlobalInvoice(gateway, month, { apply: true });
    assert.deepEqual([again.payments.length, again.issued], [0, null]);
    assert.equal(facturapi.creations(), before + 2, "the refused attempt and the issued one; nothing more");

    const overview = await getBillingOverview(a.user.organizationId, stripe.gateway);
    const shown = overview.credits.movements[0].invoice!;
    assert.deepEqual([shown.kind, shown.state, shown.globalPeriod, shown.downloadable, shown.retryable], ["GLOBAL", "EMITIDA", month, false, false]);
  });
});

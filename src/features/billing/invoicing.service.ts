/**
 * CFDI invoicing of the package purchases (docs/COBRO.md, "Facturación CFDI").
 *
 * A paid purchase of an organization with complete fiscal data gets its CFDI
 * from Facturapi right after Stripe confirms it (after the webhook or the
 * success page answered), emailed with its PDF and XML to the invoice email.
 * One CfdiPago row per payment, claimed before calling the provider, so the
 * webhook, its retries and the success page never invoice twice; a failure
 * keeps the provider's message and an admin retries it from «Movimientos».
 * Payments of organizations without fiscal data go, at month's end, in the
 * global invoice to the general public (`pnpm invoices:global`).
 *
 * Without FACTURAPI_KEY nothing here runs: the gateway is null.
 */
import { Prisma, type CfdiPago } from "@prisma/client";
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { env } from "@/lib/env";
import { buildPublicAppUrl } from "@/lib/public-url";
import { BillingError } from "./billing-errors";
import { BILLING_PAGE_PATH, BILLING_PROVIDER } from "./billing-rules";
import { CREDIT_MOVEMENT_TYPES, packagePricing } from "./credit-rules";
import {
  CFDI_DEFAULTS,
  CFDI_STATES,
  buildGlobalInvoice,
  buildIndividualInvoice,
  completeFiscalData,
  globalPeriod,
  maskRfc,
  type CfdiInvoicePayload,
  type CfdiState,
  type FiscalData,
} from "./invoice-rules";
import { InvoicingProviderError, type InvoicingGateway, type IssuedCfdi } from "./invoicing-gateway";

const CFDI_TYPES = { individual: "INDIVIDUAL", global: "GLOBAL" } as const;
/** A claim older than this with no answer is considered lost: an admin may retry it. */
const STALE_PENDING_MS = 2 * 60 * 1000;
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const productKey = () => env.INVOICE_PRODUCT_KEY?.trim() || CFDI_DEFAULTS.productKey;
const unitKey = () => env.INVOICE_UNIT_KEY?.trim() || CFDI_DEFAULTS.unitKey;

// ---------------------------------------------------------------------------
// Fiscal data

export type FiscalDataDto = {
  rfc: string;
  legalName: string;
  taxSystem: string;
  zip: string;
  cfdiUse: string;
  email: string;
  /** Every field is there and valid: its purchases are invoiced to its RFC. */
  complete: boolean;
};

export type InvoicingOverviewDto = {
  /** False without FACTURAPI_KEY: nothing is issued and the page says so. */
  enabled: boolean;
  fiscalData: FiscalDataDto;
};

const fiscalColumns = {
  SRFC: true,
  SRazonSocial: true,
  SRegimenFiscal: true,
  SCodigoPostalFiscal: true,
  SUsoCfdi: true,
  SCorreoFacturacion: true,
} as const;

export async function getFiscalData(organizationId: number): Promise<FiscalDataDto> {
  const row = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: organizationId }, select: fiscalColumns });
  return {
    rfc: row.SRFC ?? "",
    legalName: row.SRazonSocial ?? "",
    taxSystem: row.SRegimenFiscal ?? "",
    zip: row.SCodigoPostalFiscal ?? "",
    cfdiUse: row.SUsoCfdi ?? "",
    email: row.SCorreoFacturacion ?? "",
    complete: completeFiscalData(row) !== null,
  };
}

/**
 * Saves the fiscal data, validated by fiscalDataSchema. The legal name and the
 * RFC are the same columns «Datos del despacho» edits.
 */
export async function saveFiscalData(user: AuthUser, input: FiscalData): Promise<FiscalDataDto> {
  await prisma.organizacion.update({
    where: { IdOrganizacion: user.organizationId },
    data: {
      SRFC: input.rfc,
      SRazonSocial: input.legalName,
      SRegimenFiscal: input.taxSystem,
      SCodigoPostalFiscal: input.zip,
      SUsoCfdi: input.cfdiUse,
      SCorreoFacturacion: input.email,
    },
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(user.organizationId),
    action: "BILLING_FISCAL_DATA_UPDATED",
    // Never the RFC in full.
    metadata: { rfc: maskRfc(input.rfc), taxSystem: input.taxSystem, cfdiUse: input.cfdiUse },
  });
  return getFiscalData(user.organizationId);
}

// ---------------------------------------------------------------------------
// What «Movimientos» shows of a purchase's invoice

export type MovementInvoiceDto = {
  id: string;
  kind: "INDIVIDUAL" | "GLOBAL";
  state: CfdiState;
  uuid: string | null;
  /** "A-12", or null before it is stamped. */
  label: string | null;
  /** The month of the global invoice it went into ("2026-11"). */
  globalPeriod: string | null;
  error: string | null;
  emailed: boolean;
  /** PDF and XML can be downloaded: an individual invoice already stamped. */
  downloadable: boolean;
  /** «Reintentar factura» applies: it failed, its claim was lost, or it was issued but not emailed. */
  retryable: boolean;
};

const invoiceLabel = (row: Pick<CfdiPago, "SSerie" | "IFolio">) => (row.IFolio !== null ? [row.SSerie, row.IFolio].filter((part) => part !== null && part !== "").join("-") : null);

function isRetryable(row: CfdiPago, now = Date.now()) {
  if (row.STipo !== CFDI_TYPES.individual) return false;
  if (row.SEstado === CFDI_STATES.failed) return true;
  if (row.SEstado === CFDI_STATES.pending) return now - row.DFechaModificacion.getTime() > STALE_PENDING_MS;
  return row.DFechaCorreo === null;
}

export function movementInvoiceDto(row: CfdiPago): MovementInvoiceDto {
  const issued = row.SEstado === CFDI_STATES.issued;
  return {
    id: row.UIdentificadorPublico,
    kind: row.STipo as MovementInvoiceDto["kind"],
    state: row.SEstado as CfdiState,
    uuid: row.SUuid,
    label: invoiceLabel(row),
    globalPeriod: row.SPeriodoGlobal,
    error: row.SMensajeError,
    emailed: row.DFechaCorreo !== null,
    downloadable: issued && row.STipo === CFDI_TYPES.individual && row.SIdentificadorExterno !== null,
    retryable: isRetryable(row),
  };
}

// ---------------------------------------------------------------------------
// Issuing

export type InvoicePurchaseResult =
  | { action: "issued" | "already-invoiced" | "pending"; invoiceId: string }
  | { action: "failed"; invoiceId: string; error: string }
  | { action: "skipped"; reason: "NOT_FOUND" | "NO_FISCAL_DATA" | "IN_PROGRESS" | "NOT_CONFIGURED" };

type Purchase = Prisma.MovimientoCreditosGetPayload<{ include: { paquete: true; organizacion: true; cfdi: true } }>;

async function findPurchase(reference: string): Promise<Purchase | null> {
  return prisma.movimientoCreditos.findFirst({
    where: { SProveedorPago: BILLING_PROVIDER, SReferenciaExterna: reference, STipo: CREDIT_MOVEMENT_TYPES.purchase },
    include: { paquete: true, organizacion: true, cfdi: true },
  });
}

/** What Stripe charged (centavos, IVA included) and the IVA rate of the package. */
function chargeOf(purchase: Purchase) {
  const stored = (purchase.JMetadatos as { stripe?: { amountTotal?: unknown } } | null)?.stripe?.amountTotal;
  const taxPercent = purchase.paquete ? purchase.paquete.NImpuestoPorcentaje.toNumber() : 16;
  const totalCents =
    typeof stored === "number" && Number.isInteger(stored) && stored >= 0 ? stored : purchase.paquete ? packagePricing(purchase.paquete).unitAmount : 0;
  return { totalCents, taxPercent };
}

function purchaseDescription(purchase: Purchase) {
  const credits = purchase.ICreditos;
  const name = purchase.paquete?.SNombre ?? "Paquete de avalúos";
  return `Valuaxis Soft: ${name} (${credits} ${credits === 1 ? "avalúo" : "avalúos"})`;
}

const receiverSnapshot = (fiscal: FiscalData) => ({
  rfc: fiscal.rfc,
  legalName: fiscal.legalName,
  taxSystem: fiscal.taxSystem,
  zip: fiscal.zip,
  cfdiUse: fiscal.cfdiUse,
  email: fiscal.email,
});

const providerMessage = (error: unknown) =>
  (error instanceof InvoicingProviderError ? error.message : "No se pudo comunicar con el servicio de facturación. Intenta de nuevo en unos minutos.").slice(0, 2000);

/**
 * Asks the provider for the CFDI of `payload`, without ever creating two: a
 * retry first looks for what an earlier attempt may have left (by id, then by
 * external_id), and a 409 of the idempotency key is answered the same way.
 */
async function obtainInvoice(gateway: InvoicingGateway, payload: CfdiInvoicePayload, previous: { externalId: string | null; lookFirst: boolean }) {
  let found: IssuedCfdi | null = null;
  if (previous.externalId) {
    found = await gateway.retrieveInvoice(previous.externalId);
    if (found?.status === "canceled") found = null;
  }
  if (!found && previous.lookFirst) found = await gateway.findInvoiceByExternalId(payload.external_id);
  if (found) return found;
  try {
    return await gateway.createInvoice(payload);
  } catch (error) {
    if (error instanceof InvoicingProviderError && error.status === 409) {
      const existing = await gateway.findInvoiceByExternalId(payload.external_id);
      if (existing) return existing;
    }
    throw error;
  }
}

const issuedFields = (invoice: IssuedCfdi) => ({
  SIdentificadorExterno: invoice.id,
  SUuid: invoice.uuid,
  SSerie: invoice.series,
  IFolio: invoice.folioNumber,
});

/** Emails the stamped CFDI (PDF and XML) to the invoice email; the failure is kept, the invoice stays issued. */
async function emailInvoice(gateway: InvoicingGateway, row: CfdiPago, organizationName: string, to: string) {
  try {
    const [pdf, xml] = await Promise.all([gateway.downloadInvoice(row.SIdentificadorExterno!, "pdf"), gateway.downloadInvoice(row.SIdentificadorExterno!, "xml")]);
    const name = `factura-${(invoiceLabel(row) ?? row.SUuid ?? row.UIdentificadorPublico).replace(/[^A-Za-z0-9-]/g, "")}`;
    await getEmailService().sendInvoiceEmail({
      to,
      organizationName,
      invoiceLabel: invoiceLabel(row) ?? row.SUuid ?? "",
      uuid: row.SUuid ?? "",
      total: money.format(row.NTotal.toNumber()),
      billingUrl: buildPublicAppUrl(BILLING_PAGE_PATH).toString(),
      pdf: { filename: `${name}.pdf`, content: pdf },
      xml: { filename: `${name}.xml`, content: xml },
    });
    await prisma.cfdiPago.update({ where: { IdCfdiPago: row.IdCfdiPago }, data: { DFechaCorreo: new Date(), SMensajeError: null } });
  } catch (error) {
    console.error(`[INVOICING] Invoice ${row.UIdentificadorPublico} was issued but not emailed`, error instanceof Error ? error.name : "UnknownError");
    await prisma.cfdiPago.update({
      where: { IdCfdiPago: row.IdCfdiPago },
      data: { SMensajeError: "La factura se emitió, pero no se pudo enviar por correo. Usa «Reintentar factura» para enviarla de nuevo." },
    });
  }
}

/** One attempt at the CFDI of a claimed row, with the organization's fiscal data as they are now. */
async function attemptIndividual(gateway: InvoicingGateway, row: CfdiPago, purchase: Purchase, fiscal: FiscalData, userId: number | null): Promise<InvoicePurchaseResult> {
  const { totalCents, taxPercent } = chargeOf(purchase);
  const { payload, amounts } = buildIndividualInvoice({
    fiscal,
    paymentReference: row.SReferenciaPago,
    description: purchaseDescription(purchase),
    totalCents,
    taxPercent,
    productKey: productKey(),
    unitKey: unitKey(),
  });
  const amountFields = { NSubtotal: amounts.subtotal, NImpuestos: amounts.tax, NTotal: amounts.total, JDatosReceptor: receiverSnapshot(fiscal) };
  const audit = { organizationId: row.IdOrganizacion, userId, entity: "CfdiPago", entityId: row.UIdentificadorPublico };

  let invoice: IssuedCfdi;
  try {
    invoice = await obtainInvoice(gateway, payload, { externalId: row.SIdentificadorExterno, lookFirst: row.IIntentos > 1 });
  } catch (error) {
    const message = providerMessage(error);
    console.error(`[INVOICING] Payment ${row.SReferenciaPago} not invoiced (${maskRfc(fiscal.rfc)})`, {
      status: error instanceof InvoicingProviderError ? error.status : null,
      code: error instanceof InvoicingProviderError ? error.code : error instanceof Error ? error.name : null,
    });
    await prisma.cfdiPago.update({ where: { IdCfdiPago: row.IdCfdiPago }, data: { ...amountFields, SEstado: CFDI_STATES.failed, SMensajeError: message } });
    await recordAuditEvent({ ...audit, typeKey: "CREACION", action: "BILLING_INVOICE_FAILED", result: "FALLIDA", metadata: { payment: row.SReferenciaPago, error: message } });
    return { action: "failed", invoiceId: row.UIdentificadorPublico, error: message };
  }

  if (invoice.status !== "valid") {
    // The provider keeps retrying the stamp (its 202): the row waits with the provider's id.
    await prisma.cfdiPago.update({
      where: { IdCfdiPago: row.IdCfdiPago },
      data: { ...amountFields, ...issuedFields(invoice), SEstado: CFDI_STATES.pending, SMensajeError: "El SAT todavía no confirma el timbrado. Vuelve a intentarlo en unos minutos." },
    });
    return { action: "pending", invoiceId: row.UIdentificadorPublico };
  }

  const issued = await prisma.cfdiPago.update({
    where: { IdCfdiPago: row.IdCfdiPago },
    data: { ...amountFields, ...issuedFields(invoice), SEstado: CFDI_STATES.issued, SMensajeError: null, DFechaEmision: invoice.date ?? new Date() },
  });
  await recordAuditEvent({
    ...audit,
    typeKey: "CREACION",
    action: "BILLING_INVOICE_ISSUED",
    result: "EMITIDA",
    metadata: { payment: row.SReferenciaPago, uuid: invoice.uuid, total: amounts.total, receiver: maskRfc(fiscal.rfc) },
  });
  await emailInvoice(gateway, issued, purchase.organizacion.SNombre, fiscal.email);
  return { action: "issued", invoiceId: row.UIdentificadorPublico };
}

/**
 * The CFDI of a paid purchase, by its Checkout Session id. Called after the
 * webhook and the success page answered; safe to call any number of times:
 * only the first call for a payment claims its row and asks Facturapi. A
 * payment of an organization without complete fiscal data is left for the
 * monthly global invoice.
 */
export async function invoicePurchase(gateway: InvoicingGateway | null, reference: string): Promise<InvoicePurchaseResult> {
  if (!gateway) return { action: "skipped", reason: "NOT_CONFIGURED" };
  const purchase = await findPurchase(reference);
  if (!purchase) return { action: "skipped", reason: "NOT_FOUND" };
  if (purchase.cfdi) {
    return purchase.cfdi.SEstado === CFDI_STATES.issued || purchase.cfdi.STipo === CFDI_TYPES.global
      ? { action: "already-invoiced", invoiceId: purchase.cfdi.UIdentificadorPublico }
      : { action: "skipped", reason: "IN_PROGRESS" };
  }
  const fiscal = completeFiscalData(purchase.organizacion);
  if (!fiscal) return { action: "skipped", reason: "NO_FISCAL_DATA" };

  const { totalCents, taxPercent } = chargeOf(purchase);
  const amounts = buildIndividualInvoice({ fiscal, paymentReference: reference, description: "", totalCents, taxPercent, productKey: productKey(), unitKey: unitKey() }).amounts;
  let row: CfdiPago;
  try {
    row = await prisma.cfdiPago.create({
      data: {
        IdOrganizacion: purchase.IdOrganizacion,
        IdMovimientoCreditos: purchase.IdMovimientoCreditos,
        SProveedorPago: BILLING_PROVIDER,
        SReferenciaPago: reference,
        STipo: CFDI_TYPES.individual,
        SEstado: CFDI_STATES.pending,
        NSubtotal: amounts.subtotal,
        NImpuestos: amounts.tax,
        NTotal: amounts.total,
        IIntentos: 1,
        DFechaPago: purchase.DFechaCreacion,
      },
    });
  } catch (error) {
    // The webhook and the success page at once: the other one owns the payment.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { action: "skipped", reason: "IN_PROGRESS" };
    throw error;
  }
  return attemptIndividual(gateway, row, purchase, fiscal, null);
}

/** The one place a background invoice is started from: it never throws, it logs. */
export async function invoicePurchaseInBackground(gateway: InvoicingGateway | null, reference: string) {
  try {
    await invoicePurchase(gateway, reference);
  } catch (error) {
    console.error(`[INVOICING] Could not invoice payment ${reference}`, error instanceof Error ? error.name : "UnknownError");
  }
}

const notFound = () => new BillingError(404, "No se encontró la factura.");

async function findOwnInvoice(organizationId: number, publicId: string) {
  const row = await prisma.cfdiPago.findUnique({ where: { UIdentificadorPublico: publicId } });
  if (!row || row.IdOrganizacion !== organizationId) throw notFound();
  return row;
}

/**
 * «Reintentar factura»: a failed or lost attempt is tried again with the
 * fiscal data as they are now (the admin may have just corrected them); an
 * invoice issued but not emailed is emailed again.
 */
export async function retryInvoice(user: AuthUser, publicId: string, gateway: InvoicingGateway | null): Promise<MovementInvoiceDto> {
  if (!gateway) throw new BillingError(503, "La facturación automática todavía no está habilitada.");
  const row = await findOwnInvoice(user.organizationId, publicId);
  if (!isRetryable(row)) throw new BillingError(409, "Esta factura no necesita reintentarse.");
  const purchase = await findPurchase(row.SReferenciaPago);
  if (!purchase) throw notFound();
  const fiscal = completeFiscalData(purchase.organizacion);
  if (!fiscal) throw new BillingError(409, "Completa los datos fiscales de tu organización antes de reintentar la factura.");

  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "CfdiPago",
    entityId: row.UIdentificadorPublico,
    action: "BILLING_INVOICE_RETRIED",
    metadata: { payment: row.SReferenciaPago, previousState: row.SEstado, previousError: row.SMensajeError },
  });

  if (row.SEstado === CFDI_STATES.issued) {
    await emailInvoice(gateway, row, purchase.organizacion.SNombre, fiscal.email);
  } else {
    // Claims the row again; a concurrent retry finds it fresh and stops.
    const claimed = await prisma.cfdiPago.updateMany({
      where: { IdCfdiPago: row.IdCfdiPago, DFechaModificacion: row.DFechaModificacion },
      data: { SEstado: CFDI_STATES.pending, IIntentos: { increment: 1 } },
    });
    if (claimed.count === 0) throw new BillingError(409, "La factura ya se está procesando.");
    await attemptIndividual(gateway, await prisma.cfdiPago.findUniqueOrThrow({ where: { IdCfdiPago: row.IdCfdiPago } }), purchase, fiscal, user.id);
  }
  return movementInvoiceDto(await prisma.cfdiPago.findUniqueOrThrow({ where: { IdCfdiPago: row.IdCfdiPago } }));
}

/** The PDF or XML of an individual invoice of the organization, from Facturapi (no copy is kept here). */
export async function downloadInvoiceFile(organizationId: number, publicId: string, format: "pdf" | "xml", gateway: InvoicingGateway | null) {
  if (!gateway) throw new BillingError(503, "La facturación automática todavía no está habilitada.");
  const row = await findOwnInvoice(organizationId, publicId);
  if (!movementInvoiceDto(row).downloadable) throw notFound();
  const content = await gateway.downloadInvoice(row.SIdentificadorExterno!, format);
  return { content, filename: `factura-${(invoiceLabel(row) ?? row.SUuid ?? publicId).replace(/[^A-Za-z0-9-]/g, "")}.${format}` };
}

// ---------------------------------------------------------------------------
// The monthly global invoice

/**
 * Purchases of `month` (Mexico City) with no CFDI yet, plus those whose
 * global invoice of that month failed: what the global invoice must cover.
 * A purchase whose individual invoice failed is not here: an admin retries it.
 */
async function globalCandidates(month: string) {
  const period = globalPeriod(month);
  return prisma.movimientoCreditos.findMany({
    where: {
      STipo: CREDIT_MOVEMENT_TYPES.purchase,
      SProveedorPago: BILLING_PROVIDER,
      SReferenciaExterna: { not: null },
      DFechaCreacion: { gte: period.start, lt: period.end },
      OR: [{ cfdi: null }, { cfdi: { STipo: CFDI_TYPES.global, SPeriodoGlobal: month, SEstado: { not: CFDI_STATES.issued } } }],
    },
    include: { paquete: true, organizacion: true, cfdi: true },
    orderBy: { DFechaCreacion: "asc" },
  });
}

export type GlobalInvoiceReport = {
  month: string;
  payments: Array<{ reference: string; organization: string; paidAt: string; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  /** Individual invoices of the month that failed: retry them, they are not in the global one. */
  failedIndividual: number;
  issued: { uuid: string | null; facturapiId: string } | null;
  error: string | null;
};

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value * 100, 0)) / 100;

/**
 * `pnpm invoices:global --month 2026-11`: lists what the global invoice of
 * that month would cover; with `apply`, claims those payments and issues it.
 * Run it again after a failure: it retries the same payments.
 */
export async function issueGlobalInvoice(gateway: InvoicingGateway | null, month: string, options: { apply: boolean }): Promise<GlobalInvoiceReport> {
  const period = globalPeriod(month);
  const candidates = await globalCandidates(month);
  const failedIndividual = await prisma.cfdiPago.count({
    where: { STipo: CFDI_TYPES.individual, SEstado: CFDI_STATES.failed, DFechaPago: { gte: period.start, lt: period.end } },
  });
  const charges = candidates.map((purchase) => ({ purchase, ...chargeOf(purchase) }));
  const report: GlobalInvoiceReport = {
    month,
    payments: charges.map(({ purchase, totalCents }) => ({
      reference: purchase.SReferenciaExterna!,
      organization: purchase.organizacion.SNombre,
      paidAt: purchase.DFechaCreacion.toISOString(),
      total: totalCents / 100,
    })),
    subtotal: 0,
    tax: 0,
    total: 0,
    failedIndividual,
    issued: null,
    error: null,
  };
  if (charges.length === 0) return report;

  const sequence = (await prisma.cfdiPago.groupBy({ by: ["SIdentificadorExterno"], where: { STipo: CFDI_TYPES.global, SPeriodoGlobal: month, SEstado: CFDI_STATES.issued } })).length + 1;
  const { payload, amounts } = buildGlobalInvoice({
    month,
    sequence,
    payments: charges.map(({ purchase, totalCents, taxPercent }) => ({ reference: purchase.SReferenciaExterna!, totalCents, taxPercent })),
  });
  report.subtotal = sum(amounts.map((amount) => amount.subtotal));
  report.tax = sum(amounts.map((amount) => amount.tax));
  report.total = sum(amounts.map((amount) => amount.total));
  if (!options.apply) return report;
  if (!gateway) throw new Error("FACTURAPI_KEY is not set: nothing can be issued.");

  // Claim every payment first, so that a late individual invoice cannot take one of them.
  const rows: CfdiPago[] = [];
  for (const [index, { purchase }] of charges.entries()) {
    const data = {
      STipo: CFDI_TYPES.global,
      SPeriodoGlobal: month,
      SEstado: CFDI_STATES.pending,
      NSubtotal: amounts[index].subtotal,
      NImpuestos: amounts[index].tax,
      NTotal: amounts[index].total,
      IIntentos: { increment: 1 },
    };
    try {
      rows.push(
        purchase.cfdi
          ? await prisma.cfdiPago.update({ where: { IdCfdiPago: purchase.cfdi.IdCfdiPago }, data })
          : await prisma.cfdiPago.create({
              data: {
                ...data,
                IIntentos: 1,
                IdOrganizacion: purchase.IdOrganizacion,
                IdMovimientoCreditos: purchase.IdMovimientoCreditos,
                SProveedorPago: BILLING_PROVIDER,
                SReferenciaPago: purchase.SReferenciaExterna!,
                DFechaPago: purchase.DFechaCreacion,
              },
            }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error(`Payment ${purchase.SReferenciaExterna} was invoiced while the global invoice was being prepared; run the command again.`);
      }
      throw error;
    }
  }
  const ids = { IdCfdiPago: { in: rows.map((row) => row.IdCfdiPago) } };
  const previousId = rows.find((row) => row.SIdentificadorExterno)?.SIdentificadorExterno ?? null;

  let invoice: IssuedCfdi;
  try {
    invoice = await obtainInvoice(gateway, payload, { externalId: previousId, lookFirst: rows.some((row) => row.IIntentos > 1) });
  } catch (error) {
    report.error = providerMessage(error);
    await prisma.cfdiPago.updateMany({ where: ids, data: { SEstado: CFDI_STATES.failed, SMensajeError: report.error } });
    await recordAuditEvent({ typeKey: "CREACION", entity: "CfdiPago", entityId: `global-${month}`, action: "BILLING_GLOBAL_INVOICE_FAILED", result: "FALLIDA", metadata: { month, payments: rows.length, error: report.error } });
    return report;
  }
  const stamped = invoice.status === "valid";
  await prisma.cfdiPago.updateMany({
    where: ids,
    data: {
      ...issuedFields(invoice),
      SEstado: stamped ? CFDI_STATES.issued : CFDI_STATES.pending,
      SMensajeError: stamped ? null : "El SAT todavía no confirma el timbrado de la factura global. Vuelve a correr el comando en unos minutos.",
      DFechaEmision: stamped ? invoice.date ?? new Date() : null,
    },
  });
  report.issued = { uuid: invoice.uuid, facturapiId: invoice.id };
  if (stamped) {
    await recordAuditEvent({
      typeKey: "CREACION",
      entity: "CfdiPago",
      entityId: `global-${month}`,
      action: "BILLING_GLOBAL_INVOICE_ISSUED",
      result: "EMITIDA",
      metadata: { month, payments: rows.length, uuid: invoice.uuid, total: report.total },
    });
  } else {
    report.error = "El SAT todavía no confirma el timbrado; vuelve a correr el comando en unos minutos.";
  }
  return report;
}

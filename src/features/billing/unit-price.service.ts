/**
 * The price of one Avalúo Disponible (commercial policies, section 1.2: sold
 * by unit, no packages) and its announced changes (section 7.1). The price
 * lives in the unit package (PaqueteCreditos AVALUO_1, set by
 * scripts/billing-set-unit-price.ts); nothing here changes it except a price
 * notice whose date arrived: the operator announces a future price at least a
 * month ahead (scripts/billing-price-notice.ts), every user sees a banner and
 * gets an email, and from that date the next purchase charges the new price.
 * What was already paid is never touched: the ledger counts credits, not money.
 */
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { BILLING_CURRENCY, BILLING_PAGE_PATH, priceBreakdown } from "./billing-rules";
import { addOneMonth, preTaxAmountFor } from "./credit-rules";

/** The package that is the unit price, as scripts/billing-set-unit-price.ts creates it. */
export const UNIT_PACKAGE_KEY = "AVALUO_1";

/** The unit package: AVALUO_1 when on sale, else any sellable package of one credit. */
export async function findUnitPackage(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const candidates = await db.paqueteCreditos.findMany({
    where: { BActivo: true, BEsPublico: true, SMoneda: BILLING_CURRENCY, ICreditos: 1 },
    orderBy: [{ IOrden: "asc" }, { IdPaqueteCreditos: "asc" }],
  });
  return candidates.find((pkg) => pkg.SClave === UNIT_PACKAGE_KEY) ?? candidates[0] ?? null;
}

export type UnitPriceDto = {
  packageId: string;
  /** Before tax, the tax and the total of one Avalúo Disponible, in MXN. */
  subtotal: number;
  tax: number;
  total: number;
  taxPercent: number;
};

export const unitPriceDto = (pkg: { UIdentificadorPublico: string; NImporte: Prisma.Decimal; NImpuestoPorcentaje: Prisma.Decimal }): UnitPriceDto => {
  const { subtotal, tax, total } = priceBreakdown(pkg.NImporte, pkg.NImpuestoPorcentaje);
  return { packageId: pkg.UIdentificadorPublico, subtotal, tax, total, taxPercent: pkg.NImpuestoPorcentaje.toNumber() };
};

const openNotice = { DFechaCancelacion: null, DFechaAplicacion: null } as const;

/**
 * A notice whose date arrived takes effect: the unit package gets the new
 * price (before tax, so that with IVA it is exactly the announced total).
 * Idempotent and safe at once from two requests: only the one that stamps
 * DFechaAplicacion writes the price.
 */
export async function applyDuePriceNotice(now = new Date()) {
  const due = await prisma.avisoPrecio.findFirst({ where: { ...openNotice, DFechaVigencia: { lte: now } }, orderBy: { DFechaVigencia: "desc" } });
  if (!due) return null;
  const preTax = preTaxAmountFor(due.NPrecioNuevo, due.NImpuestoPorcentaje);
  if (!preTax) throw new Error(`Price notice ${due.UIdentificadorPublico} has no amount before tax that gives ${due.NPrecioNuevo.toFixed(2)}.`);
  const applied = await prisma.$transaction(async (tx) => {
    const stamped = await tx.avisoPrecio.updateMany({ where: { IdAvisoPrecio: due.IdAvisoPrecio, ...openNotice }, data: { DFechaAplicacion: now } });
    if (stamped.count === 0) return false;
    // Older due notices that were never applied are superseded by this one.
    await tx.avisoPrecio.updateMany({ where: { ...openNotice, DFechaVigencia: { lte: now }, IdAvisoPrecio: { not: due.IdAvisoPrecio } }, data: { DFechaCancelacion: now } });
    await tx.paqueteCreditos.update({ where: { SClave: due.SClavePaquete }, data: { NImporte: preTax, NImpuestoPorcentaje: due.NImpuestoPorcentaje } });
    return true;
  });
  if (applied) {
    await recordAuditEvent({
      typeKey: "MODIFICACION",
      entity: "AvisoPrecio",
      entityId: due.UIdentificadorPublico,
      action: "BILLING_PRICE_CHANGE_APPLIED",
      metadata: { package: due.SClavePaquete, previous: due.NPrecioAnterior.toFixed(2), price: due.NPrecioNuevo.toFixed(2) },
    });
  }
  return applied ? due : null;
}

/** The current unit price, after applying a notice whose date arrived; null when nothing is on sale. */
export async function getUnitPrice(now = new Date()) {
  await applyDuePriceNotice(now);
  return findUnitPackage();
}

export type PriceNoticeDto = {
  id: string;
  currentPrice: number;
  newPrice: number;
  effectiveAt: string;
};

/** The announced change the banner shows: announced, not cancelled, not in force yet. */
export async function getActivePriceNotice(now = new Date()): Promise<PriceNoticeDto | null> {
  const notice = await prisma.avisoPrecio.findFirst({
    where: { ...openNotice, DFechaAnuncio: { lte: now }, DFechaVigencia: { gt: now } },
    orderBy: { DFechaVigencia: "asc" },
  });
  return notice
    ? { id: notice.UIdentificadorPublico, currentPrice: notice.NPrecioAnterior.toNumber(), newPrice: notice.NPrecioNuevo.toNumber(), effectiveAt: notice.DFechaVigencia.toISOString() }
    : null;
}

export class PriceNoticeError extends Error {}

/**
 * Validates and records a future price (with IVA). The date must be at least
 * a month after today (section 7.1); only one change can be pending; the new
 * total must be reachable in centavos with the package's tax. `apply: false`
 * answers what would be recorded and writes nothing.
 */
export async function announcePriceChange(input: { newPrice: string; effectiveAt: Date; now?: Date; apply: boolean }) {
  const now = input.now ?? new Date();
  const unit = await getUnitPrice(now);
  if (!unit) throw new PriceNoticeError("No hay precio por avalúo publicado (pnpm billing:set-unit-price).");
  const newPrice = new Prisma.Decimal(input.newPrice);
  if (!newPrice.isFinite() || newPrice.lt(0)) throw new PriceNoticeError("El precio nuevo debe ser un importe en pesos, con IVA.");
  if (input.effectiveAt.getTime() < addOneMonth(now).getTime()) {
    throw new PriceNoticeError(`El cambio debe avisarse con al menos un mes de anticipación: la fecha más próxima es ${addOneMonth(now).toISOString().slice(0, 10)}.`);
  }
  if (!preTaxAmountFor(newPrice, unit.NImpuestoPorcentaje)) throw new PriceNoticeError(`No hay un importe antes de IVA en centavos que dé ${newPrice.toFixed(2)} con IVA.`);
  const pending = await prisma.avisoPrecio.findFirst({ where: openNotice });
  if (pending) throw new PriceNoticeError(`Ya hay un cambio pendiente (${pending.UIdentificadorPublico}); cancélalo antes de anunciar otro.`);
  const currentPrice = priceBreakdown(unit.NImporte, unit.NImpuestoPorcentaje).total;
  if (newPrice.equals(currentPrice)) throw new PriceNoticeError("El precio nuevo es igual al vigente.");

  const draft = { SClavePaquete: unit.SClave, NPrecioAnterior: new Prisma.Decimal(currentPrice), NPrecioNuevo: newPrice, NImpuestoPorcentaje: unit.NImpuestoPorcentaje, DFechaAnuncio: now, DFechaVigencia: input.effectiveAt };
  if (!input.apply) return { recorded: false as const, draft };
  const notice = await prisma.avisoPrecio.create({ data: draft });
  await recordAuditEvent({
    typeKey: "CREACION",
    entity: "AvisoPrecio",
    entityId: notice.UIdentificadorPublico,
    action: "BILLING_PRICE_CHANGE_ANNOUNCED",
    metadata: { previous: draft.NPrecioAnterior.toFixed(2), price: newPrice.toFixed(2), effectiveAt: input.effectiveAt.toISOString() },
  });
  return { recorded: true as const, notice, draft };
}

export async function cancelPriceNotice(publicId: string, now = new Date()) {
  const cancelled = await prisma.avisoPrecio.updateMany({ where: { UIdentificadorPublico: publicId, ...openNotice }, data: { DFechaCancelacion: now } });
  if (cancelled.count === 0) throw new PriceNoticeError("No hay un aviso pendiente con ese id.");
  await recordAuditEvent({ typeKey: "MODIFICACION", entity: "AvisoPrecio", entityId: publicId, action: "BILLING_PRICE_CHANGE_CANCELLED" });
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const longDate = (date: Date) => date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/** The words of the notice, the same in the banner and the email. */
export function priceNoticeSentence(notice: { currentPrice: number; newPrice: number; effectiveAt: Date | string }) {
  return `A partir del ${longDate(new Date(notice.effectiveAt))}, el precio de cada Avalúo Disponible será de ${money.format(notice.newPrice)} MXN con IVA incluido (hoy ${money.format(notice.currentPrice)}).`;
}

export const PRICE_NOTICE_PAID_SENTENCE = "Los Avalúos Disponibles que ya pagaste no cambian: se respetan y no vencen.";

/** Everyone who can use the platform: active users of active organizations, one email each. */
export async function priceNoticeRecipients() {
  const users = await prisma.usuario.findMany({
    where: {
      BActivo: true,
      DFechaEliminacion: null,
      miembros: { some: { BActivo: true, organizacion: { BActivo: true, DFechaEliminacion: null } } },
    },
    select: { IdUsuario: true, SCorreo: true, SNombre: true },
    orderBy: { IdUsuario: "asc" },
  });
  const seen = new Set<string>();
  return users.filter((user) => {
    const key = user.SCorreo.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Emails the notice to every user, once: a notice already sent is skipped.
 * Each email sent is audited with its recipient and date (matrix 3.4).
 */
export async function sendPriceNoticeEmails(
  publicId: string,
  options: { now?: Date; recipients?: Awaited<ReturnType<typeof priceNoticeRecipients>> } = {},
) {
  const now = options.now ?? new Date();
  const notice = await prisma.avisoPrecio.findUnique({ where: { UIdentificadorPublico: publicId } });
  if (!notice || notice.DFechaCancelacion || notice.DFechaAplicacion) throw new PriceNoticeError("No hay un aviso pendiente con ese id.");
  if (notice.DFechaCorreos) return { sent: 0, failed: 0, alreadySent: true };
  const content = { currentPrice: notice.NPrecioAnterior.toNumber(), newPrice: notice.NPrecioNuevo.toNumber(), effectiveAt: notice.DFechaVigencia };
  const url = buildPublicAppUrl(BILLING_PAGE_PATH).toString();
  let sent = 0;
  let failed = 0;
  for (const user of options.recipients ?? (await priceNoticeRecipients())) {
    try {
      await getEmailService().sendBillingNotice({
        to: user.SCorreo,
        subject: "Aviso de cambio de precio de Valuaxis Soft",
        greeting: `Hola, ${user.SNombre}:`,
        lines: [priceNoticeSentence(content), PRICE_NOTICE_PAID_SENTENCE, "Te avisamos con al menos un mes de anticipación, como dicen las políticas comerciales (sección 7.1)."],
        details: [],
        link: { label: "Ver Plan y facturación", url },
      });
      sent += 1;
      await recordAuditEvent({
        typeKey: "CREACION",
        userId: user.IdUsuario,
        entity: "AvisoPrecio",
        entityId: notice.UIdentificadorPublico,
        action: "BILLING_PRICE_NOTICE_EMAILED",
        metadata: { to: user.SCorreo, sentAt: new Date().toISOString(), price: notice.NPrecioNuevo.toFixed(2), effectiveAt: notice.DFechaVigencia.toISOString() },
      });
    } catch (error) {
      failed += 1;
      console.error("[BILLING_PRICE_NOTICE_EMAIL]", { notice: notice.UIdentificadorPublico, userId: user.IdUsuario }, error);
    }
  }
  await prisma.avisoPrecio.update({ where: { IdAvisoPrecio: notice.IdAvisoPrecio }, data: { DFechaCorreos: now, ICorreosEnviados: sent } });
  return { sent, failed, alreadySent: false };
}

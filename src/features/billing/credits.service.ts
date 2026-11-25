/**
 * The credit ledger of an organization (MovimientoCreditos, migration 040):
 * purchases, consumptions, the free trial and manual adjustments.
 * Append-only; the balance is the sum, less unused trial credits past their
 * month (credit-rules.ts, creditSummary). Every write takes the
 * organization's ledger lock, so a purchase credited from the success page
 * and from the webhook at once, or two consumptions of the same valuation,
 * still produce one row each.
 */
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { BILLING_PAGE_PATH } from "./billing-rules";
import {
  CREDIT_KINDS,
  CREDIT_MOVEMENT_TYPES,
  TRIAL_CREDITS,
  addOneMonth,
  concludeCreditDecision,
  consumptionSource,
  createCreditDecision,
  creditMovementLabel,
  creditSummary,
  isValidMovement,
  type ConsumptionMoment,
  type CreditMovementType,
  type CreditSource,
  type CreditSummary,
  type TrialLedger,
} from "./credit-rules";
import { movementInvoiceDto, type MovementInvoiceDto } from "./invoicing.service";

type Db = Prisma.TransactionClient | typeof prisma;

const LEDGER_LOCK_NAMESPACE = 7262;

/** One ledger writer per organization at a time, for the rest of the transaction. */
export async function lockCreditLedger(tx: Prisma.TransactionClient, organizationId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, ${organizationId}::int)`;
}

const trialGrantWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId,
  STipo: CREDIT_MOVEMENT_TYPES.adjustment,
  JMetadatos: { path: ["kind"], equals: CREDIT_KINDS.trialGrant },
});

/** The trial as the ledger has it, or null for an organization that never had one (every one registered before the policies). */
async function readTrialLedger(organizationId: number, db: Db): Promise<TrialLedger | null> {
  const grants = await db.movimientoCreditos.findMany({ where: trialGrantWhere(organizationId), select: { ICreditos: true, JMetadatos: true } });
  if (!grants.length) return null;
  const [usedFromTrial, expired] = await Promise.all([
    db.movimientoCreditos.count({ where: { IdOrganizacion: organizationId, STipo: CREDIT_MOVEMENT_TYPES.consumption, JMetadatos: { path: ["source"], equals: "TRIAL" } } }),
    db.movimientoCreditos.aggregate({
      where: { IdOrganizacion: organizationId, STipo: CREDIT_MOVEMENT_TYPES.adjustment, JMetadatos: { path: ["kind"], equals: CREDIT_KINDS.trialExpiry } },
      _sum: { ICreditos: true },
    }),
  ]);
  const expiries = grants.map((grant) => new Date(String((grant.JMetadatos as { expiresAt?: unknown } | null)?.expiresAt ?? 0)).getTime());
  return {
    granted: grants.reduce((sum, grant) => sum + grant.ICreditos, 0),
    expiresAt: new Date(Math.max(...expiries.map((time) => (Number.isFinite(time) ? time : 0)))),
    usedFromTrial,
    expiredWritten: Math.abs(expired._sum.ICreditos ?? 0),
  };
}

export async function getCreditSummary(organizationId: number, db: Db = prisma, now = new Date()): Promise<CreditSummary> {
  const [sum, trial] = await Promise.all([
    db.movimientoCreditos.aggregate({ where: { IdOrganizacion: organizationId }, _sum: { ICreditos: true } }),
    readTrialLedger(organizationId, db),
  ]);
  return creditSummary(sum._sum.ICreditos ?? 0, trial, now);
}

export async function getCreditBalance(organizationId: number, db: Db = prisma, now = new Date()): Promise<number> {
  return (await getCreditSummary(organizationId, db, now)).balance;
}

/**
 * Inside a ledger write (lock taken): unused trial credits past their month
 * are written off with a TRIAL_EXPIRY movement, so the ledger's sum and the
 * balance agree again. Answers the summary after it.
 */
async function settleTrialExpiry(tx: Prisma.TransactionClient, organizationId: number, now: Date): Promise<CreditSummary> {
  const summary = await getCreditSummary(organizationId, tx, now);
  const pending = summary.trial?.pendingExpiry ?? 0;
  if (pending <= 0) return summary;
  await tx.movimientoCreditos.create({
    data: {
      IdOrganizacion: organizationId,
      STipo: CREDIT_MOVEMENT_TYPES.adjustment,
      ICreditos: -pending,
      SDescripcion: `Vencieron ${pending} ${pending === 1 ? "avalúo disponible" : "avalúos disponibles"} de prueba sin usar`,
      JMetadatos: { kind: CREDIT_KINDS.trialExpiry, expiredAt: summary.trial!.expiresAt.toISOString() },
    },
  });
  return { ...summary, trial: { ...summary.trial!, pendingExpiry: 0 } };
}

/** For the ops script: writes the pending trial expiry of one organization. Answers how many credits it wrote off. */
export async function writeTrialExpiry(organizationId: number, now = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await lockCreditLedger(tx, organizationId);
    const before = (await getCreditSummary(organizationId, tx, now)).trial?.pendingExpiry ?? 0;
    await settleTrialExpiry(tx, organizationId, now);
    return before;
  });
}

const dateInMexico = (date: Date) =>
  date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/**
 * The free trial of a new account (policies, section 2): three Avalúos
 * Disponibles that expire a month after registration. Called by both
 * registrations (email and Google), inside their transaction; an
 * organization gets it once.
 */
export async function grantTrialCredits(tx: Prisma.TransactionClient, organizationId: number, registeredAt = new Date()) {
  await lockCreditLedger(tx, organizationId);
  if (await tx.movimientoCreditos.findFirst({ where: trialGrantWhere(organizationId), select: { IdMovimientoCreditos: true } })) return;
  const expiresAt = addOneMonth(registeredAt);
  await tx.movimientoCreditos.create({
    data: {
      IdOrganizacion: organizationId,
      STipo: CREDIT_MOVEMENT_TYPES.adjustment,
      ICreditos: TRIAL_CREDITS,
      SDescripcion: `Prueba gratuita: ${TRIAL_CREDITS} avalúos disponibles hasta el ${dateInMexico(expiresAt)}`,
      JMetadatos: { kind: CREDIT_KINDS.trialGrant, expiresAt: expiresAt.toISOString(), registeredAt: registeredAt.toISOString() },
    },
  });
}

/** How a purchase was paid and for what, as each COMPRA keeps it in JMetadatos.purchase (matrix 3.4). */
export type PurchaseRecord = {
  quantity: number;
  /** The unit price shown, IVA included, in MXN. */
  unitPrice: number;
  /** What was paid, IVA included, in MXN. */
  amount: number;
  method: PaymentMethod;
};

export const PAYMENT_METHODS = { card: "TARJETA", transfer: "TRANSFERENCIA", deposit: "DEPOSITO" } as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { TARJETA: "Tarjeta (Stripe)", TRANSFERENCIA: "Transferencia", DEPOSITO: "Depósito en efectivo" };
export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;

export type CreditMovementDto = {
  id: string;
  type: CreditMovementType;
  typeLabel: string;
  credits: number;
  description: string | null;
  /** The valuation a consumption belongs to, for the link. */
  valuation: { id: string; folio: string } | null;
  userName: string | null;
  createdAt: string;
  /** A purchase's record: price shown, amount, method and reference. */
  purchase: (PurchaseRecord & { methodLabel: string; reference: string | null }) | null;
  /** The CFDI of a purchase, once it was attempted or went into a global invoice. */
  invoice: MovementInvoiceDto | null;
};

export const CREDIT_MOVEMENTS_SHOWN = 50;

/** The purchase record of a COMPRA; a card purchase from before the policies has only Stripe's amount. */
function purchaseOf(row: { STipo: string; ICreditos: number; SReferenciaExterna: string | null; JMetadatos: Prisma.JsonValue }): CreditMovementDto["purchase"] {
  if (row.STipo !== CREDIT_MOVEMENT_TYPES.purchase) return null;
  const metadata = (row.JMetadatos ?? {}) as { purchase?: Partial<PurchaseRecord>; stripe?: { amountTotal?: number | null } };
  const stripeAmount = typeof metadata.stripe?.amountTotal === "number" ? metadata.stripe.amountTotal / 100 : null;
  const amount = metadata.purchase?.amount ?? stripeAmount ?? 0;
  const quantity = metadata.purchase?.quantity ?? row.ICreditos;
  const method = metadata.purchase?.method ?? PAYMENT_METHODS.card;
  return {
    quantity,
    unitPrice: metadata.purchase?.unitPrice ?? (quantity > 0 ? Math.round((amount / quantity) * 100) / 100 : 0),
    amount,
    method,
    methodLabel: paymentMethodLabel(method),
    reference: row.SReferenciaExterna,
  };
}

export async function listCreditMovements(organizationId: number, limit = CREDIT_MOVEMENTS_SHOWN): Promise<CreditMovementDto[]> {
  const rows = await prisma.movimientoCreditos.findMany({
    where: { IdOrganizacion: organizationId },
    include: {
      avaluo: { select: { UIdentificadorPublico: true, SFolio: true } },
      usuario: { select: { SNombre: true, SApellidoPaterno: true } },
      cfdi: true,
    },
    orderBy: [{ DFechaCreacion: "desc" }, { IdMovimientoCreditos: "desc" }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.UIdentificadorPublico,
    type: row.STipo as CreditMovementType,
    typeLabel: creditMovementLabel(row.STipo, row.JMetadatos),
    credits: row.ICreditos,
    description: row.SDescripcion,
    valuation: row.avaluo ? { id: row.avaluo.UIdentificadorPublico, folio: row.avaluo.SFolio } : null,
    userName: row.usuario ? [row.usuario.SNombre, row.usuario.SApellidoPaterno].filter(Boolean).join(" ") : null,
    createdAt: row.DFechaCreacion.toISOString(),
    purchase: purchaseOf(row),
    invoice: row.cfdi ? movementInvoiceDto(row.cfdi) : null,
  }));
}

/** Shown when creating is blocked; the page to buy from goes with it. */
export const NO_CREDITS_TO_CREATE_MESSAGE =
  "Tu organización no tiene avalúos disponibles. Compra avalúos en Plan y facturación para crear uno nuevo.";

/** Shown when concluding a valuation created before the policies (never charged) is blocked. */
export const NO_CREDITS_MESSAGE =
  "Tu organización no tiene avalúos disponibles. Este avalúo se creó antes del cobro al crear y se descuenta al concluirlo: compra avalúos en Plan y facturación para poder concluirlo.";

export type ConsumeCreditResult =
  | { action: "consumed"; balance: number; source: CreditSource }
  | { action: "already-consumed"; balance: number }
  | { action: "blocked"; balance: number; message: string; link: string };

async function recordConsumption(
  tx: Prisma.TransactionClient,
  input: { organizationId: number; valuationId: number; folio: string; userId: number; moment: ConsumptionMoment; source: CreditSource },
) {
  await tx.movimientoCreditos.create({
    data: {
      IdOrganizacion: input.organizationId,
      STipo: CREDIT_MOVEMENT_TYPES.consumption,
      ICreditos: -1,
      IdAvaluo: input.valuationId,
      IdUsuario: input.userId,
      SDescripcion: `Avalúo ${input.folio} ${input.moment === "CREATION" ? "creado" : "concluido"}${input.source === "TRIAL" ? " (prueba gratuita)" : ""}`,
      JMetadatos: { moment: input.moment, source: input.source },
    },
  });
}

/** Thrown inside the creation's transaction so nothing of the new valuation is written. */
export class NoCreditsError extends Error {
  constructor(
    message: string,
    readonly link: string,
  ) {
    super(message);
    this.name = "NoCreditsError";
  }
}

/**
 * The hook of «Crear avalúo» and «Duplicar», inside their transaction, right
 * after the valuation row exists: it consumes one Avalúo Disponible, a trial
 * one first. With BCobroPorAvaluo on and no balance it throws NoCreditsError,
 * so the whole creation rolls back; off, the consumption is recorded and the
 * balance goes negative.
 */
export async function consumeCreditOnCreation(
  tx: Prisma.TransactionClient,
  input: { organizationId: number; valuationId: number; folio: string; userId: number; now?: Date },
): Promise<Extract<ConsumeCreditResult, { action: "consumed" }>> {
  await lockCreditLedger(tx, input.organizationId);
  const [organization, summary] = await Promise.all([
    tx.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: input.organizationId }, select: { BCobroPorAvaluo: true } }),
    settleTrialExpiry(tx, input.organizationId, input.now ?? new Date()),
  ]);
  const decision = createCreditDecision({ balance: summary.balance, enforced: organization.BCobroPorAvaluo });
  if (decision.action === "block") throw new NoCreditsError(NO_CREDITS_TO_CREATE_MESSAGE, BILLING_PAGE_PATH);
  const source = consumptionSource(summary);
  await recordConsumption(tx, { ...input, moment: "CREATION", source });
  return { action: "consumed", balance: summary.balance - 1, source };
}

/**
 * The hook of the conclusion flow, inside its transaction, for the
 * transition: a valuation that already consumed (at its creation, or at an
 * earlier conclusion) is not charged again. One created before the policies
 * and never charged consumes now, as before. With BCobroPorAvaluo on and no
 * balance it answers "blocked" and writes nothing, so the caller aborts.
 */
export async function consumeCreditForValuation(
  tx: Prisma.TransactionClient,
  input: { organizationId: number; valuationId: number; folio: string; userId: number; previouslyConcluded?: boolean; now?: Date },
): Promise<ConsumeCreditResult> {
  await lockCreditLedger(tx, input.organizationId);
  const consumed = await tx.movimientoCreditos.findFirst({
    where: { IdAvaluo: input.valuationId, STipo: CREDIT_MOVEMENT_TYPES.consumption },
    select: { IdMovimientoCreditos: true },
  });
  const [organization, summary] = await Promise.all([
    tx.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: input.organizationId }, select: { BCobroPorAvaluo: true } }),
    getCreditSummary(input.organizationId, tx, input.now),
  ]);
  const decision = concludeCreditDecision({
    alreadyConsumed: consumed !== null,
    previouslyConcluded: input.previouslyConcluded,
    balance: summary.balance,
    enforced: organization.BCobroPorAvaluo,
  });
  if (decision.action === "skip") return { action: "already-consumed", balance: summary.balance };
  if (decision.action === "block") return { action: "blocked", balance: summary.balance, message: NO_CREDITS_MESSAGE, link: BILLING_PAGE_PATH };
  await settleTrialExpiry(tx, input.organizationId, input.now ?? new Date());
  const source = consumptionSource(summary);
  await recordConsumption(tx, { ...input, moment: "CONCLUSION", source });
  return { action: "consumed", balance: summary.balance - 1, source };
}

export type PurchaseCreditInput = {
  organizationId: number;
  packageId: number | null;
  credits: number;
  /** Who took the payment: Stripe, or a transfer or deposit the operator confirmed. */
  provider: string;
  /** The payment this comes from: credited once per (provider, reference). */
  reference: string;
  description: string;
  purchase: PurchaseRecord;
  metadata?: Record<string, Prisma.InputJsonValue>;
  userId?: number | null;
};

/**
 * Credits a paid purchase exactly once. The success page and the webhook both
 * call it with the same Checkout Session id; the second caller finds the row
 * (or hits the unique index if both arrive at once) and credits nothing.
 */
export async function creditPurchase(input: PurchaseCreditInput): Promise<{ credited: boolean; balance: number }> {
  if (!isValidMovement(CREDIT_MOVEMENT_TYPES.purchase, input.credits)) throw new Error(`A purchase must credit a positive number of credits, got ${input.credits}.`);
  return prisma.$transaction(async (tx) => {
    await lockCreditLedger(tx, input.organizationId);
    const existing = await tx.movimientoCreditos.findFirst({
      where: { SProveedorPago: input.provider, SReferenciaExterna: input.reference },
      select: { IdOrganizacion: true },
    });
    if (existing) {
      if (existing.IdOrganizacion !== input.organizationId) throw new Error(`Payment ${input.reference} was credited to another organization.`);
      return { credited: false, balance: await getCreditBalance(input.organizationId, tx) };
    }
    await settleTrialExpiry(tx, input.organizationId, new Date());
    try {
      await tx.movimientoCreditos.create({
        data: {
          IdOrganizacion: input.organizationId,
          STipo: CREDIT_MOVEMENT_TYPES.purchase,
          ICreditos: input.credits,
          IdPaqueteCreditos: input.packageId,
          IdUsuario: input.userId ?? null,
          SProveedorPago: input.provider,
          SReferenciaExterna: input.reference,
          SDescripcion: input.description,
          JMetadatos: { ...input.metadata, purchase: input.purchase },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { credited: false, balance: await getCreditBalance(input.organizationId, tx) };
      }
      throw error;
    }
    return { credited: true, balance: await getCreditBalance(input.organizationId, tx) };
  });
}

/**
 * A manual movement of either sign (a courtesy, a referral, a correction),
 * from a script until the referral rules exist. Recorded in the audit log.
 */
export async function adjustCredits(input: { organizationId: number; credits: number; reason: string; userId?: number | null }) {
  if (!isValidMovement(CREDIT_MOVEMENT_TYPES.adjustment, input.credits)) throw new Error("An adjustment must be a non-zero whole number of credits.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("An adjustment needs a reason.");
  const balance = await prisma.$transaction(async (tx) => {
    await lockCreditLedger(tx, input.organizationId);
    await settleTrialExpiry(tx, input.organizationId, new Date());
    await tx.movimientoCreditos.create({
      data: {
        IdOrganizacion: input.organizationId,
        STipo: CREDIT_MOVEMENT_TYPES.adjustment,
        ICreditos: input.credits,
        IdUsuario: input.userId ?? null,
        SDescripcion: reason.slice(0, 500),
      },
    });
    return getCreditBalance(input.organizationId, tx);
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: input.organizationId,
    userId: input.userId ?? undefined,
    entity: "MovimientoCreditos",
    entityId: String(input.organizationId),
    action: "BILLING_CREDITS_ADJUSTED",
    metadata: { credits: input.credits, reason, balance },
  });
  return { balance };
}

/** Turns the per-appraisal charge on or off for one organization (BCobroPorAvaluo). */
export async function setCreditEnforcement(organizationId: number, enforced: boolean) {
  await prisma.organizacion.update({ where: { IdOrganizacion: organizationId }, data: { BCobroPorAvaluo: enforced } });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId,
    entity: "Organizacion",
    entityId: String(organizationId),
    action: "BILLING_CREDIT_ENFORCEMENT_CHANGED",
    metadata: { enforced },
  });
}

/**
 * The credit ledger of an organization (MovimientoCreditos, migration 040):
 * purchases, consumptions and manual adjustments. Append-only; the balance is
 * the sum. Every write takes the organization's ledger lock, so a purchase
 * credited from the success page and from the webhook at once, or two
 * conclusions of the same valuation, still produce one row each.
 */
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { BILLING_PAGE_PATH, BILLING_PROVIDER } from "./billing-rules";
import { CREDIT_MOVEMENT_TYPES, concludeCreditDecision, creditMovementLabel, isValidMovement, type CreditMovementType } from "./credit-rules";

type Db = Prisma.TransactionClient | typeof prisma;

const LEDGER_LOCK_NAMESPACE = 7262;

/** One ledger writer per organization at a time, for the rest of the transaction. */
export async function lockCreditLedger(tx: Prisma.TransactionClient, organizationId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, ${organizationId}::int)`;
}

export async function getCreditBalance(organizationId: number, db: Db = prisma): Promise<number> {
  const sum = await db.movimientoCreditos.aggregate({ where: { IdOrganizacion: organizationId }, _sum: { ICreditos: true } });
  return sum._sum.ICreditos ?? 0;
}

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
};

export const CREDIT_MOVEMENTS_SHOWN = 50;

export async function listCreditMovements(organizationId: number, limit = CREDIT_MOVEMENTS_SHOWN): Promise<CreditMovementDto[]> {
  const rows = await prisma.movimientoCreditos.findMany({
    where: { IdOrganizacion: organizationId },
    include: {
      avaluo: { select: { UIdentificadorPublico: true, SFolio: true } },
      usuario: { select: { SNombre: true, SApellidoPaterno: true } },
    },
    orderBy: [{ DFechaCreacion: "desc" }, { IdMovimientoCreditos: "desc" }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.UIdentificadorPublico,
    type: row.STipo as CreditMovementType,
    typeLabel: creditMovementLabel(row.STipo),
    credits: row.ICreditos,
    description: row.SDescripcion,
    valuation: row.avaluo ? { id: row.avaluo.UIdentificadorPublico, folio: row.avaluo.SFolio } : null,
    userName: row.usuario ? [row.usuario.SNombre, row.usuario.SApellidoPaterno].filter(Boolean).join(" ") : null,
    createdAt: row.DFechaCreacion.toISOString(),
  }));
}

/** Shown when concluding is blocked; the page to buy from goes with it. */
export const NO_CREDITS_MESSAGE =
  "Tu organización no tiene avalúos disponibles. Compra un paquete en Plan y facturación para poder concluir.";

export type ConsumeCreditResult =
  | { action: "consumed" | "already-consumed"; balance: number }
  | { action: "blocked"; balance: number; message: string; link: string };

/**
 * The hook of the conclusion flow, inside its transaction: the first
 * conclusion of a valuation consumes one credit; a later one (after a
 * reopening) does not. With the organization's BCobroPorAvaluo on and no
 * balance, it answers "blocked" and writes nothing, so the caller aborts;
 * off, the consumption is recorded and the balance goes negative.
 */
export async function consumeCreditForValuation(
  tx: Prisma.TransactionClient,
  input: { organizationId: number; valuationId: number; folio: string; userId: number },
): Promise<ConsumeCreditResult> {
  await lockCreditLedger(tx, input.organizationId);
  const [organization, consumed, balance] = await Promise.all([
    tx.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: input.organizationId }, select: { BCobroPorAvaluo: true } }),
    tx.movimientoCreditos.findFirst({ where: { IdAvaluo: input.valuationId, STipo: CREDIT_MOVEMENT_TYPES.consumption }, select: { IdMovimientoCreditos: true } }),
    getCreditBalance(input.organizationId, tx),
  ]);
  const decision = concludeCreditDecision({ alreadyConsumed: consumed !== null, balance, enforced: organization.BCobroPorAvaluo });
  if (decision.action === "skip") return { action: "already-consumed", balance };
  if (decision.action === "block") return { action: "blocked", balance, message: NO_CREDITS_MESSAGE, link: BILLING_PAGE_PATH };

  await tx.movimientoCreditos.create({
    data: {
      IdOrganizacion: input.organizationId,
      STipo: CREDIT_MOVEMENT_TYPES.consumption,
      ICreditos: -1,
      IdAvaluo: input.valuationId,
      IdUsuario: input.userId,
      SDescripcion: `Avalúo ${input.folio} concluido`,
    },
  });
  return { action: "consumed", balance: balance - 1 };
}

export type PurchaseCreditInput = {
  organizationId: number;
  packageId: number;
  credits: number;
  /** The payment this comes from: credited once per (provider, reference). */
  reference: string;
  description: string;
  metadata: Prisma.InputJsonValue;
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
      where: { SProveedorPago: BILLING_PROVIDER, SReferenciaExterna: input.reference },
      select: { IdOrganizacion: true },
    });
    if (existing) {
      if (existing.IdOrganizacion !== input.organizationId) throw new Error(`Payment ${input.reference} was credited to another organization.`);
      return { credited: false, balance: await getCreditBalance(input.organizationId, tx) };
    }
    try {
      await tx.movimientoCreditos.create({
        data: {
          IdOrganizacion: input.organizationId,
          STipo: CREDIT_MOVEMENT_TYPES.purchase,
          ICreditos: input.credits,
          IdPaqueteCreditos: input.packageId,
          SProveedorPago: BILLING_PROVIDER,
          SReferenciaExterna: input.reference,
          SDescripcion: input.description,
          JMetadatos: input.metadata,
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

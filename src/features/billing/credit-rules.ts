/**
 * Pure rules of the pay-per-appraisal model: no database, no Stripe. An
 * organization buys packages of credits; one credit is one concluded
 * valuation. The ledger is append-only and the balance is the sum of its
 * movements, so a purchase credited twice or a consumption recorded twice
 * would show up as a wrong balance: both are prevented by unique indexes
 * (migration 040) and checked here before writing.
 */
import { Prisma } from "@prisma/client";
import { priceBreakdown } from "./billing-rules";

/** Keys of the STipo column of MovimientoCreditos. */
export const CREDIT_MOVEMENT_TYPES = { purchase: "COMPRA", consumption: "CONSUMO", adjustment: "AJUSTE" } as const;
export type CreditMovementType = (typeof CREDIT_MOVEMENT_TYPES)[keyof typeof CREDIT_MOVEMENT_TYPES];

const MOVEMENT_LABELS: Record<CreditMovementType, string> = {
  COMPRA: "Compra de paquete",
  CONSUMO: "Avalúo concluido",
  AJUSTE: "Ajuste manual",
};

export const creditMovementLabel = (type: string) => MOVEMENT_LABELS[type as CreditMovementType] ?? type;

/** The sign each movement type must have, as the database also checks. */
export function isValidMovement(type: CreditMovementType, credits: number): boolean {
  if (!Number.isInteger(credits)) return false;
  if (type === "COMPRA") return credits > 0;
  if (type === "CONSUMO") return credits < 0;
  return credits !== 0;
}

export type ConcludeCreditDecision =
  | { action: "consume" }
  | { action: "skip"; reason: "ALREADY_CONSUMED" }
  | { action: "block"; reason: "NO_BALANCE" };

/**
 * What concluding a valuation does to the ledger. A valuation consumes one
 * credit the first time it is concluded; reopening and concluding it again is
 * free. With `enforced` (the organization's BCobroPorAvaluo) a zero or
 * negative balance blocks; without it the consumption is recorded anyway and
 * the balance goes negative, shown as pending payment.
 */
export function concludeCreditDecision(input: { alreadyConsumed: boolean; balance: number; enforced: boolean }): ConcludeCreditDecision {
  if (input.alreadyConsumed) return { action: "skip", reason: "ALREADY_CONSUMED" };
  if (input.enforced && input.balance <= 0) return { action: "block", reason: "NO_BALANCE" };
  return { action: "consume" };
}

/** Stripe ids are derived from our own ids, so nothing is ever searched or listed. */
export const stripePackageProductId = (packagePublicId: string) => `valuaxis_paquete_${packagePublicId.replace(/-/g, "")}`;
export const stripePackageLookupKey = (packagePublicId: string) => `valuaxis_paquete_precio_${packagePublicId.replace(/-/g, "")}`;

type Amount = Prisma.Decimal | string | number;

/**
 * What a package costs: the package total (before tax, tax, charged total)
 * and the price of one credit, before tax, as the owner quotes it ("10 a 140").
 */
export function packagePricing(pkg: { ICreditos: number; NImporte: Amount; NImpuestoPorcentaje: Amount }) {
  const breakdown = priceBreakdown(pkg.NImporte, pkg.NImpuestoPorcentaje);
  const perCredit = new Prisma.Decimal(pkg.NImporte).div(pkg.ICreditos).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  return { ...breakdown, perCredit };
}

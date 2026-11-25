/**
 * Pure rules of the pay-per-appraisal model: no database, no Stripe. An
 * organization buys «Avalúos Disponibles» one by one (the lawyer's commercial
 * policies, 15 Nov 2026) and one is consumed when a valuation is created. The
 * ledger is append-only and the balance is the sum of its movements, so a
 * purchase credited twice or a consumption recorded twice would show up as a
 * wrong balance: both are prevented by unique indexes (migration 040) and
 * checked here before writing.
 */
import { Prisma } from "@prisma/client";
import { priceBreakdown } from "./billing-rules";

/** Keys of the STipo column of MovimientoCreditos. */
export const CREDIT_MOVEMENT_TYPES = { purchase: "COMPRA", consumption: "CONSUMO", adjustment: "AJUSTE" } as const;
export type CreditMovementType = (typeof CREDIT_MOVEMENT_TYPES)[keyof typeof CREDIT_MOVEMENT_TYPES];

const MOVEMENT_LABELS: Record<CreditMovementType, string> = {
  COMPRA: "Compra",
  CONSUMO: "Avalúo concluido",
  AJUSTE: "Ajuste manual",
};

/**
 * What JMetadatos says of a movement beyond its type (the CHECK of migration
 * 040 allows only COMPRA, CONSUMO and AJUSTE): the free trial is an AJUSTE
 * tagged TRIAL_GRANT and its expiry an AJUSTE tagged TRIAL_EXPIRY; a
 * consumption says when it happened (CREATION since the policies, CONCLUSION
 * before) and whether it used a trial or a paid one. Rows written before
 * these tags have none: a consumption without them is a paid one at conclusion.
 */
export const CREDIT_KINDS = { trialGrant: "TRIAL_GRANT", trialExpiry: "TRIAL_EXPIRY" } as const;
export type ConsumptionMoment = "CREATION" | "CONCLUSION";
export type CreditSource = "TRIAL" | "PAID";

type MovementTags = { kind?: unknown; moment?: unknown; source?: unknown };
const tagsOf = (metadata: unknown): MovementTags => (metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as MovementTags) : {});

export function creditMovementLabel(type: string, metadata?: unknown) {
  const tags = tagsOf(metadata);
  if (type === "AJUSTE" && tags.kind === CREDIT_KINDS.trialGrant) return "Prueba gratuita";
  if (type === "AJUSTE" && tags.kind === CREDIT_KINDS.trialExpiry) return "Vencimiento de la prueba";
  if (type === "CONSUMO") {
    const base = tags.moment === "CREATION" ? "Avalúo creado" : "Avalúo concluido";
    return tags.source === "TRIAL" ? `${base} (prueba)` : base;
  }
  return MOVEMENT_LABELS[type as CreditMovementType] ?? type;
}

/**
 * What closing or disabling an account says about its balance (the lawyer's
 * commercial policies, 25 Nov 2026): the ledger is never zeroed, the balance
 * waits without expiry and there are no refunds.
 */
export const ACCOUNT_CLOSURE_BALANCE_NOTICE =
  "El saldo pagado o no usado se conserva sin vencimiento en tu cuenta conforme a las políticas comerciales (sección 3.2). No hay devoluciones; podrás usarlo si reactivas tu cuenta.";

/** At this many credits or fewer, the dashboard card and a notification say it is time to buy more. */
export const LOW_CREDIT_BALANCE = 3;

/** The free trial (policies, section 2): three Avalúos Disponibles for the month after registration. */
export const TRIAL_CREDITS = 3;

/**
 * The same day of the next month at the same time; a day the next month does
 * not have becomes its last (31 Jan → 28 or 29 Feb).
 */
export function addOneMonth(date: Date): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/** What the ledger says of the trial: the grant, what was consumed from it and what was already written off. */
export type TrialLedger = { granted: number; expiresAt: Date; usedFromTrial: number; expiredWritten: number };

export type TrialState = {
  granted: number;
  used: number;
  /** Trial credits that can still be used: zero once expired. */
  available: number;
  expiresAt: Date;
  expired: boolean;
  /** Unused trial credits past their month whose TRIAL_EXPIRY movement is not written yet. */
  pendingExpiry: number;
};

export type CreditSummary = {
  /** What can be consumed, paid plus trial. Negative only when consuming went on without balance (enforcement off). */
  balance: number;
  /** The paid part of the balance (what is owed, when negative): it never expires. */
  paid: number;
  trial: TrialState | null;
};

/**
 * The balance as of `now`. It is the ledger's sum, except that unused trial
 * credits past their month no longer count even before their expiry movement
 * is written (the next ledger write or the ops script writes it): reads never
 * depend on that write having happened.
 */
export function creditSummary(rawBalance: number, trial: TrialLedger | null, now: Date = new Date()): CreditSummary {
  if (!trial) return { balance: rawBalance, paid: rawBalance, trial: null };
  const expired = now.getTime() >= trial.expiresAt.getTime();
  const left = Math.max(0, trial.granted - trial.usedFromTrial - trial.expiredWritten);
  const available = expired ? 0 : left;
  const pendingExpiry = expired ? left : 0;
  const balance = rawBalance - pendingExpiry;
  return {
    balance,
    paid: balance - available,
    trial: { granted: trial.granted, used: trial.usedFromTrial, available, expiresAt: trial.expiresAt, expired, pendingExpiry },
  };
}

/** Trial credits are consumed before paid ones (policies, section 4). */
export const consumptionSource = (summary: CreditSummary): CreditSource => ((summary.trial?.available ?? 0) > 0 ? "TRIAL" : "PAID");

/** The sign each movement type must have, as the database also checks. */
export function isValidMovement(type: CreditMovementType, credits: number): boolean {
  if (!Number.isInteger(credits)) return false;
  if (type === "COMPRA") return credits > 0;
  if (type === "CONSUMO") return credits < 0;
  return credits !== 0;
}

export type CreateCreditDecision = { action: "consume" } | { action: "block"; reason: "NO_BALANCE" };

/**
 * What pressing «Crear avalúo» (or «Duplicar») does to the ledger: it consumes
 * one Avalúo Disponible (policies, section 4). With `enforced` (the
 * organization's BCobroPorAvaluo) a zero or negative balance blocks the
 * creation; without it the consumption is recorded anyway and the balance
 * goes negative, shown as pending payment, as concluding did before.
 */
export function createCreditDecision(input: { balance: number; enforced: boolean }): CreateCreditDecision {
  if (input.enforced && input.balance <= 0) return { action: "block", reason: "NO_BALANCE" };
  return { action: "consume" };
}

export type ConcludeCreditDecision =
  | { action: "consume" }
  | { action: "skip"; reason: "ALREADY_CONSUMED" | "PREVIOUSLY_CONCLUDED" }
  | { action: "block"; reason: "NO_BALANCE" };

/**
 * What concluding does to the ledger, kept for the transition. A valuation
 * created since the policies consumed at creation, so concluding it skips.
 * One created before and never charged consumes on its first conclusion, as
 * it always did (no double charge, no free pass). Reopening and concluding
 * again never consumes, not even for a valuation concluded before the credit
 * ledger existed (`previouslyConcluded`). With `enforced` a zero or negative
 * balance blocks; without it the consumption is recorded and the balance goes
 * negative.
 */
export function concludeCreditDecision(input: { alreadyConsumed: boolean; previouslyConcluded?: boolean; balance: number; enforced: boolean }): ConcludeCreditDecision {
  if (input.alreadyConsumed) return { action: "skip", reason: "ALREADY_CONSUMED" };
  if (input.previouslyConcluded) return { action: "skip", reason: "PREVIOUSLY_CONCLUDED" };
  if (input.enforced && input.balance <= 0) return { action: "block", reason: "NO_BALANCE" };
  return { action: "consume" };
}

/** Stripe ids are derived from our own ids, so nothing is ever searched or listed. */
export const stripePackageProductId = (packagePublicId: string) => `valuaxis_paquete_${packagePublicId.replace(/-/g, "")}`;
export const stripePackageLookupKey = (packagePublicId: string) => `valuaxis_paquete_precio_${packagePublicId.replace(/-/g, "")}`;

type Amount = Prisma.Decimal | string | number;

/**
 * What a package costs: the package total (before tax, tax, charged total)
 * and the price of one credit, before tax.
 */
export function packagePricing(pkg: { ICreditos: number; NImporte: Amount; NImpuestoPorcentaje: Amount }) {
  const breakdown = priceBreakdown(pkg.NImporte, pkg.NImpuestoPorcentaje);
  const perCredit = new Prisma.Decimal(pkg.NImporte).div(pkg.ICreditos).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  return { ...breakdown, perCredit };
}

/** At most this many Avalúos Disponibles in one card payment. */
export const MAX_PURCHASE_QUANTITY = 100;

/**
 * What buying `quantity` Avalúos Disponibles at the unit price costs. Stripe
 * charges the unit total (IVA included) times the quantity, so the total is
 * exactly that; the IVA shown is the total minus the subtotal.
 */
export function purchaseTotals(unit: { subtotal: number; total: number }, quantity: number) {
  const unitTotal = new Prisma.Decimal(unit.total);
  const total = unitTotal.mul(quantity);
  const subtotal = new Prisma.Decimal(unit.subtotal).mul(quantity);
  return { quantity, unitTotal: unitTotal.toNumber(), subtotal: subtotal.toNumber(), tax: total.sub(subtotal).toNumber(), total: total.toNumber() };
}

/**
 * The price before tax, in centavos, whose total with tax rounds to exactly
 * `totalWithTax` (how $170.00 is stored as $146.55 + 16 %); null when no
 * amount in centavos gives it.
 */
export function preTaxAmountFor(totalWithTax: Amount, taxPercent: Amount): string | null {
  const wanted = new Prisma.Decimal(totalWithTax).toDecimalPlaces(2);
  const factor = new Prisma.Decimal(taxPercent).div(100).add(1);
  const guess = wanted.div(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  for (const delta of [0, -0.01, 0.01, -0.02, 0.02]) {
    const candidate = guess.add(delta);
    if (candidate.gte(0) && candidate.mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).equals(wanted)) return candidate.toFixed(2);
  }
  return null;
}

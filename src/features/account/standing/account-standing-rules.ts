/**
 * Closing and suspending an account, and keeping the concluded valuations
 * (the lawyer's documents of 15 Nov 2026: Terms 14.1–14.3, commercial
 * policies 3.2, license 17.10, privacy notice 7.3 and 8.3; docs/CUENTAS.md).
 * Pure rules, so each term is named once and tested without a database.
 *
 * A closure (BAJA) ends the access to the account; a suspension (INACTIVIDAD
 * or OTRA) only stops making and concluding valuations: the person still
 * signs in to consult and download the concluded ones. None of them touches
 * the balance, and none deletes data.
 */

export const ACCOUNT_RESTRICTION_KINDS = {
  closure: "BAJA",
  inactivity: "INACTIVIDAD",
  other: "OTRA",
} as const;

export type AccountRestrictionKind = (typeof ACCOUNT_RESTRICTION_KINDS)[keyof typeof ACCOUNT_RESTRICTION_KINDS];

/** The causes of Terms 14.1 other than inactivity (points 2 to 5), as the operator picks them. */
export const SUSPENSION_CAUSES = {
  SUPLANTACION:
    "Suplantación de identidad: alguien usa la cuenta haciéndose pasar por su titular, o la cuenta se creó con la identidad de otra persona",
  PRESTAMO: "Préstamo de la cuenta a otra persona",
  USO_ILICITO: "Uso ilícito de la plataforma o incumplimiento grave de las obligaciones del usuario",
  CONTRACARGO: "Cancelación o contracargo de un pago ya cobrado",
} as const;

export type SuspensionCause = keyof typeof SUSPENSION_CAUSES;

/** The same causes in a few words, for the operator's list. */
export const SUSPENSION_CAUSE_LABELS: Record<SuspensionCause, string> = {
  SUPLANTACION: "Suplantación de identidad",
  PRESTAMO: "Préstamo de la cuenta",
  USO_ILICITO: "Uso ilícito o incumplimiento grave",
  CONTRACARGO: "Cancelación o contracargo de un pago",
};

export const isSuspensionCause = (value: unknown): value is SuspensionCause =>
  typeof value === "string" && Object.hasOwn(SUSPENSION_CAUSES, value);

/** Only an identity check may close the door entirely, and only while it lasts (Terms 14.1, last paragraph). */
export const causeMayBlockAccess = (cause: SuspensionCause) => cause === "SUPLANTACION";

/** Why it ended. */
export type AccountRestrictionEnd = "REACTIVACION" | "ACLARADA" | "ACTIVIDAD";

/** Three months without generating a valuation (Terms 14.1, point 1). */
export const INACTIVITY_MONTHS = 3;
/**
 * Days between the inactivity email and disabling the account. The Terms only
 * say the account «puede» be disabled after the email; the client asked for
 * thirty days on 26 Nov 2026 (it was fifteen), the lawyer updates the Terms.
 */
export const INACTIVITY_DISABLE_AFTER_NOTICE_DAYS = 30;
/** Business days to clarify the cause of a suspension (Terms 14.1). */
export const CLARIFICATION_BUSINESS_DAYS = 5;
/**
 * Years the data of a closed account stay blocked before they would be
 * suppressed: the prescription of the actions of the relationship (privacy
 * notice 7.3 and 8.3, point 1). The notice does not name the term; ten years
 * is the one it uses for the payment records (8.3, point 2). To confirm with
 * the lawyer. Nothing deletes the account's data on its own: this date is a
 * scheduled state the operator reads.
 */
export const ACCOUNT_DATA_BLOCKING_YEARS = 10;

/**
 * A concluded valuation is never deleted; twelve months after its conclusion
 * only the stored copies of its exports go (client, 26 Nov 2026; the lawyer
 * updates Terms 14.3 and has to confirm it).
 */
const RETENTION_MAX_MONTHS = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Calendar months, keeping the day when it exists (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export const addYears = (date: Date, years: number) => addMonths(date, years * 12);

/** Mexico City has kept UTC−6 all year since 2022. */
const MEXICO_OFFSET_MS = -6 * 60 * 60 * 1000;

/** The calendar day in Mexico City of an instant, as a UTC midnight. */
function mexicoDay(date: Date) {
  const local = new Date(date.getTime() + MEXICO_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function nthMonday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const offset = (8 - first) % 7;
  return 1 + offset + (n - 1) * 7;
}

/**
 * The fixed days of rest of the Ley Federal del Trabajo, article 74. Election
 * days are also of rest but are not known in advance: an operator who counts
 * across one adds it by hand.
 */
export function isMexicanHoliday(day: Date) {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const date = day.getUTCDate();
  if (month === 0 && date === 1) return true;
  if (month === 1 && date === nthMonday(year, 1, 1)) return true;
  if (month === 2 && date === nthMonday(year, 2, 3)) return true;
  if (month === 4 && date === 1) return true;
  if (month === 8 && date === 16) return true;
  // The change of the federal executive, every six years (2024, 2030…).
  if (month === 9 && date === 1 && (year - 2024) % 6 === 0) return true;
  if (month === 10 && date === nthMonday(year, 10, 3)) return true;
  if (month === 11 && date === 25) return true;
  return false;
}

/** A Día hábil of the Terms: Monday to Friday, except the days of rest of LFT article 74. */
export function isBusinessDay(day: Date) {
  const weekday = day.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isMexicanHoliday(day);
}

/**
 * The end (23:59:59.999 in Mexico City) of the n-th business day after the
 * day of `from`: the day of the notice does not count.
 */
export function businessDaysDeadline(from: Date, days: number) {
  let day = mexicoDay(from);
  let counted = 0;
  while (counted < days) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) counted += 1;
  }
  return new Date(day.getTime() + DAY_MS - 1 - MEXICO_OFFSET_MS);
}

/** What a restriction row says, whatever its storage. */
export type AccountRestriction = {
  kind: AccountRestrictionKind;
  startedAt: Date | null;
  endedAt: Date | null;
  blocksAccess: boolean;
};

export const restrictionInEffect = (restriction: AccountRestriction, now = new Date()) =>
  Boolean(restriction.startedAt && restriction.startedAt.getTime() <= now.getTime() && !restriction.endedAt);

export type AccountStanding = {
  /** The person may sign in at all. */
  access: boolean;
  /** The person may create, duplicate and conclude valuations. */
  canProduce: boolean;
  /** The restriction in effect that decides it, the strictest first. */
  restriction: AccountRestrictionKind | null;
};

/** The account's standing from its restriction rows: a closure or an access block first, then any suspension. */
export function accountStanding(restrictions: readonly AccountRestriction[], now = new Date()): AccountStanding {
  const inEffect = restrictions.filter((restriction) => restrictionInEffect(restriction, now));
  if (!inEffect.length) return { access: true, canProduce: true, restriction: null };
  const blocking = inEffect.find((restriction) => restriction.kind === ACCOUNT_RESTRICTION_KINDS.closure || restriction.blocksAccess);
  if (blocking) return { access: false, canProduce: false, restriction: blocking.kind };
  const kind = inEffect.some((restriction) => restriction.kind === ACCOUNT_RESTRICTION_KINDS.other)
    ? ACCOUNT_RESTRICTION_KINDS.other
    : ACCOUNT_RESTRICTION_KINDS.inactivity;
  return { access: true, canProduce: false, restriction: kind };
}

/** What creating or concluding answers while the account is suspended. */
export const ACCOUNT_SUSPENDED_CODE = "ACCOUNT_SUSPENDED";

export function suspendedMessage(kind: AccountRestrictionKind | null) {
  if (kind === ACCOUNT_RESTRICTION_KINDS.inactivity) {
    return "Tu cuenta está inhabilitada temporalmente por inactividad: puedes consultar y descargar tus avalúos concluidos, pero no elaborar ni concluir avalúos. Pide la reactivación por correo; tu saldo se conserva.";
  }
  return "Tu cuenta está suspendida: puedes consultar y descargar tus avalúos concluidos, pero no elaborar ni concluir avalúos mientras dure la suspensión. Tu saldo se conserva.";
}

/** The last day the person generated something: the newest valuation they created, their sign-up or their last reactivation. */
export function lastActivity(input: { accountCreatedAt: Date; lastValuationCreatedAt: Date | null; lastReactivatedAt: Date | null }) {
  return [input.accountCreatedAt, input.lastValuationCreatedAt, input.lastReactivatedAt]
    .filter((date): date is Date => date instanceof Date)
    .reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
}

export const inactivityDue = (activity: Date, now = new Date()) => addMonths(activity, INACTIVITY_MONTHS).getTime() <= now.getTime();

export const inactivityDisableDue = (noticedAt: Date, now = new Date()) =>
  addDays(noticedAt, INACTIVITY_DISABLE_AFTER_NOTICE_DAYS).getTime() <= now.getTime();

/**
 * When the stored copies of a concluded valuation's exports (the PDFs kept at
 * each download) may go: twelve months after its conclusion, whatever its
 * validity. The valuation itself is never deleted (client, 26 Nov 2026).
 */
export const exportCopiesExpiry = (concludedAt: Date) => addMonths(concludedAt, RETENTION_MAX_MONTHS);

export const exportCopiesDue = (concludedAt: Date, now = new Date()) => exportCopiesExpiry(concludedAt).getTime() <= now.getTime();

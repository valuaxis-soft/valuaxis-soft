/**
 * The firm's checklist of the comparable review (Despacho → Revisión de
 * comparables): which points the appraiser checks against each listing, in
 * which order, under which name, which are required, and the thresholds of
 * the warnings (the built area against the subject's and the months a
 * comparable stays valid).
 *
 * A firm that never changed it reviews with the built-in list
 * (REVIEW_CHECKS) and ±20 %. Required points only warn: the appraiser's
 * judgement rules, nothing here blocks saving a review or concluding.
 *
 * Pure: no side effects, no rendering.
 */
import { z } from "zod";

import {
  BUILT_AREA_TOLERANCE, DEFAULT_REVIEW_STATUS_LIST, REVIEW_CHECKS, REVIEW_CHECK_HINTS, REVIEW_CHECK_LABELS, REVIEW_STATUSES, REVIEW_TONES,
  type ReviewChecks, type ReviewStatusItem,
} from "./comparable-review";
import { isLandComparableType, type ComparableType } from "./market-types";

export type ReviewChecklistItem = {
  /** A built-in key (REVIEW_CHECKS) or one the firm added ("custom-…"); it never changes, so saved reviews keep reading. */
  key: string;
  label: string;
  required: boolean;
  /** A note shown beside the name in the review, when the name alone is ambiguous. */
  hint: string | null;
};

export type ComparableReviewChecklist = {
  checks: ReviewChecklistItem[];
  /** ±N % of the subject's built area before a building comparable is flagged; 20 by default. */
  builtAreaTolerancePercent: number;
};

export const MAX_REVIEW_CHECKS = 30;
export const DEFAULT_BUILT_AREA_TOLERANCE_PERCENT = Math.round(BUILT_AREA_TOLERANCE * 100);

/** The built-in list, as every firm reviewed before it could change it. */
export const DEFAULT_REVIEW_CHECKLIST: ComparableReviewChecklist = {
  checks: REVIEW_CHECKS.map((key) => ({ key, label: REVIEW_CHECK_LABELS[key], required: false, hint: REVIEW_CHECK_HINTS[key] ?? null })),
  builtAreaTolerancePercent: DEFAULT_BUILT_AREA_TOLERANCE_PERCENT,
};

/** What a built-in point does besides being checked, said in Despacho next to it. */
export const BUILT_IN_CHECK_NOTES: Partial<Record<string, string>> = {
  link: "Desmarcarlo pone «Verificado y no vigente».",
  builtArea: "No aparece en los comparables de terreno.",
};

export const isBuiltInCheck = (key: string) => (REVIEW_CHECKS as readonly string[]).includes(key);

export const reviewCheckKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/, "Clave de verificación inválida.");

const itemSchema = z.object({
  key: reviewCheckKeySchema,
  label: z.string().trim().min(1, "Cada punto de verificación necesita un nombre.").max(120, "El nombre admite hasta 120 caracteres."),
  required: z.boolean().default(false),
  hint: z.string().trim().max(200).nullish().transform((value) => value || null),
});

export const comparableReviewChecklistSchema = z.object({
  checks: z.array(itemSchema)
    .min(1, "La lista necesita al menos un punto de verificación.")
    .max(MAX_REVIEW_CHECKS, `La lista admite hasta ${MAX_REVIEW_CHECKS} puntos.`)
    .refine((checks) => new Set(checks.map((check) => check.key)).size === checks.length, "Hay puntos de verificación repetidos.")
    .refine(
      (checks) => new Set(checks.map((check) => plainLabel(check.label))).size === checks.length,
      "Hay dos puntos de verificación con el mismo nombre.",
    ),
  builtAreaTolerancePercent: z.number("Escribe el porcentaje de superficie construida.").int("El porcentaje va sin decimales.")
    .min(1, "El porcentaje de superficie va de 1 a 100.").max(100, "El porcentaje de superficie va de 1 a 100."),
});

function plainLabel(label: string) {
  return label.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The firm's stored checklist, or the built-in one when it has none or it is unreadable. */
export function resolveReviewChecklist(stored: unknown): ComparableReviewChecklist {
  const parsed = comparableReviewChecklistSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_REVIEW_CHECKLIST;
}

/** The points shown for a comparable: the built area is not one of a land comparable. */
export function checklistFor(checklist: Pick<ComparableReviewChecklist, "checks">, type: ComparableType): ReviewChecklistItem[] {
  return checklist.checks.filter((check) => check.key !== "builtArea" || !isLandComparableType(type));
}

/** The required points of `items` not marked yet: a warning, never a block. */
export function missingRequiredChecks(items: readonly ReviewChecklistItem[], checks: ReviewChecks): ReviewChecklistItem[] {
  return items.filter((item) => item.required && checks[item.key] !== true);
}

/** The tolerance of the warning, as a fraction (0.2 = ±20 %). */
export const builtAreaToleranceOf = (checklist: Pick<ComparableReviewChecklist, "builtAreaTolerancePercent">) =>
  checklist.builtAreaTolerancePercent / 100;

/** The name a saved check is shown with: the one it had when saved, the firm's, the built-in one or its key. */
export function reviewCheckLabel(key: string, saved?: Record<string, string>, checklist?: Pick<ComparableReviewChecklist, "checks">) {
  return saved?.[key]
    ?? checklist?.checks.find((check) => check.key === key)?.label
    ?? (isBuiltInCheck(key) ? REVIEW_CHECK_LABELS[key as keyof typeof REVIEW_CHECK_LABELS] : key);
}

/** The names of the checks of a review being saved, to keep with it. */
export function labelsForReview(checks: ReviewChecks, checklist: Pick<ComparableReviewChecklist, "checks">): Record<string, string> {
  return Object.fromEntries(Object.keys(checks).map((key) => [key, reviewCheckLabel(key, undefined, checklist)]));
}

/** A key for a point the firm adds, unique in its list. */
export function newCheckKey(existing: readonly string[], random = () => Math.random().toString(36).slice(2, 8)) {
  let key = `custom-${random()}`;
  while (existing.includes(key)) key = `custom-${random()}`;
  return key;
}

/** The list after moving the point at `index` by `delta` places; out of bounds, the same list. */
export function moveCheck<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/* ------------------------------------------------------------------ */
/*  The states of the review (V8.12)                                   */
/* ------------------------------------------------------------------ */

export const MAX_REVIEW_STATUSES = 20;

/** The key of a state the firm adds: never one of Valuaxis, never repeated. */
export const reviewStatusKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/, "Estado de revisión inválido.");

/**
 * The firm's states (V8.12, 04:49): it adds, renames and deletes them. «Sin
 * revisar» stays, first: it is the state of a comparable nobody reviewed yet.
 * Deleting a state changes no comparable: each one keeps the state it has
 * until the appraiser gives it another.
 */
export const reviewStatusListSchema = z.object({
  statuses: z.array(z.object({
    key: reviewStatusKeySchema,
    label: z.string().trim().min(1, "Cada estado necesita un nombre.").max(60, "El nombre de un estado admite hasta 60 caracteres."),
    tone: z.enum(REVIEW_TONES, "Elige el color del estado."),
  }))
    .min(1, "La lista necesita al menos un estado.")
    .max(MAX_REVIEW_STATUSES, `La lista admite hasta ${MAX_REVIEW_STATUSES} estados.`)
    .refine((items) => items[0]?.key === "POR_REVISAR", "«Sin revisar» va primero y no se quita: es el estado de un comparable que nadie ha revisado.")
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, "Hay estados repetidos.")
    .refine((items) => new Set(items.map((item) => plainLabel(item.label))).size === items.length, "Hay dos estados con el mismo nombre."),
});
export type ReviewStatusList = z.infer<typeof reviewStatusListSchema>;

/** The firm's stored states, or the built-in five. */
export function resolveReviewStatuses(stored: unknown): ReviewStatusItem[] {
  const parsed = reviewStatusListSchema.safeParse(stored);
  return parsed.success ? parsed.data.statuses : DEFAULT_REVIEW_STATUS_LIST;
}

/** A key for a state the firm adds, unique in its list and never one of Valuaxis. */
export function newStatusKey(existing: readonly string[], random = () => Math.random().toString(36).slice(2, 8)) {
  let key = `custom-${random()}`;
  while (existing.includes(key) || (REVIEW_STATUSES as readonly string[]).includes(key)) key = `custom-${random()}`;
  return key;
}

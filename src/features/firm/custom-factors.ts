/**
 * The homologation factors a firm created in the market approach ("Vista",
 * "Acceso"…), kept per organization and offered in the list of factors again.
 * Each one is a factor of type OTRO with its own key, so several of them can
 * go in one homologation.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { z } from "zod";

/** As long as a factor's label may be. */
export const MAX_CUSTOM_FACTOR_LENGTH = 40;
/** More than anyone needs; keeps the list readable. */
export const MAX_CUSTOM_FACTORS = 50;

export type CustomFactor = { key: string; label: string };

/** A name as it is kept: trimmed, with single spaces. */
const normalizeLabel = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_FACTOR_LENGTH);

/** Names compare without case or accents: "Vista" and "vista" are one factor. */
const slug = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

/** The key of a factor named `label`: the same for every way of writing it. */
export const customFactorKey = (label: string) => `custom:${slug(normalizeLabel(label)) || "factor"}`;

export const customFactorSchema = z.object({
  label: z.string().transform(normalizeLabel).pipe(z.string().min(1, "Escribe el nombre del factor.")),
});

/** The stored list read back; anything that is not a list of factors is no list. */
export function resolveCustomFactors(stored: unknown): CustomFactor[] {
  if (!Array.isArray(stored)) return [];
  const factors: CustomFactor[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    if (!item || typeof item !== "object" || typeof (item as CustomFactor).label !== "string") continue;
    const label = normalizeLabel((item as CustomFactor).label);
    const key = customFactorKey(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    factors.push({ key, label });
    if (factors.length === MAX_CUSTOM_FACTORS) break;
  }
  return factors;
}

/**
 * The list with a factor named `label` at the end, and that factor; the same
 * list when it is already there (however it was written). When the list is
 * full, the oldest makes room.
 */
export function addCustomFactorTo(factors: CustomFactor[], label: string): { factors: CustomFactor[]; factor: CustomFactor | null; added: boolean } {
  const normalized = normalizeLabel(label);
  if (!normalized) return { factors, factor: null, added: false };
  const key = customFactorKey(normalized);
  const existing = factors.find((item) => item.key === key);
  if (existing) return { factors, factor: existing, added: false };
  const factor = { key, label: normalized };
  const next = [...factors, factor];
  return { factors: next.length > MAX_CUSTOM_FACTORS ? next.slice(next.length - MAX_CUSTOM_FACTORS) : next, factor, added: true };
}

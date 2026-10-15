/**
 * The units a firm typed in "Formato del valor" and confirmed (piezas, lotes,
 * cabezas…), kept per organization and offered in the list of units again.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { z } from "zod";

/** As long as the unit input of a concept allows. */
export const MAX_CUSTOM_UNIT_LENGTH = 18;
/** More than anyone needs; keeps the list readable. */
export const MAX_CUSTOM_UNITS = 50;

/** A unit as it is kept: trimmed, with single spaces, or empty when there is nothing to keep. */
export const normalizeCustomUnit = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_UNIT_LENGTH);

/** Units compare without case or accents: "Piezas" and "piezas" are one. */
const unitKey = (unit: string) => unit.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const customUnitSchema = z.object({
  unit: z.string().transform(normalizeCustomUnit).pipe(z.string().min(1, "Escribe la unidad.")),
});

/** The stored list read back; anything that is not a list of short texts is no list. */
export function resolveCustomUnits(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  const units: string[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    if (typeof item !== "string") continue;
    const unit = normalizeCustomUnit(item);
    if (!unit || seen.has(unitKey(unit))) continue;
    seen.add(unitKey(unit));
    units.push(unit);
    if (units.length === MAX_CUSTOM_UNITS) break;
  }
  return units;
}

/**
 * The list with `unit` added at the end, or the same list when it is already
 * there (however it was written). When the list is full, the oldest unit
 * makes room.
 */
export function addCustomUnitTo(units: string[], unit: string): { units: string[]; added: boolean } {
  const normalized = normalizeCustomUnit(unit);
  if (!normalized || units.some((item) => unitKey(item) === unitKey(normalized))) return { units, added: false };
  const next = [...units, normalized];
  return { units: next.length > MAX_CUSTOM_UNITS ? next.slice(next.length - MAX_CUSTOM_UNITS) : next, added: true };
}

/** Whether a unit is one of the built-in symbols or the firm's own; what the list shows as itself. */
export function findCustomUnit(units: readonly string[], unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const key = unitKey(normalizeCustomUnit(unit));
  return key ? units.find((item) => unitKey(item) === key) : undefined;
}

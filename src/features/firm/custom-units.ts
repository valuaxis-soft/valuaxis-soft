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

const unitField = z.string().transform(normalizeCustomUnit).pipe(z.string().min(1, "Escribe la unidad."));

export const customUnitSchema = z.object({ unit: unitField });

/** Renaming a unit of the firm: the one kept and its new name. */
export const customUnitRenameSchema = z.object({ unit: unitField, nextUnit: unitField });

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

/**
 * The list with `unit` written as `nextUnit` in its place, or the same list
 * when the unit is not there, the new name is empty or another unit already
 * has it. Renaming only the case or the accents of a unit is a rename too.
 */
export function renameCustomUnitIn(units: string[], unit: string, nextUnit: string): { units: string[]; renamed: boolean } {
  const normalized = normalizeCustomUnit(nextUnit);
  const index = units.findIndex((item) => unitKey(item) === unitKey(normalizeCustomUnit(unit)));
  if (index < 0 || !normalized || normalized === units[index]) return { units, renamed: false };
  const taken = units.some((item, position) => position !== index && unitKey(item) === unitKey(normalized));
  if (taken) return { units, renamed: false };
  return { units: units.map((item, position) => (position === index ? normalized : item)), renamed: true };
}

/** The list without `unit` (however it was written), or the same list when it was not there. */
export function removeCustomUnitFrom(units: string[], unit: string): { units: string[]; removed: boolean } {
  const key = unitKey(normalizeCustomUnit(unit));
  const next = key ? units.filter((item) => unitKey(item) !== key) : units;
  return next.length === units.length ? { units, removed: false } : { units: next, removed: true };
}

/** Whether a unit is one of the built-in symbols or the firm's own; what the list shows as itself. */
export function findCustomUnit(units: readonly string[], unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const key = unitKey(normalizeCustomUnit(unit));
  return key ? units.find((item) => unitKey(item) === key) : undefined;
}

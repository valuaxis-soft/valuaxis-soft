import type { SurfaceOrientation } from "./config";

/**
 * A homologation or demerit factor as the appraiser captures it: a number, or
 * the two ratings it comes from (subject over comparable), which is how the
 * Excel books write them (`=1/1.15`).
 */
export type CapturedFactor = {
  key: string;
  label: string;
  value?: number;
  subjectRating?: number;
  comparableRating?: number;
  justification?: string;
};

/** Where the computed surface factor goes in the product. */
export type SurfaceSlot = { key: "superficie"; surface: true };

export type FactorSlot = CapturedFactor | SurfaceSlot;

export const SURFACE_SLOT: SurfaceSlot = { key: "superficie", surface: true };

export function isSurfaceSlot(slot: FactorSlot): slot is SurfaceSlot {
  return "surface" in slot;
}

export function capturedFactorValue(factor: CapturedFactor): number {
  if (factor.value !== undefined) return factor.value;
  if (factor.subjectRating !== undefined && factor.comparableRating !== undefined) {
    return factor.subjectRating / factor.comparableRating;
  }
  throw new Error(`El factor "${factor.label}" no tiene valor ni calificaciones.`);
}

/**
 * Factor that brings the unit value of a reference (comparable or lote tipo)
 * to the subject: (S_reference / S_subject)^(1/n). A larger lot is worth less
 * per square metre, so a reference larger than the subject gets a factor above
 * one. `subject-over-reference` reproduces the books that invert it.
 */
export function surfaceFactor(
  referenceArea: number,
  subjectArea: number,
  power: number,
  orientation: SurfaceOrientation,
): number {
  const ratio = orientation === "reference-over-subject" ? referenceArea / subjectArea : subjectArea / referenceArea;
  return ratio ** (1 / power);
}

/** Age demerit: 1 − (age / useful life)^exponent, optionally floored. */
export function ageFactor(age: number, usefulLife: number, exponent: number, floor: number | null): number {
  const factor = 1 - (age / usefulLife) ** exponent;
  return floor === null ? factor : Math.max(factor, floor);
}

/** Product in capture order: Excel multiplies left to right, and so must we to match it. */
export function productInOrder(values: number[]): number {
  return values.reduce((product, value) => product * value, 1);
}

/** Resolves the factor slots, placing the surface factor where the capture puts it. */
export function resolveFactorSlots(slots: FactorSlot[], surface: number): { key: string; label: string; value: number }[] {
  return slots.map((slot) =>
    isSurfaceSlot(slot)
      ? { key: slot.key, label: "Superficie", value: surface }
      : { key: slot.key, label: slot.label, value: capturedFactorValue(slot) },
  );
}

/**
 * The precision of the calculations of a valuation: how many decimals its
 * factors show (2 or 4), and whether it calculates with what it shows, as
 * Excel's "precision as displayed". Without it a factor shown 0.97 is
 * multiplied as 0.9683 and the printed figures do not multiply to the printed
 * result; with it, they do. One choice for the whole valuation, kept on each
 * version (VersionAvaluo.JConfiguracionCalculo) and copied when it reopens.
 * Pure, shared by the browser and the server.
 */
import { z } from "zod";

import type { EngineConfig } from "../engine/config";

export const DISPLAY_DECIMALS = [2, 4] as const;
export type DisplayDecimals = (typeof DISPLAY_DECIMALS)[number];

export type CalculationPrecision = {
  /** Decimals homologation and demerit factors are shown with. */
  decimals: DisplayDecimals;
  /** "Calcular con la precisión mostrada": factors rounded to `decimals`, unit values to cents, before they are used. */
  calculateWithShown: boolean;
};

/** Valuations of before the choice: two decimals shown, calculated with all of them; their values do not change. */
export const LEGACY_PRECISION: CalculationPrecision = { decimals: 2, calculateWithShown: false };

/** A new valuation: two decimals, and the printed figures multiply to the printed result. */
export const NEW_VALUATION_PRECISION: CalculationPrecision = { decimals: 2, calculateWithShown: true };

export const calculationPrecisionSchema = z.object({
  decimals: z.union([z.literal(2), z.literal(4)], "Los decimales son 2 o 4."),
  calculateWithShown: z.boolean(),
});

/** The precision a version keeps; the behavior of before when it keeps none or something unreadable. */
export function precisionOf(stored: unknown): CalculationPrecision {
  const parsed = calculationPrecisionSchema.safeParse(stored);
  return parsed.success ? parsed.data : LEGACY_PRECISION;
}

/** The engine settings with the valuation's precision: factors rounded as shown only when it calculates with them. */
export function withPrecision(config: EngineConfig, precision: CalculationPrecision | null | undefined): EngineConfig {
  const chosen = precision ?? LEGACY_PRECISION;
  return { ...config, displayedPrecision: chosen.calculateWithShown ? { factors: chosen.decimals } : null };
}

/** The decimals a factor is shown with. */
export const factorDecimals = (precision: CalculationPrecision | null | undefined) => (precision ?? LEGACY_PRECISION).decimals;

/** Shown beside the choice, so the appraiser knows what each one does. */
export const PRECISION_NOTE =
  "Con «calcular con la precisión mostrada» cada factor se redondea a los decimales que ves antes de multiplicarse, y lo impreso cuadra "
  + "(14,361.99 × 0.97 = 13,931.13). Sin ella se calcula con todos los decimales, como Excel por omisión: el factor se ve 0.97 pero se "
  + "multiplica por 0.9683 (13,906.44).";

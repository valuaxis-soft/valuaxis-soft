/**
 * Income approach data as the editor and the API exchange it, and its
 * conversion to the engine input. The rent comes from the rent market
 * (comparables of type INMUEBLE_RENTA), the rate from the books' rate table
 * or the appraiser's own.
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, type IncomeApproachInput } from "../engine/income";

/** What each column of the rate table means for each criterion (docs/fase0/metodologia/03-rentas-ingresos.md, 2.b). */
export const RATE_TABLE_OPTIONS: Record<(typeof RATE_TABLE_CRITERIA)[number], readonly string[]> = {
  "Edad": ["0 a 5 años", "5 a 20", "20 a 40", "40 a 50", "50 a 60", "Más de 60"],
  "Vida útil remanente": ["Más de 60 años", "50 a 60", "40 a 50", "20 a 40", "5 a 20", "Terminada"],
  "Estado de conservación": ["Nueva", "Muy bueno", "Bueno", "Regular", "Malo", "Ruinoso"],
  "Proyecto": ["Muy bueno", "Bueno", "Adecuado", "Regular", "Deficiente", "Malo"],
  "Relación terreno / construcción": [
    "Construcción mayor, más de 3 a 1", "Construcción mayor, hasta 3 a 1", "Construcción mayor, hasta 2 a 1",
    "1 a 1", "Terreno mayor, hasta 3 a 1", "Terreno mayor, más de 3 a 1",
  ],
  "Uso del inmueble": [
    "Casa unifamiliar", "Edificio de productos habitacional y comercial", "Departamento o casa en condominio",
    "Oficina o local en condominio", "Oficina o local unifamiliar", "Bodega o industria",
  ],
  "Clasificación de zona": ["Lujo", "Primer orden", "Segundo orden", "Tercer orden", "Proletaria con servicios completos", "Proletaria con servicios incompletos"],
};

/** Deductions of the TCH book with their default rates. */
export const DEFAULT_DEDUCTIONS: IncomeDeductionDto[] = [
  ["Vacíos", 0.1], ["Impuesto predial", 0.04], ["ISR", 0.04], ["Mantenimiento", 0.06], ["Administración", 0.03],
  ["Seguros", 0.03], ["Energía eléctrica", 0.01], ["Agua", 0], ["Depreciación fiscal", 0],
].map(([concept, rate]) => ({ concept: concept as string, rate: rate as number }));

export type RentableUnitDto = { description: string; area: number | null; unitRent: number | null };
export type IncomeDeductionDto = { concept: string; rate: number | null };

export type IncomeInputDto = {
  rentableUnits: RentableUnitDto[];
  deductions: IncomeDeductionDto[];
  /** Column chosen for each criterion of the rate table, or null while not chosen. */
  ratingColumns: (number | null)[];
  /** The rate the appraiser applies; the rate from the table when empty. */
  appliedRate: number | null;
};

export type IncomeCalculationDto = IncomeInputDto & {
  /** Rent market: the adopted rent ($/m²/month) and the subject's rentable area. */
  rentMarket: { adoptedUnitRent: number | null; subjectArea: number | null };
  configured: boolean;
  locked: boolean;
};

export const DEFAULT_INCOME: IncomeInputDto = {
  rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: RATE_TABLE_CRITERIA.map(() => null),
  appliedRate: null,
};

export function toIncomeEngineInput(calculation: Pick<IncomeCalculationDto, "rentableUnits" | "deductions" | "ratingColumns" | "appliedRate" | "rentMarket">):
  | { ok: true; input: IncomeApproachInput }
  | { ok: false; reason: string } {
  const adopted = calculation.rentMarket.adoptedUnitRent;
  const units = calculation.rentableUnits
    .map((unit) => ({ ...unit, area: unit.area ?? (calculation.rentableUnits.length === 1 ? calculation.rentMarket.subjectArea : null) }))
    .filter((unit) => (unit.area ?? 0) > 0);
  if (!units.length) return { ok: false, reason: "Captura la superficie rentable." };
  if (units.some((unit) => unit.unitRent === null) && !(adopted && adopted > 0)) {
    return { ok: false, reason: "Captura la renta unitaria, o el mercado de rentas." };
  }
  const tableComplete = calculation.ratingColumns.length === RATE_TABLE_CRITERIA.length
    && calculation.ratingColumns.every((column) => column !== null);
  if (!calculation.appliedRate && !tableComplete) {
    return { ok: false, reason: "Califica los siete criterios de la tabla de tasa, o captura la tasa." };
  }
  return {
    ok: true,
    input: {
      ...(adopted ? { adoptedUnitRent: adopted } : {}),
      rentableUnits: units.map((unit) => ({
        description: unit.description || "Superficie rentable",
        area: unit.area as number,
        ...(unit.unitRent !== null ? { unitRent: unit.unitRent } : {}),
      })),
      deductions: calculation.deductions.map((deduction) => ({ concept: deduction.concept, rate: deduction.rate ?? 0 })),
      capitalization: {
        ...(tableComplete ? { ratingColumns: calculation.ratingColumns as number[], rates: RATE_TABLE_RATES } : {}),
        ...(calculation.appliedRate ? { appliedRate: calculation.appliedRate } : {}),
      },
    },
  };
}

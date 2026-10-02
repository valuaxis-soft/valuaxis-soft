/**
 * Income approach data as the editor and the API exchange it, and its
 * conversion to the engine input. The rent comes from the rent market
 * (comparables of type INMUEBLE_RENTA). Three methods, as the firm's books:
 * the rate table (TCH), the annuity (TU) and the market rate (TR).
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, type IncomeApproachInput, type IncomeMethod } from "../engine/income";
import type { HomologationInput } from "../engine/market";

export const INCOME_METHOD_LABELS: Record<IncomeMethod, string> = {
  tabla: "Tabla de tasa (formato TCH)",
  anualidad: "Anualidad con TIIE (formato TU)",
  mercado: "Tasa de mercado venta / renta (formato TR)",
};

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

/** TU: operating deductions, without vacancy, which goes by days. */
export const ANNUITY_DEDUCTIONS: IncomeDeductionDto[] = [
  ["Impuesto predial", 0.04], ["ISR", 0.04], ["Mantenimiento", 0.05], ["Administración", 0.03],
  ["Seguros", 0.03], ["Energía eléctrica", 0.01], ["Depreciación fiscal", 0], ["Otros", 0],
].map(([concept, rate]) => ({ concept: concept as string, rate: rate as number }));

/** TR: operating expenses; vacancy and negotiation go apart. */
export const MARKET_RATE_EXPENSES: IncomeDeductionDto[] = [
  ["Impuesto predial", 0.05], ["Conservación y mantenimiento", 0.03], ["Servicios", 0.03], ["Seguros", 0.01], ["Otros", 0],
].map(([concept, rate]) => ({ concept: concept as string, rate: rate as number }));

export const DEDUCTIONS_BY_METHOD: Record<IncomeMethod, IncomeDeductionDto[]> = {
  tabla: [],
  anualidad: ANNUITY_DEDUCTIONS,
  mercado: MARKET_RATE_EXPENSES,
};

export type AnnuityDto = {
  vacancyDays: number | null;
  contractYears: number | null;
  otherMonthlyIncome: number | null;
  tiie: number | null;
  inflation: number | null;
  remainingLifeYears: number | null;
  /** 1: the printed rate; 2: the annuity the books conclude with (question 2). */
  option: 1 | 2;
};

export type MarketRateDto = {
  negotiation: number | null;
  vacancy: number | null;
  /** Sale price of each rent comparable, by its reference. */
  salePrices: Record<string, number | null>;
};

export const DEFAULT_ANNUITY: AnnuityDto = {
  vacancyDays: 60, contractYears: 2, otherMonthlyIncome: 0, tiie: null, inflation: null, remainingLifeYears: null, option: 1,
};
export const DEFAULT_MARKET_RATE: MarketRateDto = { negotiation: 0, vacancy: 0.03, salePrices: {} };

export type RentableUnitDto = { description: string; area: number | null; unitRent: number | null };
export type IncomeDeductionDto = { concept: string; rate: number | null };

export type IncomeInputDto = {
  method: IncomeMethod;
  annuity: AnnuityDto;
  marketRate: MarketRateDto;
  rentableUnits: RentableUnitDto[];
  deductions: IncomeDeductionDto[];
  /** Column chosen for each criterion of the rate table, or null while not chosen. */
  ratingColumns: (number | null)[];
  /** The rate the appraiser applies; the rate from the table when empty. */
  appliedRate: number | null;
};

export type IncomeCalculationDto = IncomeInputDto & {
  /**
   * Rent market: the adopted rent ($/m²/month), the subject's rentable area,
   * its comparables and the homologation input the market-rate method needs.
   */
  rentMarket: {
    adoptedUnitRent: number | null;
    subjectArea: number | null;
    comparables: Array<{ reference: number; location: string; area: number | null; price: number | null }>;
    homologation: HomologationInput | null;
  };
  configured: boolean;
  locked: boolean;
};

export const DEFAULT_INCOME: IncomeInputDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: RATE_TABLE_CRITERIA.map(() => null),
  appliedRate: null,
};

type EngineInputResult = { ok: true; input: IncomeApproachInput } | { ok: false; reason: string };

const positive = (value: number | null | undefined): value is number => typeof value === "number" && value > 0;

export function toIncomeEngineInput(
  calculation: Pick<IncomeCalculationDto, "method" | "annuity" | "marketRate" | "rentableUnits" | "deductions" | "ratingColumns" | "appliedRate" | "rentMarket">,
): EngineInputResult {
  const deductions = calculation.deductions.map((deduction) => ({ concept: deduction.concept, rate: deduction.rate ?? 0 }));
  if (calculation.method === "mercado") {
    const homologation = calculation.rentMarket.homologation;
    if (!homologation) return { ok: false, reason: "Completa el mercado de rentas: superficie del sujeto y comparables." };
    const salePrices = homologation.comparables.map((comparable) => calculation.marketRate.salePrices[comparable.id] ?? null);
    if (!salePrices.some(positive)) return { ok: false, reason: "Captura el precio de venta de al menos un comparable de renta." };
    return {
      ok: true,
      input: {
        method: "mercado",
        rentMarket: homologation,
        rentableUnits: [],
        deductions: [],
        capitalization: {},
        marketRate: {
          salePrices,
          negotiation: calculation.marketRate.negotiation ?? 0,
          vacancy: calculation.marketRate.vacancy ?? 0,
          expenses: deductions,
          subjectArea: homologation.subjectArea,
        },
      },
    };
  }

  const adopted = calculation.rentMarket.adoptedUnitRent;
  const units = calculation.rentableUnits
    .map((unit) => ({ ...unit, area: unit.area ?? (calculation.rentableUnits.length === 1 ? calculation.rentMarket.subjectArea : null) }))
    .filter((unit) => (unit.area ?? 0) > 0);
  if (!units.length) return { ok: false, reason: "Captura la superficie rentable." };
  if (units.some((unit) => unit.unitRent === null) && !(adopted && adopted > 0)) {
    return { ok: false, reason: "Captura la renta unitaria, o el mercado de rentas." };
  }
  const rentInput = {
    ...(adopted ? { adoptedUnitRent: adopted } : {}),
    rentableUnits: units.map((unit) => ({
      description: unit.description || "Superficie rentable",
      area: unit.area as number,
      ...(unit.unitRent !== null ? { unitRent: unit.unitRent } : {}),
    })),
    deductions,
  };

  if (calculation.method === "anualidad") {
    const annuity = calculation.annuity;
    if (annuity.vacancyDays === null || !positive(annuity.contractYears)) return { ok: false, reason: "Captura los días de vacío y los años de contrato." };
    if (annuity.tiie === null || annuity.inflation === null) return { ok: false, reason: "Captura la TIIE a 28 días y la inflación anual estimada." };
    if (!positive(annuity.remainingLifeYears)) return { ok: false, reason: "Captura la vida útil remanente." };
    return {
      ok: true,
      input: {
        method: "anualidad",
        ...rentInput,
        capitalization: {},
        annuity: {
          vacancyDays: annuity.vacancyDays,
          contractYears: annuity.contractYears,
          otherMonthlyIncome: annuity.otherMonthlyIncome ?? 0,
          tiie: annuity.tiie,
          inflation: annuity.inflation,
          remainingLifeYears: annuity.remainingLifeYears,
          option: annuity.option,
        },
      },
    };
  }

  const tableComplete = calculation.ratingColumns.length === RATE_TABLE_CRITERIA.length
    && calculation.ratingColumns.every((column) => column !== null);
  if (!calculation.appliedRate && !tableComplete) {
    return { ok: false, reason: "Califica los siete criterios de la tabla de tasa, o captura la tasa." };
  }
  return {
    ok: true,
    input: {
      ...rentInput,
      capitalization: {
        ...(tableComplete ? { ratingColumns: calculation.ratingColumns as number[], rates: RATE_TABLE_RATES } : {}),
        ...(calculation.appliedRate ? { appliedRate: calculation.appliedRate } : {}),
      },
    },
  };
}

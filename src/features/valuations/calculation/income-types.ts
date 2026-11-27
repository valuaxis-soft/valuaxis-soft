/**
 * Income approach data as the editor and the API exchange it, and its
 * conversion to the engine input. The rent comes from the rent market
 * (comparables of type INMUEBLE_RENTA). Three methods, as the firm's books:
 * the rate table (TCH), the annuity (TU) and the market rate (TR).
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, type IncomeApproachInput, type IncomeMethod } from "../engine/income";
import type { HomologationInput } from "../engine/market";
import type { CapturedFormulas, PercentFields } from "./captured-formulas";
import { withPrecision, type CalculationPrecision } from "./calculation-precision";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig, type RoundingDigits } from "../engine/config";

export const INCOME_METHOD_LABELS: Record<IncomeMethod, string> = {
  // The name of each way of getting the rate, never the code of a book of the firm (video 8.12, 32:40; 8.10, 26:50).
  tabla: "Cálculo de tasa por Bravo Armejo",
  anualidad: "Anualidad con TIIE",
  mercado: "Tasa de mercado (venta / renta)",
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

/**
 * A row of Bravo Armejo's rate table as the appraiser keeps it: the concept
 * and the six options under 7 % … 12 %. A row whose concept reads
 * «calificación» is where the criterion above it is rated (video 8.14,
 * 25:20: «debería de detectar en automático que si dice calificación se
 * pinta en verde»). `key` names the row for good.
 */
export type RateTableRowDto = { key: string; cells: string[] };

/** The six options of each row, one under each rate. */
export const RATE_TABLE_OPTIONS = RATE_TABLE_RATES.length;
/** The rated row of each criterion, as the books name it. */
export const RATING_ROW_LABEL = "calificación";

const plainLabel = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
/** A row where a criterion is rated: its concept reads «calificación», whatever its accents or capitals. */
export const isRatingRow = (row: Pick<RateTableRowDto, "cells">) => plainLabel(row.cells[0] ?? "") === "calificacion";

const ratingKey = (key: string) => `calificacion-${key}`;
const criterionRows = (key: string, rows: string[][]): RateTableRowDto[] => [
  ...rows.map((cells, index) => ({ key: index === 0 ? key : `${key}-${index + 1}`, cells })),
  { key: ratingKey(key), cells: [RATING_ROW_LABEL, ...RATE_TABLE_RATES.map(() => "")] },
];

/**
 * The criteria of the rate table as the books print them («XII.3 CALCULO DE
 * TASA», TCH and Arandas, rows 30 to 45): what each column means, in one or
 * two rows, and under them the row where the column is rated. In the order of
 * RATE_TABLE_CRITERIA.
 */
export const DEFAULT_RATE_TABLE: RateTableRowDto[] = [
  ...criterionRows("edad", [["EDAD (AÑOS)", "0 - 5", "5 - 20", "20 - 40", "40 - 50", "50 - 60", "MÁS DE 60"]]),
  ...criterionRows("vida-util", [["VIDA ÚTIL REMANENTE", "MÁS DE 60", "50 - 60", "40 - 50", "20 - 40", "5 - 20", "TERMINADA"]]),
  ...criterionRows("conservacion", [["ESTADO DE CONSERVACIÓN", "NUEVA", "MUY BUENO", "BUENO", "REGULAR", "MALO", "RUINOSO"]]),
  ...criterionRows("proyecto", [["PROYECTO", "MUY BUENO", "BUENO", "ADECUADO", "REGULAR", "DEFICIENTE", "MALO"]]),
  ...criterionRows("relacion", [
    ["REL. SUP. (TERRENO/CONSTR.)", "CONST>TERR", "CONST>TERR", "CONST>TERR", "CONST=TERR", "TERR > CONST", "TERR > CONST"],
    ["RELACIÓN", "MAYOR 3-1", "HASTA 3-1", "HASTA 2-1", "1 -1", "HASTA 3-1", "MAYOR 3-1"],
  ]),
  ...criterionRows("uso", [
    ["USO DEL INMUEBLE", "CASA", "EDIF. PROD.", "DPTO/CASA", "OFNA/LOCAL", "OFNA/LOCAL", "BODEGA"],
    ["INMUEBLE", "UNIF.", "HAB-COM", "CONDOM.", "CONDOM.", "UNIF.", "INDUSTRIA"],
  ]),
  ...criterionRows("zona", [["CLASIFICACIÓN DE ZONA", "LUJO", "1ER. ORDEN", "2DO. ORDEN", "3ER. ORDEN", "PROL. SERV. COM.", "PROL. SERV. INC."]]),
];

/** The rate table of a calculation: the appraiser's, or the books' while he has not changed it. */
export const rateTableOf = (calculation: { rateTable?: RateTableRowDto[] | null }): RateTableRowDto[] =>
  calculation.rateTable?.length ? calculation.rateTable : DEFAULT_RATE_TABLE;

/**
 * The criteria of a rate table: each «calificación» row and the name of its
 * criterion (the first row since the rating before it). A criterion the
 * appraiser adds, with its «calificación», counts in the sums and the rate
 * (video 8.14, 25:50: «que me lo considere»).
 */
export function rateCriteriaOf(rows: ReadonlyArray<RateTableRowDto>): { name: string; ratingKey: string }[] {
  const criteria: { name: string; ratingKey: string }[] = [];
  let name = "";
  for (const row of rows) {
    if (isRatingRow(row)) {
      criteria.push({ name: name || `Criterio ${criteria.length + 1}`, ratingKey: row.key });
      name = "";
    } else if (!name) {
      name = row.cells[0]?.trim() ?? "";
    }
  }
  return criteria;
}

/** The ratings as many as the criteria of the table: missing ones not rated yet, extra ones dropped. */
export function ratingColumnsFor(rows: ReadonlyArray<RateTableRowDto>, ratingColumns: ReadonlyArray<number | null>): (number | null)[] {
  return rateCriteriaOf(rows).map((_, index) => ratingColumns[index] ?? null);
}

export type IncomeInputDto = {
  method: IncomeMethod;
  annuity: AnnuityDto;
  marketRate: MarketRateDto;
  rentableUnits: RentableUnitDto[];
  deductions: IncomeDeductionDto[];
  /** Column chosen for each criterion of the rate table, or null while not chosen. */
  ratingColumns: (number | null)[];
  /** The rate table as the appraiser edited it (rows, criteria, options); absent, the books'. */
  rateTable?: RateTableRowDto[] | null;
  /**
   * The deductions printed in two tables, side by side (video 8.14, 16:10):
   * the second starts at this deduction; null, one table. Both count.
   */
  deductionsSplit?: number | null;
  /** IV) Tasa aplicada: the rate the appraiser applies; the rate from the table when empty. */
  appliedRate: number | null;
  /** II) Tasa obtenida de mercado, of the books' «Tasa a utilizar»: printed for reference, it does not enter the calculation. */
  rateFromMarket: number | null;
  /** III) Tasa ponderada: printed for reference, it does not enter the calculation. */
  weightedRate: number | null;
  /** How the capitalized value is rounded (Excel ROUND digits); null, not rounded, as the books. */
  rounding: RoundingDigits;
  /** Formulas typed in the numeric fields, by path ("rentableUnits.0.area"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
};

/** Rates typed as percentages ("7.92" for 0.0792). */
export const INCOME_PERCENT_FIELDS: PercentFields = (path) =>
  /^(annuity\.(tiie|inflation)|marketRate\.(negotiation|vacancy)|deductions\.\d+\.rate|appliedRate|rateFromMarket|weightedRate)$/.test(path);

export type IncomeCalculationDto = IncomeInputDto & {
  /**
   * Rent market: the adopted rent ($/m²/month), the subject's rentable area,
   * its comparables and the homologation input the market-rate method needs.
   */
  rentMarket: {
    adoptedUnitRent: number | null;
    /** The monthly rent the rent market concludes, rounded as it was rounded there; null without one. */
    concludedMonthlyRent?: number | null;
    subjectArea: number | null;
    comparables: Array<{ reference: number; location: string; area: number | null; price: number | null }>;
    homologation: HomologationInput | null;
  };
  configured: boolean;
  locked: boolean;
  /** The valuation's precision, for the homologation of the rent market; missing, the behavior of before. */
  precision?: CalculationPrecision;
};

/** The engine settings of the income approach: the defaults with the valuation's precision. */
export const incomeEngineConfig = (calculation: { precision?: CalculationPrecision | null }): EngineConfig =>
  withPrecision(DEFAULT_ENGINE_CONFIG, calculation.precision);

/* ------------------------------------------------------------------ */
/*  Bravo Armejo's table: rows the appraiser adds, removes and renames  */
/* ------------------------------------------------------------------ */

/** A key no row of the table uses yet. */
function freeRowKey(rows: ReadonlyArray<RateTableRowDto>, base: string) {
  const used = new Set(rows.map((row) => row.key));
  let number = rows.length + 1;
  while (used.has(`${base}-${number}`)) number += 1;
  return `${base}-${number}`;
}

const blankRow = (key: string, label = ""): RateTableRowDto => ({ key, cells: [label, ...Array.from({ length: RATE_TABLE_OPTIONS }, () => "")] });

/**
 * The table after a change of its rows, with each criterion's rating kept
 * on its «calificación» row: a row added, taken out or renamed to (or from)
 * «calificación» moves no rating to another criterion.
 */
export function withRateRows(
  table: { rateTable: RateTableRowDto[]; ratingColumns: (number | null)[] },
  rows: RateTableRowDto[],
): { rateTable: RateTableRowDto[]; ratingColumns: (number | null)[] } {
  const before = new Map(rateCriteriaOf(table.rateTable).map((criterion, index) => [criterion.ratingKey, table.ratingColumns[index] ?? null]));
  return { rateTable: rows, ratingColumns: rateCriteriaOf(rows).map((criterion) => before.get(criterion.ratingKey) ?? null) };
}

/** Row edits of the rate table: a row under this one, a criterion (its row and its «calificación») under it, or the row taken out. */
export function editRateRows(rows: ReadonlyArray<RateTableRowDto>, edit: "row-below" | "criterion-below" | "delete", index: number): RateTableRowDto[] {
  const next = [...rows];
  if (edit === "delete") {
    next.splice(index, 1);
    return next;
  }
  const concept = blankRow(freeRowKey(rows, "propio"));
  if (edit === "row-below") {
    next.splice(index + 1, 0, concept);
    return next;
  }
  // A criterion goes after the «calificación» that closes the criterion of this row.
  const closing = rows.findIndex((row, at) => at >= index && isRatingRow(row));
  const at = closing === -1 ? rows.length : closing + 1;
  next.splice(at, 0, concept, blankRow(freeRowKey([...rows, concept], "calificacion-propia"), RATING_ROW_LABEL));
  return next;
}

export const DEFAULT_INCOME: IncomeInputDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: RATE_TABLE_CRITERIA.map(() => null),
  appliedRate: null,
  rateFromMarket: null,
  weightedRate: null,
  rounding: null,
};

/**
 * The monthly rent the rent market concluded, when the income approach takes
 * it as its gross rent: one rentable surface that inherits the market's rent
 * and the subject's area (or has that same area typed). Otherwise null: the
 * surfaces are worked out as before, area × rent.
 */
export function concludedMonthlyRentFor(calculation: Pick<IncomeCalculationDto, "rentableUnits" | "rentMarket">): number | null {
  const concluded = calculation.rentMarket.concludedMonthlyRent;
  const units = calculation.rentableUnits;
  if (!concluded || concluded <= 0 || units.length !== 1 || units[0].unitRent !== null) return null;
  const adopted = calculation.rentMarket.adoptedUnitRent;
  const subjectArea = calculation.rentMarket.subjectArea;
  if (!adopted || adopted <= 0 || !subjectArea || subjectArea <= 0) return null;
  return units[0].area === null || units[0].area === subjectArea ? concluded : null;
}

type EngineInputResult = { ok: true; input: IncomeApproachInput } | { ok: false; reason: string };

const positive = (value: number | null | undefined): value is number => typeof value === "number" && value > 0;

export function toIncomeEngineInput(
  calculation: Pick<IncomeCalculationDto, "method" | "annuity" | "marketRate" | "rentableUnits" | "deductions" | "ratingColumns" | "appliedRate" | "rentMarket">
    & Partial<Pick<IncomeCalculationDto, "rounding" | "rateTable">>,
): EngineInputResult {
  const rounding = calculation.rounding === undefined || calculation.rounding === null ? {} : { rounding: calculation.rounding };
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
        ...rounding,
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
  const concluded = concludedMonthlyRentFor(calculation);
  const rentInput = {
    ...rounding,
    ...(adopted ? { adoptedUnitRent: adopted } : {}),
    ...(concluded !== null ? { adoptedMonthlyRent: concluded } : {}),
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

  const criteria = rateCriteriaOf(rateTableOf(calculation));
  const ratings = ratingColumnsFor(rateTableOf(calculation), calculation.ratingColumns);
  const tableComplete = ratings.length > 0 && ratings.every((column) => column !== null);
  if (!calculation.appliedRate && !tableComplete) {
    const count = criteria.length === RATE_TABLE_CRITERIA.length ? "los siete" : `los ${criteria.length}`;
    return { ok: false, reason: `Califica ${count} criterios de la tabla de tasa, o captura la tasa.` };
  }
  return {
    ok: true,
    input: {
      ...rentInput,
      capitalization: {
        ...(tableComplete ? { ratingColumns: ratings as number[], rates: RATE_TABLE_RATES, criteria: criteria.map((item) => item.name) } : {}),
        ...(calculation.appliedRate ? { appliedRate: calculation.appliedRate } : {}),
      },
    },
  };
}

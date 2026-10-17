/**
 * Cost approach data as the editor and the API exchange it, and its conversion
 * to the engine input. The construction types (surface, age, useful life) are
 * captured once in the construction section (construction-types.service.ts);
 * the cost approach picks each one by its reference and adds its own columns.
 * Special installations are captured once here and feed both sections.
 */
import { SURFACE_SLOT, type FactorSlot } from "../engine/factors";
import { DEFAULT_ENGINE_CONFIG, withRounding, type EngineConfig, type RoundingDigits } from "../engine/config";
import type { CostApproachInput } from "../engine/costs";

/** Land factor columns of the books (J..O): Neg., Ubic., Sup., Serv., Clas., Top. */
export const LAND_FACTORS = [
  { key: "negotiation", label: "Negociación" },
  { key: "location", label: "Ubicación" },
  { key: "surface", label: "Superficie" },
  { key: "services", label: "Servicios" },
  { key: "classification", label: "Clasificación" },
  { key: "topography", label: "Topografía" },
] as const;

/** Column titles of the land factors as the books abbreviate them (J17..O17). */
export const LAND_FACTOR_SHORT_LABELS: Record<(typeof LAND_FACTORS)[number]["key"], string> = {
  negotiation: "Neg.", location: "Ubic.", surface: "Sup.", services: "Serv.", classification: "Clas.", topography: "Top.",
};

export type LandFactorKey = Exclude<(typeof LAND_FACTORS)[number]["key"], "surface">;

export type CostLandDto = {
  subjectArea: number | null;
  /** Lote tipo; empty to use the subject area. */
  referenceArea: number | null;
  /** $/m²; empty to take the value adopted in the land market approach. */
  unitValue: number | null;
  surfacePower: number;
  factors: Record<LandFactorKey, number>;
  /** Sup. (Y18); empty to take (sujeto / lote tipo)^(1/n). */
  surfaceFactor: number | null;
  /** FRe (P18); empty to take the product of the factors. */
  resultantFactor: number | null;
};

/** A construction type as the construction section captures it: the single source of its surface, age and useful life. */
export type ConstructionTypeDto = {
  ref: string;
  description: string;
  classification: string;
  quality: string;
  area: number | null;
  age: number | null;
  usefulLife: number | null;
};

/** The construction section's list as the editor and the API exchange it. */
export type ConstructionTypesDto = { types: ConstructionTypeDto[]; locked: boolean };

/** What the cost approach adds to a construction type it picked. */
export type ConstructionCostDto = {
  /** Reference of the type in the construction section. */
  ref: string;
  conservation: number | null;
  /** Edad of the demerit factors (R26); empty to take the formula. */
  ageFactor: number | null;
  otherFactor: number;
  /** FRe (T26); empty to take conservación × edad × otro. */
  resultantFactor: number | null;
  /** Fractions: 1 is 100 %; the panel shows them as percentages. */
  completion: number;
  undivided: number;
  unitReplacementCost: number | null;
};

/** A construction as the engine and the dictamen see it: the type with its cost columns. */
export type ConstructionDto = ConstructionTypeDto & ConstructionCostDto;

/** Remaining useful life, as the books: total minus age, never below zero. */
export function remainingUsefulLife(type: Pick<ConstructionTypeDto, "age" | "usefulLife">): number | null {
  return type.usefulLife !== null && type.age !== null ? Math.max(type.usefulLife - type.age, 0) : null;
}

export function emptyConstructionType(index: number): ConstructionTypeDto {
  return { ref: `T-${index + 1}`, description: "", classification: "", quality: "", area: null, age: null, usefulLife: null };
}

export function emptyConstructionCost(ref = ""): ConstructionCostDto {
  return { ref, conservation: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: null };
}

/** The cost row with the data of its type; a row whose type is gone keeps only its reference. */
export function withConstructionType(cost: ConstructionCostDto, types: ConstructionTypeDto[]): ConstructionDto {
  const type = findConstructionType(types, cost.ref);
  return { ...(type ?? { ...emptyConstructionType(0), ref: cost.ref }), ...cost };
}

export function findConstructionType(types: ConstructionTypeDto[], ref: string): ConstructionTypeDto | undefined {
  const key = ref.trim().toLowerCase();
  return types.find((type) => type.ref.trim().toLowerCase() === key);
}

/** The cost columns of a construction, what the cost approach saves. */
export function constructionCostOf(row: ConstructionDto): ConstructionCostDto {
  return {
    ref: row.ref, conservation: row.conservation, ageFactor: row.ageFactor, otherFactor: row.otherFactor, resultantFactor: row.resultantFactor,
    completion: row.completion, undivided: row.undivided, unitReplacementCost: row.unitReplacementCost,
  };
}

export type InstallationDto = {
  ref: string;
  description: string;
  share: "P" | "C";
  unit: string;
  quantity: number | null;
  age: number | null;
  usefulLife: number | null;
  conservation: number | null;
  /** Printed in the installations table of the construction section; not part of the calculation. */
  maintenance: string;
  /** Edad of the demerit factors (R47); empty to take the formula. */
  ageFactor: number | null;
  otherFactor: number;
  /** FRe (T47); empty to take conservación × edad × otro. */
  resultantFactor: number | null;
  completion: number;
  undivided: number;
  unitReplacementCost: number | null;
};

/** `base` empty: the value of constructions and special installations. */
export type IndirectDto = { concept: string; percentage: number | null; base: number | null };

/** Excel ROUND digits of each part and of the physical value, the appraiser's choice; null is no rounding. */
export type CostRoundingDto = Record<"land" | "constructions" | "installations" | "physicalValue", RoundingDigits>;

export const DEFAULT_COST_ROUNDING: CostRoundingDto = {
  land: DEFAULT_ENGINE_CONFIG.rounding.costs.land,
  constructions: DEFAULT_ENGINE_CONFIG.rounding.costs.constructions,
  installations: DEFAULT_ENGINE_CONFIG.rounding.costs.installations,
  physicalValue: DEFAULT_ENGINE_CONFIG.rounding.costs.physicalValue,
};

/** The factors with an Excel formula may be left out by older clients: they take the formula. */
type WithFormulaFactors<T extends { resultantFactor: number | null }, K extends keyof T> =
  Omit<T, K | "resultantFactor"> & Partial<Pick<T, K | "resultantFactor">>;

/**
 * What the cost approach saves. A construction row names a type of the
 * construction section; a row that still carries the type's data (captures
 * saved before the types had their own panel) creates the type if it is missing.
 */
export type CostInputDto = {
  land: WithFormulaFactors<CostLandDto, "surfaceFactor">;
  constructions: (WithFormulaFactors<ConstructionCostDto, "ageFactor"> & Partial<Omit<ConstructionTypeDto, "ref">>)[];
  installations: WithFormulaFactors<InstallationDto, "ageFactor">[];
  indirects: IndirectDto[];
  rounding?: CostRoundingDto;
};

export function costEngineConfig(calculation: Pick<CostInputDto, "rounding">): EngineConfig {
  return calculation.rounding ? withRounding(DEFAULT_ENGINE_CONFIG, { costs: calculation.rounding }) : DEFAULT_ENGINE_CONFIG;
}

export type CostCalculationDto = Omit<CostInputDto, "land" | "constructions" | "installations"> & {
  land: CostLandDto;
  installations: InstallationDto[];
  /** The construction types picked by the cost approach, with their data from the construction section. */
  constructions: ConstructionDto[];
  /** Every construction type of the construction section, picked or not. */
  types: ConstructionTypeDto[];
  /** Land market approach, the default source of the land unit value and of the lote tipo. */
  market: { adoptedUnitValue: number | null; subjectArea: number | null; baseArea: number | null };
  /** The appraiser has saved the cost approach at least once. */
  configured: boolean;
  /** The construction section has captured its types, so its table follows them even when none are left. */
  typesCaptured: boolean;
  locked: boolean;
};

export const DEFAULT_LAND: CostLandDto = {
  subjectArea: null,
  referenceArea: null,
  unitValue: null,
  surfacePower: 3,
  factors: { negotiation: 1, location: 1, services: 1, classification: 1, topography: 1 },
  surfaceFactor: null,
  resultantFactor: null,
};

export function emptyConstruction(index: number): ConstructionDto {
  return { ...emptyConstructionType(index), ...emptyConstructionCost(`T-${index + 1}`) };
}

export function emptyInstallation(index: number): InstallationDto {
  return {
    ref: String(index + 1), description: "", share: "P", unit: "", quantity: null, age: null, usefulLife: null,
    conservation: null, maintenance: "", ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: null,
  };
}

const positive = (value: number | null): value is number => value !== null && value > 0;

/** The factors the appraiser typed; an empty one (null, or missing in older captures) takes its Excel formula. */
function captured<K extends string>(factors: Record<K, number | null | undefined>): Partial<Record<K, number>> {
  return Object.fromEntries(Object.entries(factors).filter(([, value]) => typeof value === "number")) as Partial<Record<K, number>>;
}

/** A construction or installation enters the calculation once its numbers are captured. */
export function isConstructionComplete(row: ConstructionDto) {
  return positive(row.area) && row.age !== null && row.age >= 0 && positive(row.usefulLife)
    && positive(row.conservation) && positive(row.unitReplacementCost);
}

export function isInstallationComplete(row: InstallationDto) {
  return positive(row.quantity) && row.age !== null && row.age >= 0 && positive(row.usefulLife)
    && positive(row.conservation) && positive(row.unitReplacementCost);
}

/** Land unit value used: the captured one, or the one adopted in the market approach. */
export function landUnitValue(calculation: Pick<CostCalculationDto, "land" | "market">) {
  return calculation.land.unitValue ?? calculation.market.adoptedUnitValue;
}

/**
 * Lote tipo of the land: the captured one, else the base area of the land
 * market (indirect homologation), else the subject (direct: Sup. = 1).
 */
export function landReferenceArea(calculation: Pick<CostCalculationDto, "land" | "market">): { area: number | null; source: "captured" | "market" | "subject" } {
  if (calculation.land.referenceArea !== null) return { area: calculation.land.referenceArea, source: "captured" };
  if (calculation.market.baseArea !== null) return { area: calculation.market.baseArea, source: "market" };
  return { area: calculation.land.subjectArea ?? calculation.market.subjectArea, source: "subject" };
}

export function toCostEngineInput(calculation: Pick<CostCalculationDto, "land" | "market" | "constructions" | "installations" | "indirects">):
  | { ok: true; input: CostApproachInput }
  | { ok: false; reason: string } {
  const { land } = calculation;
  const subjectArea = land.subjectArea ?? calculation.market.subjectArea;
  const unitValue = landUnitValue(calculation);
  const hasLand = positive(subjectArea) && positive(unitValue);
  const constructions = calculation.constructions.filter(isConstructionComplete);
  const installations = calculation.installations.filter(isInstallationComplete);
  if (!hasLand && !constructions.length && !installations.length) {
    return { ok: false, reason: "Captura la superficie y el valor unitario del terreno, o una construcción." };
  }
  if (!(land.surfacePower > 0)) return { ok: false, reason: "La potencia n debe ser mayor que cero." };

  const factorSlots: FactorSlot[] = LAND_FACTORS.map((factor) =>
    factor.key === "surface" ? SURFACE_SLOT : { key: factor.key, label: factor.label, value: land.factors[factor.key] ?? 1 });
  const indirects = calculation.indirects
    .filter((row) => row.concept.trim() && positive(row.percentage))
    .map((row) => ({ concept: row.concept, percentage: row.percentage as number, ...(positive(row.base) ? { base: row.base } : {}) }));

  return {
    ok: true,
    input: {
      ...(hasLand
        ? {
            land: {
              kind: "urban" as const,
              subjectArea: subjectArea as number,
              referenceArea: landReferenceArea(calculation).area ?? (subjectArea as number),
              marketUnitValue: unitValue as number,
              surfacePower: land.surfacePower,
              factors: factorSlots,
              ...captured({ surfaceFactor: land.surfaceFactor, resultantFactor: land.resultantFactor }),
            },
          }
        : {}),
      constructions: constructions.map((row) => ({
        ref: row.ref,
        description: row.description,
        area: row.area as number,
        age: row.age as number,
        usefulLife: row.usefulLife as number,
        conservation: row.conservation as number,
        otherFactor: row.otherFactor,
        ...captured({ ageFactor: row.ageFactor, resultantFactor: row.resultantFactor }),
        completion: row.completion,
        undivided: row.undivided,
        unitReplacementCost: row.unitReplacementCost as number,
      })),
      specialInstallations: installations.map((row) => ({
        ref: row.ref,
        description: row.description,
        share: row.share,
        unit: row.unit,
        quantity: row.quantity as number,
        age: row.age as number,
        usefulLife: row.usefulLife as number,
        conservation: row.conservation as number,
        otherFactor: row.otherFactor,
        ...captured({ ageFactor: row.ageFactor, resultantFactor: row.resultantFactor }),
        completion: row.completion,
        undivided: row.undivided,
        unitReplacementCost: row.unitReplacementCost as number,
      })),
      indirects,
    },
  };
}

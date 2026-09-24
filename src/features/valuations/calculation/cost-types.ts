/**
 * Cost approach data as the editor and the API exchange it, and its conversion
 * to the engine input. Constructions and special installations are captured
 * once here and feed both the construction section and the cost approach.
 */
import { SURFACE_SLOT, type FactorSlot } from "../engine/factors";
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

export type LandFactorKey = Exclude<(typeof LAND_FACTORS)[number]["key"], "surface">;

export type CostLandDto = {
  subjectArea: number | null;
  /** Lote tipo; empty to use the subject area. */
  referenceArea: number | null;
  /** $/m²; empty to take the value adopted in the land market approach. */
  unitValue: number | null;
  surfacePower: number;
  factors: Record<LandFactorKey, number>;
};

export type ConstructionDto = {
  ref: string;
  description: string;
  classification: string;
  quality: string;
  area: number | null;
  age: number | null;
  usefulLife: number | null;
  conservation: number | null;
  otherFactor: number;
  completion: number;
  undivided: number;
  unitReplacementCost: number | null;
};

export type InstallationDto = {
  ref: string;
  description: string;
  share: "P" | "C";
  unit: string;
  quantity: number | null;
  age: number | null;
  usefulLife: number | null;
  conservation: number | null;
  maintenance: string;
  otherFactor: number;
  completion: number;
  undivided: number;
  unitReplacementCost: number | null;
};

export type IndirectDto = { concept: string; percentage: number | null; base: number | null };

export type CostInputDto = {
  land: CostLandDto;
  constructions: ConstructionDto[];
  installations: InstallationDto[];
  indirects: IndirectDto[];
};

export type CostCalculationDto = CostInputDto & {
  /** Land market approach, the default source of the land unit value. */
  market: { adoptedUnitValue: number | null; subjectArea: number | null; baseArea: number | null };
  /** The appraiser has saved the cost approach at least once. */
  configured: boolean;
  locked: boolean;
};

export const DEFAULT_LAND: CostLandDto = {
  subjectArea: null,
  referenceArea: null,
  unitValue: null,
  surfacePower: 3,
  factors: { negotiation: 1, location: 1, services: 1, classification: 1, topography: 1 },
};

export function emptyConstruction(index: number): ConstructionDto {
  return {
    ref: `T-${index + 1}`, description: "", classification: "", quality: "",
    area: null, age: null, usefulLife: null, conservation: null, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: null,
  };
}

export function emptyInstallation(index: number): InstallationDto {
  return {
    ref: String(index + 1), description: "", share: "P", unit: "", quantity: null, age: null, usefulLife: null,
    conservation: null, maintenance: "", otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: null,
  };
}

const positive = (value: number | null): value is number => value !== null && value > 0;

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
    .filter((row) => row.concept.trim() && positive(row.percentage) && positive(row.base))
    .map((row) => ({ concept: row.concept, percentage: row.percentage as number, base: row.base as number }));

  return {
    ok: true,
    input: {
      ...(hasLand
        ? {
            land: {
              kind: "urban" as const,
              subjectArea: subjectArea as number,
              referenceArea: land.referenceArea ?? calculation.market.baseArea ?? (subjectArea as number),
              marketUnitValue: unitValue as number,
              surfacePower: land.surfacePower,
              factors: factorSlots,
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
        completion: row.completion,
        undivided: row.undivided,
        unitReplacementCost: row.unitReplacementCost as number,
      })),
      indirects,
    },
  };
}

/**
 * Cost approach data as the editor and the API exchange it, and its conversion
 * to the engine input. The construction types (surface, age, useful life) are
 * captured once in the construction section (construction-types.service.ts);
 * the cost approach picks each one by its reference and adds its own columns.
 * Special installations are captured once here and feed both sections.
 */
import { SURFACE_SLOT, type FactorSlot } from "../engine/factors";
import { DEFAULT_ENGINE_CONFIG, withRounding, type EngineConfig, type RoundingDigits } from "../engine/config";
import { withPrecision, type CalculationPrecision } from "./calculation-precision";
import type { CostApproachInput } from "../engine/costs";
import type { CapturedFormulas, PercentFields } from "./captured-formulas";
import { parseDecimal } from "./free-formula";

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

/**
 * Conservation of a building or an installation as the appraiser's sheet
 * «ROSS HEIDECKE» (4._FORMULAS-CRITERIOS) rates it: the estado and its
 * calificación, 10 to 2, with the factor F of each. Picking one gives the
 * Cons. of the row unless a factor is typed.
 */
export const CONSERVATION_RATINGS = [
  { rating: 10, factor: 1, state: "Nuevo" },
  { rating: 9, factor: 0.99, state: "Nuevo" },
  { rating: 8, factor: 0.975, state: "Regular" },
  { rating: 7, factor: 0.92, state: "Regular" },
  { rating: 6, factor: 0.82, state: "Reparaciones sencillas" },
  { rating: 5, factor: 0.66, state: "Reparaciones sencillas" },
  { rating: 4, factor: 0.47, state: "Reparaciones importantes" },
  { rating: 3, factor: 0.25, state: "Reparaciones importantes" },
  { rating: 2, factor: 0.135, state: "Deshecho" },
] as const;

export const isConservationRating = (value: unknown): value is number =>
  CONSERVATION_RATINGS.some((row) => row.rating === value);

/** The sheet's factor for a calificación; null without one (or one that is not of the table). */
export function conservationOfRating(rating: number | null | undefined): number | null {
  return CONSERVATION_RATINGS.find((row) => row.rating === rating)?.factor ?? null;
}

/** The Cons. of a row: the factor typed, else the one of its calificación, else none (the row waits for it). */
export function effectiveConservation(row: { conservation: number | null; conservationRating?: number | null }): number | null {
  return row.conservation ?? conservationOfRating(row.conservationRating);
}

/**
 * How a table rates the conservation before its Cons. is chosen: the sheet
 * «ROSS HEIDECKE» (estado and calificación, as before), a table of states of
 * conservation, or a criterion of the appraiser's own (its name, its states
 * and their factors). Picking a state of the last two writes its factor in
 * Cons., which stays editable: the criterion only proposes.
 */
export const CONSERVATION_CRITERIA = ["ROSS_HEIDECKE", "TABLA_ESTADO", "PROPIO"] as const;
export type ConservationCriterion = (typeof CONSERVATION_CRITERIA)[number];
export const CONSERVATION_CRITERION_LABELS: Record<ConservationCriterion, string> = {
  ROSS_HEIDECKE: "Ross-Heidecke",
  TABLA_ESTADO: "Tabla de estado de conservación",
  PROPIO: "Criterio propio",
};
export type ConservationOption = { label: string; factor: number };
export type ConservationCriterionDto = { kind: ConservationCriterion; name: string; options: ConservationOption[] };
export const MAX_CONSERVATION_OPTIONS = 12;

/**
 * The states of the table of conservation with the factors it starts with.
 * Suggested values: the appraiser still has to confirm the table, so the
 * panel says so and lets him adjust each factor.
 */
export const CONSERVATION_STATE_TABLE: ConservationOption[] = [
  { label: "Bueno", factor: 1 },
  { label: "Normal", factor: 0.9 },
  { label: "Reparaciones sencillas", factor: 0.75 },
  { label: "Reparaciones mayores", factor: 0.6 },
  { label: "Ruinoso", factor: 0.3 },
];

/** A table rates its conservation by Ross-Heidecke until the appraiser picks another criterion. */
export const DEFAULT_CONSERVATION_CRITERION: ConservationCriterionDto = { kind: "ROSS_HEIDECKE", name: "", options: [] };

/** What a criterion starts with when it is picked: the suggested table, or one empty state to name. */
export function conservationCriterionOf(kind: ConservationCriterion, current?: ConservationCriterionDto): ConservationCriterionDto {
  if (kind === "ROSS_HEIDECKE") return { kind, name: "", options: [] };
  if (current?.kind === kind) return current;
  return kind === "TABLA_ESTADO"
    ? { kind, name: "", options: CONSERVATION_STATE_TABLE.map((option) => ({ ...option })) }
    : { kind, name: "", options: [{ label: "", factor: 1 }] };
}

/** A stored criterion read back: unknown kinds take Ross-Heidecke; options need a label and a factor from 0 to 10. */
function conservationCriterionFrom(value: unknown): ConservationCriterionDto {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const kind = CONSERVATION_CRITERIA.find((item) => item === record.kind) ?? "ROSS_HEIDECKE";
  if (kind === "ROSS_HEIDECKE") return DEFAULT_CONSERVATION_CRITERION;
  const options = (Array.isArray(record.options) ? record.options : []).flatMap((item): ConservationOption[] => {
    const option = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    const label = typeof option.label === "string" ? option.label.trim() : "";
    const factor = typeof option.factor === "number" && Number.isFinite(option.factor) && option.factor >= 0 && option.factor <= 10 ? option.factor : null;
    return label && factor !== null ? [{ label, factor }] : [];
  }).slice(0, MAX_CONSERVATION_OPTIONS);
  return { kind, name: typeof record.name === "string" ? record.name.trim().slice(0, 60) : "", options };
}

/** The factor of a state of the criterion, by its label (case and accents ignored); null when it is not one of its states. */
export function conservationOfState(criterion: ConservationCriterionDto, label: string | null | undefined): number | null {
  const key = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (!label?.trim()) return null;
  return criterion.options.find((option) => key(option.label) === key(label))?.factor ?? null;
}

/**
 * The Cons. cell as it is written (video 8.12, 29:30): a factor («0.98»), a
 * state of the criterion with its factor («Nuevo = 0.98», what picking it in
 * the list beside the cell writes) or a state alone («Nuevo», which takes its
 * factor from the criterion). The calculation uses the number; the word is
 * what the construction section prints. A text that is neither leaves the
 * row without Cons. (marked, nothing refused).
 */
export function readConservationText(text: string, criterion: ConservationCriterionDto): { conservation: number | null; state: string | null } {
  const typed = text.trim();
  if (!typed) return { conservation: null, state: null };
  const equals = typed.indexOf("=");
  if (equals > 0) {
    const state = typed.slice(0, equals).trim();
    const factor = parseDecimal(typed.slice(equals + 1));
    return { conservation: factor ?? conservationOfState(criterion, state), state: state || null };
  }
  const factor = parseDecimal(typed);
  if (factor !== null) return { conservation: factor, state: null };
  // A state of the criterion written alone takes its factor, and its name as the criterion writes it.
  const listed = criterion.options.find((option) => conservationOfState({ ...criterion, options: [option] }, typed) !== null);
  return { conservation: listed?.factor ?? null, state: listed?.label ?? typed };
}

/** The Cons. cell of a row as it reads back: «Nuevo = 0.98» when a state was picked or written, the factor alone otherwise. */
export function conservationText(row: { conservation: number | null; conservationState?: string | null }): string {
  const state = row.conservationState?.trim();
  if (row.conservation === null) return state ?? "";
  return state ? `${state} = ${row.conservation}` : String(row.conservation);
}

/**
 * The word of a row's conservation (Nuevo, Bueno, Regular…), as the table of
 * the construction section prints it linked to the cost approach (video 8.6,
 * 1:10): the state picked, or the estado of its Ross-Heidecke calificación;
 * null when the row only has a factor.
 */
export function conservationWord(row: { conservationState?: string | null; conservationRating?: number | null }): string | null {
  const state = row.conservationState?.trim();
  if (state) return state;
  return CONSERVATION_RATINGS.find((item) => item.rating === row.conservationRating)?.state ?? null;
}

/**
 * P/C of an installation as it is written (video 8.12, 31:10: «lo pueden
 * escribir»): P or C, or the word (Privativa, Común), in any case; null when
 * it is something else.
 */
export function readInstallationShare(text: string): "P" | "C" | null {
  const typed = text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (typed === "p" || typed === "privativa" || typed === "privativo") return "P";
  if (typed === "c" || typed === "comun") return "C";
  return null;
}

/** Factors the appraiser may add to the demerit factors of a table, after "Otro". */
export const MAX_EXTRA_DEMERIT_FACTORS = 2;

/**
 * The names of the demerit columns of the constructions or the installations:
 * "Otro" as the appraiser renames it, and the factors added after it (up to
 * two) that multiply the FRe as "Otro" does.
 */
export type DemeritColumnsDto = {
  other: string;
  extra: string[];
  /** How the table rates its conservation; Ross-Heidecke when missing (captures of before). */
  conservation?: ConservationCriterionDto;
};

/**
 * How the appraiser set the columns of the cost tables: the demerit columns
 * of each table and whether the installations capture their maintenance
 * (null: only when one was written, as before).
 */
export type CostColumnsDto = {
  constructions: DemeritColumnsDto;
  installations: DemeritColumnsDto;
  showMaintenance: boolean | null;
  /**
   * References of the construction types the appraiser took out of the cost
   * approach. Every other type of the construction section enters it on its
   * own, with its data filled; the appraiser only captures its cost columns.
   */
  excludedTypes?: string[];
  /**
   * Values the appraiser adds to the summary of the approach, each one a line
   * of it that the physical value adds (video 8.14, 43:50: «estoy bloqueado…
   * quiero cualquier otro dato» that counts).
   */
  extraValues?: CostExtraValueDto[];
};

export type CostExtraValueDto = { id: string; label: string; amount: number | null };

/** Values of his own the appraiser may add to the physical value. */
export const MAX_COST_EXTRA_VALUES = 6;

/** The name an added value prints with while it has none. */
export const DEFAULT_EXTRA_VALUE_LABEL = "Otro valor";

export const DEFAULT_OTHER_FACTOR_LABEL = "Otro";

export const DEFAULT_COST_COLUMNS: CostColumnsDto = {
  constructions: { other: DEFAULT_OTHER_FACTOR_LABEL, extra: [] },
  installations: { other: DEFAULT_OTHER_FACTOR_LABEL, extra: [] },
  showMaintenance: null,
};

/** The columns as stored, completed with the defaults; a blank "Otro" takes the default name. */
export function costColumnsOf(stored: unknown): CostColumnsDto {
  const record = (value: unknown) => (typeof value === "object" && value !== null ? value as Record<string, unknown> : {});
  const demerit = (value: unknown): DemeritColumnsDto => {
    const { other, extra } = record(value);
    const conservation = conservationCriterionFrom(record(value).conservation);
    return {
      other: typeof other === "string" && other.trim() ? other.trim() : DEFAULT_OTHER_FACTOR_LABEL,
      extra: Array.isArray(extra)
        ? extra.filter((name): name is string => typeof name === "string").slice(0, MAX_EXTRA_DEMERIT_FACTORS)
        : [],
      // Ross-Heidecke is what a table without a criterion has always used: it is not written.
      ...(conservation.kind === "ROSS_HEIDECKE" ? {} : { conservation }),
    };
  };
  const columns = record(stored);
  const excluded = Array.isArray(columns.excludedTypes)
    ? [...new Set(columns.excludedTypes.filter((ref): ref is string => typeof ref === "string" && Boolean(ref.trim())).map((ref) => ref.trim()))].slice(0, 30)
    : [];
  const extraValues = Array.isArray(columns.extraValues)
    ? columns.extraValues.flatMap((item): CostExtraValueDto[] => {
        const { id, label, amount } = record(item);
        if (typeof id !== "string" || !id.trim()) return [];
        return [{ id, label: typeof label === "string" ? label : "", amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null }];
      }).slice(0, MAX_COST_EXTRA_VALUES)
    : [];
  return {
    constructions: demerit(columns.constructions),
    installations: demerit(columns.installations),
    showMaintenance: typeof columns.showMaintenance === "boolean" ? columns.showMaintenance : null,
    ...(excluded.length ? { excludedTypes: excluded } : {}),
    ...(extraValues.length ? { extraValues } : {}),
  };
}

/** The values added to the physical value that enter it: the ones with an amount. */
export function costAdditionsOf(columns: Pick<CostColumnsDto, "extraValues"> | undefined): Array<{ id: string; label: string; amount: number }> {
  return (columns?.extraValues ?? []).flatMap((item) => (item.amount === null ? [] : [{ id: item.id, label: item.label.trim() || DEFAULT_EXTRA_VALUE_LABEL, amount: item.amount }]));
}

/** The criterion a table rates its conservation by. */
export const conservationCriterionOfColumns = (columns: DemeritColumnsDto) => columns.conservation ?? DEFAULT_CONSERVATION_CRITERION;

/**
 * The construction types the cost approach does not have yet and the
 * appraiser did not take out: they enter it on their own, in the order of the
 * construction section, with empty cost columns.
 */
export function typesToAdd(types: Pick<ConstructionTypeDto, "ref">[], picked: Array<{ ref: string }>, excluded: string[] = []) {
  const key = (ref: string) => ref.trim().toLowerCase();
  const taken = new Set([...picked.map((row) => key(row.ref)), ...excluded.map(key)]);
  return types.filter((type) => type.ref.trim() && !taken.has(key(type.ref)));
}

/** Name of the added factor `index` (0 or 1) as printed: the appraiser's, or "Factor 1". */
export const extraFactorLabel = (columns: DemeritColumnsDto, index: number) => columns.extra[index]?.trim() || `Factor ${index + 1}`;

/**
 * The added factors of a row that enter the FRe: one per column the table
 * has, 1 where the row has none.
 */
export function extraFactorsOf(row: { extraFactors?: number[] }, columns: DemeritColumnsDto): number[] {
  return columns.extra.map((_, index) => {
    const value = row.extraFactors?.[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 1;
  });
}

/** A construction type as the construction section captures it: the single source of its surface, age and useful life. */
export type ConstructionTypeDto = {
  /**
   * The type's own row: it keeps the type, and the cost captured for it, when
   * its reference changes. A new type has none until it is saved; a client
   * that sends none is matched by reference.
   */
  id?: number;
  ref: string;
  description: string;
  classification: string;
  quality: string;
  area: number | null;
  age: number | null;
  usefulLife: number | null;
};

/** The construction section's list as the editor and the API exchange it. */
export type ConstructionTypesDto = { types: ConstructionTypeDto[]; locked: boolean; formulas: CapturedFormulas };

/** What the cost approach adds to a construction type it picked. */
export type ConstructionCostDto = {
  /** Reference of the type in the construction section. */
  ref: string;
  /** Cons. typed; empty to take the one of the calificación. */
  conservation: number | null;
  /** Calificación of the conservation (10 to 2, CONSERVATION_RATINGS); null when not rated. */
  conservationRating: number | null;
  /** The state picked in a criterion other than Ross-Heidecke; its factor was written in Cons. */
  conservationState?: string | null;
  /** Edad of the demerit factors (R26); empty to take the formula. */
  ageFactor: number | null;
  otherFactor: number;
  /** The factors added after "Otro", in the order of their columns (see CostColumnsDto); 1 when missing. */
  extraFactors?: number[];
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
  return { ref, conservation: null, conservationRating: null, ageFactor: null, otherFactor: 1, extraFactors: [], resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: null };
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

/**
 * Whether the construction types feed the cost approach on their own: they do
 * until every type with a reference was taken out of it (`excludedTypes`).
 */
export function constructionTypesLinkedToCosts(types: Pick<ConstructionTypeDto, "ref">[], columns: Pick<CostColumnsDto, "excludedTypes"> | undefined): boolean {
  const excluded = new Set((columns?.excludedTypes ?? []).map((ref) => ref.trim().toLowerCase()));
  const named = types.filter((type) => type.ref.trim());
  return !named.length || named.some((type) => !excluded.has(type.ref.trim().toLowerCase()));
}

/**
 * The capture of the cost approach as the server holds it, ready to be saved
 * again with one change (the types taken out, for one): the panel's draft
 * before anything is typed.
 */
export function costInputOf(calculation: CostCalculationDto): CostInputDto {
  return {
    land: calculation.land,
    constructions: calculation.constructions.map(constructionCostOf),
    installations: calculation.installations,
    indirects: calculation.indirects,
    rounding: calculation.rounding ?? DEFAULT_COST_ROUNDING,
    columns: costColumnsOf(calculation.columns),
    formulas: calculation.formulas ?? {},
  };
}

/** The cost columns of a construction, what the cost approach saves. */
export function constructionCostOf(row: ConstructionDto): ConstructionCostDto {
  return {
    ref: row.ref, conservation: row.conservation, conservationRating: row.conservationRating,
    ...(row.conservationState ? { conservationState: row.conservationState } : {}),
    ageFactor: row.ageFactor, otherFactor: row.otherFactor,
    extraFactors: row.extraFactors, resultantFactor: row.resultantFactor,
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
  /** Cons. typed; empty to take the one of the calificación. */
  conservation: number | null;
  /** Calificación of the conservation (10 to 2, CONSERVATION_RATINGS); null when not rated. */
  conservationRating: number | null;
  /** The state picked in a criterion other than Ross-Heidecke; its factor was written in Cons. */
  conservationState?: string | null;
  /** Printed in the installations table of the construction section; not part of the calculation. */
  maintenance: string;
  /**
   * The name the cost approach gives the installation when its link with the
   * description of the construction section is taken off (video 7.4, 28:00):
   * a short one for the cost tables, the long one stays there. Absent or
   * null, the description.
   */
  costName?: string | null;
  /** Edad of the demerit factors (R47); empty to take the formula. */
  ageFactor: number | null;
  otherFactor: number;
  /** The factors added after "Otro", in the order of their columns; 1 when missing. */
  extraFactors?: number[];
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

/** The factors with an Excel formula (and the calificación) may be left out by older clients: they take the formula. */
type WithFormulaFactors<T extends { resultantFactor: number | null }, K extends keyof T> =
  Omit<T, K | "resultantFactor"> & Partial<Pick<T, K | "resultantFactor">>;
type WithRating<T extends { conservationRating: number | null }> = Omit<T, "conservationRating"> & Partial<Pick<T, "conservationRating">>;

/**
 * What the cost approach saves. A construction row names a type of the
 * construction section; a row that still carries the type's data (captures
 * saved before the types had their own panel) creates the type if it is missing.
 */
export type CostInputDto = {
  land: WithFormulaFactors<CostLandDto, "surfaceFactor">;
  constructions: (WithRating<WithFormulaFactors<ConstructionCostDto, "ageFactor">> & Partial<Omit<ConstructionTypeDto, "ref">>)[];
  installations: WithRating<WithFormulaFactors<InstallationDto, "ageFactor">>[];
  indirects: IndirectDto[];
  rounding?: CostRoundingDto;
  /** Names of the demerit columns and the factors added; absent in older clients (the defaults). */
  columns?: CostColumnsDto;
  /** Formulas typed in the numeric fields, by path ("constructions.0.unitReplacementCost"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
};

/** Completion and undivided share are typed as percentages and stored as fractions. */
export const COST_PERCENT_FIELDS: PercentFields = (path) =>
  /^(constructions|installations)\.\d+\.(completion|undivided)$/.test(path) || /^indirects\.\d+\.percentage$/.test(path);

/** The engine settings of the cost approach: the roundings the appraiser chose and the valuation's precision. */
export function costEngineConfig(calculation: Pick<CostInputDto, "rounding"> & { precision?: CalculationPrecision | null }): EngineConfig {
  const config = calculation.rounding ? withRounding(DEFAULT_ENGINE_CONFIG, { costs: calculation.rounding }) : DEFAULT_ENGINE_CONFIG;
  return withPrecision(config, calculation.precision);
}

export type CostCalculationDto = Omit<CostInputDto, "land" | "constructions" | "installations"> & {
  /** The valuation's precision (decimals shown, calculating with them); missing, the behavior of before. */
  precision?: CalculationPrecision;
  land: CostLandDto;
  installations: InstallationDto[];
  /** The construction types picked by the cost approach, with their data from the construction section. */
  constructions: ConstructionDto[];
  /** Every construction type of the construction section, picked or not. */
  types: ConstructionTypeDto[];
  /** Formulas typed in the types' numeric fields in the construction section ("types.0.area"). */
  typeFormulas?: CapturedFormulas;
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
    conservation: null, conservationRating: null, maintenance: "", ageFactor: null, otherFactor: 1, extraFactors: [], resultantFactor: null, completion: 1, undivided: 1,
    unitReplacementCost: null,
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
    && positive(effectiveConservation(row)) && positive(row.unitReplacementCost);
}

/**
 * Something of the installation is captured (its description or any datum
 * of its own; the defaults of a new row do not count): it is saved, even
 * before it has its description.
 */
export function installationHasData(row: InstallationDto) {
  return Boolean(row.description.trim() || row.unit.trim() || row.maintenance.trim() || row.conservationState || row.costName?.trim())
    || [row.quantity, row.age, row.usefulLife, row.conservation, row.conservationRating, row.ageFactor, row.resultantFactor, row.unitReplacementCost].some((value) => value !== null && value !== undefined);
}

/**
 * What a row still lacks to enter the calculation, among what is captured in
 * the cost approach: marked in its cell from the start (video 8.7, 5:39), not
 * only once the column has figures. An installation without any datum is
 * not marked: it is a row being started.
 */
export function missingCostFields(row: ConstructionDto | InstallationDto, kind: "constructions" | "installations"): Array<"quantity" | "area" | "age" | "usefulLife" | "conservation" | "unitReplacementCost"> {
  if (kind === "installations" && !installationHasData(row as InstallationDto)) return [];
  const missing: Array<"quantity" | "area" | "age" | "usefulLife" | "conservation" | "unitReplacementCost"> = [];
  if (kind === "installations") {
    const installation = row as InstallationDto;
    if (!positive(installation.quantity)) missing.push("quantity");
    if (installation.age === null || installation.age < 0) missing.push("age");
    if (!positive(installation.usefulLife)) missing.push("usefulLife");
  } else {
    // The type's data, now captured in the cost approach's table too (video 8.14, 43:20).
    const construction = row as ConstructionDto;
    if (!positive(construction.area)) missing.push("area");
    if (construction.age === null || construction.age < 0) missing.push("age");
    if (!positive(construction.usefulLife)) missing.push("usefulLife");
  }
  if (!positive(effectiveConservation(row))) missing.push("conservation");
  if (!positive(row.unitReplacementCost)) missing.push("unitReplacementCost");
  return missing;
}

export function isInstallationComplete(row: InstallationDto) {
  return positive(row.quantity) && row.age !== null && row.age >= 0 && positive(row.usefulLife)
    && positive(effectiveConservation(row)) && positive(row.unitReplacementCost);
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

export function toCostEngineInput(
  calculation: Pick<CostCalculationDto, "land" | "market" | "constructions" | "installations" | "indirects"> & { columns?: CostColumnsDto },
):
  | { ok: true; input: CostApproachInput }
  | { ok: false; reason: string } {
  const { land } = calculation;
  const columns = calculation.columns ?? DEFAULT_COST_COLUMNS;
  // Only a table with added factors sends them, so the input of the others stays as it was.
  const extras = (row: { extraFactors?: number[] }, table: DemeritColumnsDto) => {
    const factors = extraFactorsOf(row, table);
    return factors.length ? { extraFactors: factors } : {};
  };
  const subjectArea = land.subjectArea ?? calculation.market.subjectArea;
  const unitValue = landUnitValue(calculation);
  const hasLand = positive(subjectArea) && positive(unitValue);
  const constructions = calculation.constructions.filter(isConstructionComplete);
  const installations = calculation.installations.filter(isInstallationComplete);
  const additions = costAdditionsOf(columns).map(({ label, amount }) => ({ label, amount }));
  if (!hasLand && !constructions.length && !installations.length && !additions.length) {
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
        conservation: effectiveConservation(row) as number,
        otherFactor: row.otherFactor,
        ...extras(row, columns.constructions),
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
        conservation: effectiveConservation(row) as number,
        otherFactor: row.otherFactor,
        ...extras(row, columns.installations),
        ...captured({ ageFactor: row.ageFactor, resultantFactor: row.resultantFactor }),
        completion: row.completion,
        undivided: row.undivided,
        unitReplacementCost: row.unitReplacementCost as number,
      })),
      indirects,
      ...(additions.length ? { additions } : {}),
    },
  };
}

/**
 * What the lote tipo field of the cost approach shows while it is empty:
 * where the measure comes from and the measure itself (video 8.7, 1:10:
 * «igual al sujeto… debería especificar el dato»).
 */
export function landReferencePlaceholder(calculation: Pick<CostCalculationDto, "land" | "market">): string {
  const area = (value: number) => `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²`;
  if (calculation.market.baseArea !== null) return `De mercado: ${area(calculation.market.baseArea)}`;
  const subject = calculation.land.subjectArea ?? calculation.market.subjectArea;
  return subject !== null && subject > 0 ? `Igual al sujeto: ${area(subject)}` : "Igual al sujeto (falta su superficie)";
}

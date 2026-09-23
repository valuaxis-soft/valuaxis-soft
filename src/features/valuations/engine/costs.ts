/**
 * Cost (physical) approach: land + constructions + special installations +
 * other assets + indirects. Formulas and multiplication order follow
 * docs/fase0/metodologia/01-costos.md, so the results match the Excel books.
 */
import type { EngineConfig } from "./config";
import { ageFactor, productInOrder, resolveFactorSlots, surfaceFactor, type FactorSlot } from "./factors";
import { roundIfSet } from "./rounding";
import { Trace } from "./trace";

export type UrbanLandInput = {
  kind: "urban";
  subjectArea: number;
  /** Lote tipo; the subject area when the appraiser values against the subject. */
  referenceArea: number;
  /** Unit value adopted in the market approach ($/m²). */
  marketUnitValue: number;
  surfacePower: number;
  /** Factors in capture order, with SURFACE_SLOT where the surface factor goes. */
  factors: FactorSlot[];
};

export type RuralLandInput = {
  kind: "rural";
  fractions: { label: string; areaSquareMetres: number; unitValuePerHectare: number; factor: number }[];
};

export type ConstructionInput = {
  ref: string;
  description?: string;
  area: number;
  age: number;
  usefulLife: number;
  conservation: number;
  otherFactor?: number;
  completion?: number;
  undivided?: number;
  /** Valor de reposición nuevo, $/m². */
  unitReplacementCost: number;
};

export type SpecialInstallationInput = {
  ref: string;
  description?: string;
  /** Privativa or común; informative, the total includes both. */
  share: "P" | "C";
  unit?: string;
  quantity: number;
  age: number;
  usefulLife: number;
  conservation: number;
  otherFactor?: number;
  completion?: number;
  undivided?: number;
  unitReplacementCost: number;
};

export type OtherAssetInput = {
  ref: string;
  description?: string;
  quantity: number;
  age: number;
  usefulLife: number;
  conservation: number;
  riskFactor: number;
  unitReplacementCost: number;
};

export type IndirectInput = { concept: string; percentage: number; base: number };

export type CostApproachInput = {
  land?: UrbanLandInput | RuralLandInput;
  constructions?: ConstructionInput[];
  specialInstallations?: SpecialInstallationInput[];
  otherAssets?: OtherAssetInput[];
  indirects?: IndirectInput[];
};

export type CostApproachResult = {
  land: number;
  constructions: number;
  specialInstallations: number;
  otherAssets: number;
  indirects: number;
  physicalValue: number;
};

export function computeCostApproach(input: CostApproachInput, config: EngineConfig, trace = new Trace()): CostApproachResult {
  const rounding = config.rounding.costs;
  const land = input.land ? costLand(input.land, config, trace) : 0;
  const constructions = input.constructions?.length ? costConstructions(input.constructions, config, trace) : 0;
  const specialInstallations = input.specialInstallations?.length ? costInstallations(input.specialInstallations, config, trace) : 0;
  const otherAssets = input.otherAssets?.length ? costOtherAssets(input.otherAssets, config, trace) : 0;
  const indirects = input.indirects?.length ? costIndirects(input.indirects, trace) : 0;

  const sum = land + constructions + specialInstallations + otherAssets + indirects;
  const physicalValue = trace.record({
    key: "costos.valorFisico",
    label: "Valor físico o directo",
    formula: "A + B + C + D + E",
    inputs: { A: land, B: constructions, C: specialInstallations, D: otherAssets, E: indirects },
    value: roundIfSet(sum, rounding.physicalValue),
    ...roundingField(rounding.physicalValue),
  });
  return { land, constructions, specialInstallations, otherAssets, indirects, physicalValue };
}

function roundingField(digits: number | null) {
  return digits === null ? {} : { rounding: digits };
}

function costLand(land: UrbanLandInput | RuralLandInput, config: EngineConfig, trace: Trace): number {
  const digits = config.rounding.costs.land;
  if (land.kind === "rural") {
    let subtotal = 0;
    land.fractions.forEach((fraction, index) => {
      const key = `costos.terreno.fraccion${index + 1}`;
      const unitValue = trace.record({
        key: `${key}.valorUnitarioResultante`,
        label: `Valor unitario resultante, fracción ${fraction.label}`,
        formula: "factor × valor unitario ($/ha)",
        inputs: { factor: fraction.factor, valorUnitario: fraction.unitValuePerHectare },
        value: fraction.factor * fraction.unitValuePerHectare,
      });
      subtotal += trace.record({
        key: `${key}.valorParcial`,
        label: `Valor parcial, fracción ${fraction.label}`,
        formula: "valor unitario resultante × superficie (m²) / 10,000",
        inputs: { valorUnitarioResultante: unitValue, superficie: fraction.areaSquareMetres },
        value: (unitValue * fraction.areaSquareMetres) / 10000,
      });
    });
    return trace.record({
      key: "costos.terreno.valor",
      label: "A) Valor del terreno",
      formula: "Σ valores parciales",
      inputs: { subtotal },
      value: roundIfSet(subtotal, digits),
      ...roundingField(digits),
    });
  }

  const unitValue = trace.record({
    key: "costos.terreno.valorUnitario",
    label: "Valor unitario de mercado",
    formula: "valor adoptado en el enfoque de mercado",
    inputs: { valorAdoptado: land.marketUnitValue },
    value: roundIfSet(land.marketUnitValue, config.rounding.costs.marketUnitValue),
    ...roundingField(config.rounding.costs.marketUnitValue),
  });
  const surface = trace.record({
    key: "costos.terreno.factorSuperficie",
    label: "Factor de superficie",
    formula: config.surfaceOrientation.costs === "reference-over-subject"
      ? "(lote tipo / superficie del sujeto)^(1/n)"
      : "(superficie del sujeto / lote tipo)^(1/n)",
    inputs: { loteTipo: land.referenceArea, superficieSujeto: land.subjectArea, n: land.surfacePower },
    value: surfaceFactor(land.referenceArea, land.subjectArea, land.surfacePower, config.surfaceOrientation.costs),
  });
  const factors = resolveFactorSlots(land.factors, surface);
  const resultant = trace.record({
    key: "costos.terreno.factorResultante",
    label: "Factor resultante",
    formula: factors.map((factor) => factor.key).join(" × "),
    inputs: Object.fromEntries(factors.map((factor) => [factor.key, factor.value])),
    value: productInOrder(factors.map((factor) => factor.value)),
  });
  const netUnitValue = trace.record({
    key: "costos.terreno.valorUnitarioNeto",
    label: "Valor unitario neto",
    formula: "factor resultante × valor unitario",
    inputs: { factorResultante: resultant, valorUnitario: unitValue },
    value: resultant * unitValue,
  });
  const partial = trace.record({
    key: "costos.terreno.valorParcial",
    label: "Valor parcial del terreno",
    formula: "valor unitario neto × superficie del sujeto",
    inputs: { valorUnitarioNeto: netUnitValue, superficieSujeto: land.subjectArea },
    value: netUnitValue * land.subjectArea,
  });
  return trace.record({
    key: "costos.terreno.valor",
    label: "A) Valor del terreno",
    formula: "valor parcial",
    inputs: { valorParcial: partial },
    value: roundIfSet(partial, digits),
    ...roundingField(digits),
  });
}

function costConstructions(rows: ConstructionInput[], config: EngineConfig, trace: Trace): number {
  let subtotal = 0;
  let totalArea = 0;
  for (const row of rows) {
    const key = `costos.construcciones.${row.ref}`;
    const other = row.otherFactor ?? 1;
    const completion = row.completion ?? 1;
    const undivided = row.undivided ?? 1;
    const age = trace.record({
      key: `${key}.factorEdad`,
      label: `Factor de edad ${row.ref}`,
      formula: `1 − (edad / vida útil)^${config.ageFactor.exponent}`,
      inputs: { edad: row.age, vidaUtil: row.usefulLife },
      value: ageFactor(row.age, row.usefulLife, config.ageFactor.exponent, config.ageFactor.floor),
    });
    const resultant = trace.record({
      key: `${key}.factorResultante`,
      label: `Factor resultante ${row.ref}`,
      formula: "conservación × edad × otro",
      inputs: { conservacion: row.conservation, edad: age, otro: other },
      value: row.conservation * age * other,
    });
    trace.record({
      key: `${key}.vrnParcial`,
      label: `Valor de reposición nuevo ${row.ref}`,
      formula: "VRN unitario × superficie",
      inputs: { vrnUnitario: row.unitReplacementCost, superficie: row.area },
      value: row.unitReplacementCost * row.area,
    });
    const netUnit = trace.record({
      key: `${key}.vnrUnitario`,
      label: `Valor neto de reposición unitario ${row.ref}`,
      formula: "factor resultante × VRN unitario",
      inputs: { factorResultante: resultant, vrnUnitario: row.unitReplacementCost },
      value: resultant * row.unitReplacementCost,
    });
    subtotal += trace.record({
      key: `${key}.vnrParcial`,
      label: `Valor neto de reposición ${row.ref}`,
      formula: "VNR unitario × superficie × grado de terminación × indiviso",
      inputs: { vnrUnitario: netUnit, superficie: row.area, gradoTerminacion: completion, indiviso: undivided },
      value: netUnit * row.area * completion * undivided,
    });
    totalArea += row.area;
  }
  const digits = config.rounding.costs.constructions;
  const value = trace.record({
    key: "costos.construcciones.valor",
    label: "B) Valor de las construcciones",
    formula: "Σ VNR parciales",
    inputs: { subtotal },
    value: roundIfSet(subtotal, digits),
    ...roundingField(digits),
  });
  trace.record({
    key: "costos.construcciones.valorUnitarioMedio",
    label: "Valor unitario medio de construcción",
    formula: "B / superficie construida total",
    inputs: { B: value, superficie: totalArea },
    value: value / totalArea,
  });
  return value;
}

function costInstallations(rows: SpecialInstallationInput[], config: EngineConfig, trace: Trace): number {
  let subtotal = 0;
  let privateSum = 0;
  let commonSum = 0;
  for (const row of rows) {
    const key = `costos.instalaciones.${row.ref}`;
    const other = row.otherFactor ?? 1;
    const completion = row.completion ?? 1;
    const undivided = row.undivided ?? 1;
    const age = ageFactor(row.age, row.usefulLife, config.ageFactor.exponent, config.ageFactor.floor);
    const resultant = trace.record({
      key: `${key}.factorResultante`,
      label: `Factor resultante ${row.ref}`,
      formula: `conservación × (1 − (edad / vida útil)^${config.ageFactor.exponent}) × otro`,
      inputs: { conservacion: row.conservation, edad: row.age, vidaUtil: row.usefulLife, factorEdad: age, otro: other },
      value: row.conservation * age * other,
    });
    trace.record({
      key: `${key}.vrnParcial`,
      label: `Valor de reposición nuevo ${row.ref}`,
      formula: "cantidad × VRN unitario",
      inputs: { cantidad: row.quantity, vrnUnitario: row.unitReplacementCost },
      value: row.quantity * row.unitReplacementCost,
    });
    const netUnit = trace.record({
      key: `${key}.vnrUnitario`,
      label: `Valor neto de reposición unitario ${row.ref}`,
      formula: "factor resultante × VRN unitario",
      inputs: { factorResultante: resultant, vrnUnitario: row.unitReplacementCost },
      value: resultant * row.unitReplacementCost,
    });
    const partial = trace.record({
      key: `${key}.vnrParcial`,
      label: `Valor neto de reposición ${row.ref}`,
      formula: "VNR unitario × cantidad × indiviso × grado de terminación",
      inputs: { vnrUnitario: netUnit, cantidad: row.quantity, indiviso: undivided, gradoTerminacion: completion },
      value: netUnit * row.quantity * undivided * completion,
    });
    subtotal += partial;
    if (row.share === "P") privateSum += partial;
    else commonSum += partial;
  }
  trace.record({ key: "costos.instalaciones.privativas", label: "Suma privativa", formula: "Σ partidas privativas", inputs: {}, value: privateSum });
  trace.record({ key: "costos.instalaciones.comunes", label: "Suma común", formula: "Σ partidas comunes", inputs: {}, value: commonSum });
  const digits = config.rounding.costs.installations;
  return trace.record({
    key: "costos.instalaciones.valor",
    label: "C) Instalaciones especiales, elementos accesorios y obras complementarias",
    formula: "Σ VNR parciales",
    inputs: { subtotal },
    value: roundIfSet(subtotal, digits),
    ...roundingField(digits),
  });
}

function costOtherAssets(rows: OtherAssetInput[], config: EngineConfig, trace: Trace): number {
  let subtotal = 0;
  for (const row of rows) {
    const key = `costos.otrosBienes.${row.ref}`;
    const age = ageFactor(row.age, row.usefulLife, config.ageFactor.exponent, config.ageFactor.floor);
    const resultant = trace.record({
      key: `${key}.factorResultante`,
      label: `Factor resultante ${row.ref}`,
      formula: "conservación × edad × riesgo",
      inputs: { conservacion: row.conservation, factorEdad: age, riesgo: row.riskFactor },
      value: row.conservation * age * row.riskFactor,
    });
    subtotal += trace.record({
      key: `${key}.vnrParcial`,
      label: `Valor neto de reposición ${row.ref}`,
      formula: "factor resultante × VRN unitario × cantidad",
      inputs: { factorResultante: resultant, vrnUnitario: row.unitReplacementCost, cantidad: row.quantity },
      value: resultant * row.unitReplacementCost * row.quantity,
    });
  }
  const digits = config.rounding.costs.otherAssets;
  return trace.record({
    key: "costos.otrosBienes.valor",
    label: "D) Bienes distintos a la tierra",
    formula: "Σ VNR parciales",
    inputs: { subtotal },
    value: roundIfSet(subtotal, digits),
    ...roundingField(digits),
  });
}

function costIndirects(rows: IndirectInput[], trace: Trace): number {
  let total = 0;
  rows.forEach((row, index) => {
    total += trace.record({
      key: `costos.indirectos.${index + 1}`,
      label: row.concept,
      formula: "porcentaje × base",
      inputs: { porcentaje: row.percentage, base: row.base },
      value: row.percentage * row.base,
    });
  });
  return trace.record({ key: "costos.indirectos.valor", label: "E) Indirectos", formula: "Σ indirectos", inputs: {}, value: total });
}

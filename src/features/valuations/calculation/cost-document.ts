/**
 * Turns the cost calculation into the dictamen: one generated block in the
 * cost section, laid out as the appraiser's own format (A land, B
 * constructions, C special installations, D indirect costs, each with its
 * boxed value, and the physical value at the end). The tables of the
 * construction section are the capture of the types and the installations
 * (construction-capture.ts).
 */
import type { CostApproachResult } from "../engine/costs";
import type { Trace } from "../engine/trace";
import type { Apartado, Block, TableContent } from "../model";
import { ensureTableV2, type TableSummaryBox } from "../services/table";
import {
  LAND_FACTORS,
  LAND_FACTOR_SHORT_LABELS,
  costColumnsOf,
  effectiveConservation,
  extraFactorLabel,
  extraFactorsOf,
  landReferenceArea,
  type CostCalculationDto,
  type DemeritColumnsDto,
} from "./cost-types";
import { factorDecimals } from "./calculation-precision";
import {
  EMPTY,
  figure,
  figureColumn,
  generatedApartado,
  generatedBlock,
  generatedTable,
  money,
  moneyColumn,
  percent,
  resultantColumn,
  squareMetres,
  textColumn,
  whole,
} from "./generated-content";
import { GENERATED_BLOCK_PREFIX } from "./market-document";

const PREFIX = `${GENERATED_BLOCK_PREFIX}costos-enfoque`;

/** Template blocks of the cost section that the generated blocks stand in for. */
export const COST_TEMPLATE_BLOCK_IDS = [
  "costos-block-1-terreno",
  "costos-block-2-construcciones",
  "costos-block-3-instalaciones-especiales-elementos-accesorios-y-obras-complementarias",
  "costos-block-4-resumen-del-enfoque-de-costos",
];

const DEMERIT = "Factores de Demérito";
const NEW_VALUE = "Valor de Reposición Nuevo (VRN)";
const NET_VALUE = "Valor Neto de Reposición (VNR)";
/** Cons., Edad, "Otro" as the appraiser named it, the factors added after it and FRe, in bold. */
const demeritColumns = (columns: DemeritColumnsDto) => [
  ...["Cons.", "Edad", columns.other].map((name) => figureColumn(name, { group: DEMERIT })),
  ...columns.extra.map((_, index) => figureColumn(extraFactorLabel(columns, index), { group: DEMERIT })),
  resultantColumn("FRe", DEMERIT),
];
const remainingLife = (usefulLife: number | null, age: number | null) =>
  (usefulLife !== null && age !== null ? whole(Math.max(usefulLife - age, 0)) : EMPTY);

/** The block of the cost section. None while nothing is captured. */
export function costDocumentBlocks(calculation: CostCalculationDto, result: CostApproachResult | null, trace: Trace | null): Block[] {
  if (!result || !trace) return [];
  const value = (key: string) => trace.find(key)?.value;
  const input = (key: string, name: string) => {
    const found = trace.find(key)?.inputs[name];
    return typeof found === "number" ? found : undefined;
  };
  const amount = (key: string) => money(value(key) ?? 0);
  const columns = costColumnsOf(calculation.columns);
  // Factors with the decimals of the valuation (two unless it chose four).
  const decimals = factorDecimals(calculation.precision);
  const factor = (found: number | null | undefined) => figure(found, decimals);
  const apartados: Apartado[] = [];

  if (value("costos.terreno.valor") !== undefined) {
    const land = calculation.land;
    const area = land.subjectArea ?? calculation.market.subjectArea ?? 0;
    const referenceArea = input("costos.terreno.factorSuperficie", "loteTipo") ?? area;
    const againstSubject = landReferenceArea(calculation).source === "subject";
    const group = "Factores de Homologación";
    apartados.push(generatedApartado(`${PREFIX}-terreno`, "A) TERRENO EN ESTUDIO", {
      tables: [generatedTable(`${PREFIX}-tabla-terreno`, "Terreno",
        [
          figureColumn("Fracción"), figureColumn("Superficie de Sujeto (m²)"), moneyColumn("Valor Unitario ($/m²)"),
          ...LAND_FACTORS.map((factor) => figureColumn(LAND_FACTOR_SHORT_LABELS[factor.key], { group })),
          resultantColumn("FRe", group),
          moneyColumn("Valor Unitario Neto $/m²"), moneyColumn("Valor Parcial $"),
        ],
        [[
          "I", figure(area), amount("costos.terreno.valorUnitario"),
          ...LAND_FACTORS.map((item) => factor(item.key === "surface" ? value("costos.terreno.factorSuperficie") : land.factors[item.key])),
          factor(value("costos.terreno.factorResultante")),
          amount("costos.terreno.valorUnitarioNeto"), amount("costos.terreno.valorParcial"),
        ]],
        { summaryBoxes: [
          // Homologated against the subject (no lote tipo), the measure is the subject's and says so.
          { id: "lote-tipo", position: "top", align: "start", rows: [{ label: againstSubject ? "Lote Sujeto:" : "Lote Tipo:", value: squareMetres(referenceArea) }] },
          { id: "valor-mercado", position: "top", align: "end", rows: [{ label: "Valor comparativo de Mercado ($/m²):", value: amount("costos.terreno.valorUnitario") }] },
          { id: "superficie", position: "bottom", align: "start", rows: [{ label: "Superficie valuada:", value: squareMetres(area) }] },
          { id: "medio", position: "bottom", align: "center", rows: [{ label: "Valor Unitario Medio ($/m²):", value: amount("costos.terreno.valorUnitarioNeto") }] },
          { id: "valor", position: "bottom", align: "end", rows: [{ label: "A) Valor del Terreno:", value: money(result.land), emphasis: "strong" }] },
        ] })],
    }));
  }

  const constructions = calculation.constructions.filter((row) => value(`costos.construcciones.${row.ref}.vnrParcial`) !== undefined);
  if (constructions.length) {
    const builtArea = constructions.reduce((sum, row) => sum + (row.area ?? 0), 0);
    const type = [figureColumn("Ref."), textColumn("Tipo de Construcción"), figureColumn("Superficie Construida (m²)")];
    apartados.push(generatedApartado(`${PREFIX}-construcciones`, "B) CONSTRUCCIONES", {
      tables: [
        generatedTable(`${PREFIX}-tabla-construcciones-tipos`, "Tipos de construcción",
          [
            ...type, figureColumn("Edad"), figureColumn("Vida útil"), figureColumn("Vida remanente"),
            ...demeritColumns(columns.constructions), figureColumn("Grado de terminación"), figureColumn("Indiviso"),
          ],
          constructions.map((row) => {
            const key = `costos.construcciones.${row.ref}`;
            return [
              row.ref, row.description || EMPTY, figure(row.area), whole(row.age), whole(row.usefulLife), remainingLife(row.usefulLife, row.age),
              factor(effectiveConservation(row)), factor(value(`${key}.factorEdad`)), factor(row.otherFactor),
              ...extraFactorsOf(row, columns.constructions).map((extra) => factor(extra)), factor(value(`${key}.factorResultante`)),
              percent(row.completion), percent(row.undivided),
            ];
          }),
          { rowKeys: constructions.map((row) => row.ref) }),
        generatedTable(`${PREFIX}-tabla-construcciones-valores`, "Valor de las construcciones",
          [
            ...type,
            moneyColumn("Valor Unit. $", NEW_VALUE), moneyColumn("Valor Parcial VRN $", NEW_VALUE),
            resultantColumn("Factor Resultante"),
            moneyColumn("Valor Unit. $", NET_VALUE), moneyColumn("Valor Parcial VNR $", NET_VALUE),
          ],
          constructions.map((row) => {
            const key = `costos.construcciones.${row.ref}`;
            return [
              row.ref, row.description || EMPTY, figure(row.area),
              money(row.unitReplacementCost ?? 0), amount(`${key}.vrnParcial`),
              factor(value(`${key}.factorResultante`)),
              amount(`${key}.vnrUnitario`), amount(`${key}.vnrParcial`),
            ];
          }),
          { rowKeys: constructions.map((row) => row.ref), summaryBoxes: [
            { id: "subtotal", position: "bottom", align: "end", rows: [{ label: "Subtotal:", value: money(input("costos.construcciones.valor", "subtotal") ?? result.constructions) }] },
            { id: "superficie", position: "bottom", align: "start", rows: [{ label: "Superficie valuada:", value: squareMetres(builtArea) }] },
            { id: "medio", position: "bottom", align: "center", rows: [{ label: "Valor Unitario Medio ($/m²):", value: amount("costos.construcciones.valorUnitarioMedio") }] },
            { id: "valor", position: "bottom", align: "end", rows: [{ label: "B) Valor de las Construcciones:", value: money(result.constructions), emphasis: "strong" }] },
          ] }),
      ],
    }));
  }

  const installations = calculation.installations.filter((row) => value(`costos.instalaciones.${row.ref}.vnrParcial`) !== undefined);
  if (installations.length) {
    const item = [figureColumn("P/C"), figureColumn("Ref."), textColumn("Descripción"), figureColumn("Unidad"), figureColumn("Cant.")];
    const itemCells = (row: (typeof installations)[number]) => [row.share, row.ref, row.description, row.unit || EMPTY, figure(row.quantity)];
    apartados.push(generatedApartado(`${PREFIX}-instalaciones`, "C) INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (IE, EA, OC)", {
      tables: [
        generatedTable(`${PREFIX}-tabla-instalaciones-partidas`, "Partidas de instalaciones especiales",
          [
            ...item, figureColumn("Edad"), figureColumn("Vida útil"), figureColumn("Vida remanente"),
            ...demeritColumns(columns.installations), figureColumn("Grado de terminación"), figureColumn("Indiviso"),
          ],
          installations.map((row) => {
            const key = `costos.instalaciones.${row.ref}`;
            return [
              ...itemCells(row), whole(row.age), whole(row.usefulLife), remainingLife(row.usefulLife, row.age),
              factor(effectiveConservation(row)), factor(value(`${key}.factorEdad`)), factor(row.otherFactor),
              ...extraFactorsOf(row, columns.installations).map((extra) => factor(extra)), factor(value(`${key}.factorResultante`)),
              percent(row.completion), percent(row.undivided),
            ];
          }),
          { rowKeys: installations.map((row) => row.ref) }),
        generatedTable(`${PREFIX}-tabla-instalaciones-valores`, "Valor de las instalaciones especiales",
          [
            ...item,
            moneyColumn("Valor Unit. $", NEW_VALUE), moneyColumn("Valor Parcial VRN $", NEW_VALUE),
            resultantColumn("F. Result."),
            moneyColumn("Valor Unit. $", NET_VALUE), moneyColumn("Valor Parcial VNR $", NET_VALUE),
          ],
          installations.map((row) => {
            const key = `costos.instalaciones.${row.ref}`;
            return [
              ...itemCells(row),
              money(row.unitReplacementCost ?? 0), amount(`${key}.vrnParcial`),
              factor(value(`${key}.factorResultante`)),
              amount(`${key}.vnrUnitario`), amount(`${key}.vnrParcial`),
            ];
          }),
          { rowKeys: installations.map((row) => row.ref), summaryBoxes: [
            {
              id: "sumas",
              position: "bottom",
              align: "end",
              rows: [
                { label: "Suma Privativa (P):", value: amount("costos.instalaciones.privativas") },
                { label: "Suma Común (C):", value: amount("costos.instalaciones.comunes") },
                { label: "Subtotal:", value: money(input("costos.instalaciones.valor", "subtotal") ?? result.specialInstallations) },
              ],
            },
            {
              id: "valor",
              position: "bottom",
              align: "end",
              rows: [{
                label: "C) Valor de Instalaciones Especiales, Elementos Accesorios y Obras Complementarias:",
                value: money(result.specialInstallations),
                emphasis: "strong",
              }],
            },
          ] }),
      ],
    }));
  }

  if (result.indirects) {
    // The engine numbers the indirects it receives: the rows with a concept and a percentage.
    const indirects = calculation.indirects.filter((row) => row.concept.trim() && (row.percentage ?? 0) > 0);
    // Letter D and the wording of the appraiser's TCH book ("D) Costos Indirectos"); the table prints here, not in an annex.
    apartados.push(generatedApartado(`${PREFIX}-indirectos`, "D) COSTOS INDIRECTOS", {
      tables: [generatedTable(`${PREFIX}-tabla-indirectos`, "Indirectos",
        [textColumn("Concepto"), figureColumn("Porcentaje"), moneyColumn("Base $"), moneyColumn("Importe $")],
        indirects.map((row, index) => {
          const key = `costos.indirectos.${index + 1}`;
          return [row.concept, percent(row.percentage ?? 0, 2), money(input(key, "base") ?? 0), amount(key)];
        }),
        { summaryBoxes: [{ id: "valor", position: "bottom", align: "end", rows: [{ label: "D) Costos Indirectos:", value: money(result.indirects), emphasis: "strong" }] }] })],
    }));
  }

  // The physical value closes the page, under the last table, with the parts it adds up.
  const last = apartados.at(-1);
  if (!last) return [];
  const parts = [
    ...(value("costos.terreno.valor") !== undefined ? [{ letter: "A", label: "A) Valor del Terreno:", amount: result.land }] : []),
    ...(constructions.length ? [{ letter: "B", label: "B) Valor de las Construcciones:", amount: result.constructions }] : []),
    ...(installations.length ? [{ letter: "C", label: "C) Valor de Instalaciones Especiales:", amount: result.specialInstallations }] : []),
    ...(result.indirects ? [{ letter: "D", label: "D) Costos Indirectos:", amount: result.indirects }] : []),
  ];
  const closing: TableSummaryBox = {
    id: "valor-fisico",
    position: "bottom",
    align: "end",
    rows: [
      ...parts.map((part) => ({ id: part.letter, label: part.label, value: money(part.amount) })),
      // As the appraiser's current book closes the page (Bugambilias, video of 20 Oct 2026; REAL_ARANDAS).
      { id: "total", label: `VALOR FÍSICO DE REPOSICIÓN (${parts.map((part) => part.letter).join("+")}):`, value: money(result.physicalValue), emphasis: "total" },
    ],
  };
  const closed = { ...last, tables: last.tables.map((item, index) => (index === last.tables.length - 1 ? withSummaryBox(item, closing) : item)) };
  return [generatedBlock(PREFIX, "ENFOQUE FÍSICO O DE COSTOS", { apartados: [...apartados.slice(0, -1), closed] })];
}

/** The table with one more summary box after the ones it has. */
export function withSummaryBox(tableItem: TableContent, box: TableSummaryBox): TableContent {
  const normalized = ensureTableV2(tableItem);
  const schema = normalized.schema ?? { zones: [] };
  return { ...normalized, schema: { ...schema, summaryBoxes: [...(schema.summaryBoxes ?? []), box] } } as unknown as TableContent;
}

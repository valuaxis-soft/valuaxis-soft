/**
 * Turns the cost calculation into the dictamen: one generated block in the
 * cost section, laid out as the appraiser's own format (A land, B
 * constructions, C special installations, D indirect costs, each with its
 * boxed value, and the physical value at the end). The tables of the
 * construction section are the capture of the types and the installations
 * (construction-capture.ts).
 */
import { demeritPreview, type CostApproachResult } from "../engine/costs";
import type { Trace } from "../engine/trace";
import type { Apartado, Block, TableContent } from "../model";
import { ensureTableV2, type TableSummaryBox } from "../services/table";
import {
  LAND_FACTORS,
  LAND_FACTOR_SHORT_LABELS,
  costColumnsOf,
  costEngineConfig,
  conservationText,
  costAdditionsOf,
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
  generatedColumnId,
  generatedRowIds,
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
const INDIRECT_COLUMNS = [textColumn("Concepto"), figureColumn("Porcentaje"), moneyColumn("Base $"), moneyColumn("Importe $")];
const remainingLife = (usefulLife: number | null, age: number | null) =>
  (usefulLife !== null && age !== null ? whole(Math.max(usefulLife - age, 0)) : EMPTY);

/** The name an installation prints with in the cost approach: its own (unlinked) or the description. */
export const installationName = (row: { description: string; costName?: string | null }) => row.costName?.trim() || row.description;

/**
 * The block of the cost section. None while nothing is captured; the
 * installations captured print as soon as they are, with what they have
 * (video 7.4, 24:21): their figures fill in when their value is written.
 */
export function costDocumentBlocks(
  calculation: CostCalculationDto,
  result: CostApproachResult | null,
  trace: Trace | null,
  /** `capture`: the page as the editor captures in it, with the land and every construction though they have no value yet; never saved. */
  options: { capture?: boolean } = {},
): Block[] {
  const capture = Boolean(options.capture);
  const capturedInstallations = calculation.installations;
  if ((!result || !trace) && !capturedInstallations.length && !capture) return [];
  const value = (key: string) => trace?.find(key)?.value;
  const input = (key: string, name: string) => {
    const found = trace?.find(key)?.inputs[name];
    return typeof found === "number" ? found : undefined;
  };
  const amount = (key: string) => money(value(key) ?? 0);
  // The land and the constructions print only with their values, that is, with a result.
  const totals: CostApproachResult = result ?? { land: 0, constructions: 0, specialInstallations: 0, otherAssets: 0, indirects: 0, physicalValue: 0 };
  const columns = costColumnsOf(calculation.columns);
  // Factors with the decimals of the valuation (two unless it chose four).
  const decimals = factorDecimals(calculation.precision);
  const factor = (found: number | null | undefined) => figure(found, decimals);
  // Being captured, the Cons. cell holds what is written in it («Nuevo = 0.98»), so its column is as wide as that; printed, the factor.
  const consCell = (row: { conservation: number | null; conservationRating?: number | null; conservationState?: string | null }) =>
    (capture && row.conservationState && row.conservation !== null ? conservationText(row) : factor(effectiveConservation(row)));
  const apartados: Apartado[] = [];

  if (value("costos.terreno.valor") !== undefined || capture) {
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
          { id: "valor", position: "bottom", align: "end", rows: [{ label: "A) Valor del Terreno:", value: money(totals.land), emphasis: "strong" }] },
        ] })],
    }));
  }

  const constructions = calculation.constructions.filter((row) => capture || value(`costos.construcciones.${row.ref}.vnrParcial`) !== undefined);
  // Being captured, B) is always on the page, with no row yet: it is where a construction is added (video 8.14, 42:27:
  // «me desaparecieron… B», the page showed only A and C while the valuation had no construction type).
  if (constructions.length || capture) {
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
              consCell(row), factor(value(`${key}.factorEdad`)), factor(row.otherFactor),
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
            { id: "subtotal", position: "bottom", align: "end", rows: [{ label: "Subtotal:", value: money(input("costos.construcciones.valor", "subtotal") ?? totals.constructions) }] },
            { id: "superficie", position: "bottom", align: "start", rows: [{ label: "Superficie valuada:", value: squareMetres(builtArea) }] },
            { id: "medio", position: "bottom", align: "center", rows: [{ label: "Valor Unitario Medio ($/m²):", value: amount("costos.construcciones.valorUnitarioMedio") }] },
            { id: "valor", position: "bottom", align: "end", rows: [{ label: "B) Valor de las Construcciones:", value: money(totals.constructions), emphasis: "strong" }] },
          ] }),
      ],
    }));
  }

  // An installation that does not enter the calculation yet prints what it has: its Edad and FRe as the calculation would give them, dashes for its values.
  const installations = capturedInstallations;
  const valued = installations.filter((row) => value(`costos.instalaciones.${row.ref}.vnrParcial`) !== undefined);
  if (installations.length) {
    const config = costEngineConfig(calculation);
    const demerit = (row: (typeof installations)[number]) => {
      const key = `costos.instalaciones.${row.ref}`;
      if (value(`${key}.vnrParcial`) !== undefined) return { age: value(`${key}.factorEdad`), resultant: value(`${key}.factorResultante`) };
      const extras = extraFactorsOf(row, columns.installations);
      const preview = demeritPreview({
        ref: row.ref, age: row.age, usefulLife: row.usefulLife, conservation: effectiveConservation(row), otherFactor: row.otherFactor,
        ...(row.ageFactor === null ? {} : { ageFactor: row.ageFactor }),
        ...(row.resultantFactor === null ? {} : { resultantFactor: row.resultantFactor }),
        ...(extras.length ? { extraFactors: extras } : {}),
      }, config);
      return { age: preview.ageFactor, resultant: preview.resultantFactor };
    };
    const totalNewValue = valued.reduce((sum, row) => sum + (value(`costos.instalaciones.${row.ref}.vrnParcial`) ?? 0), 0);
    const priced = (row: (typeof installations)[number], key: string) => value(`costos.instalaciones.${row.ref}.vnrParcial`) !== undefined ? amount(key) : EMPTY;
    const item = [figureColumn("P/C"), figureColumn("Ref."), textColumn("Descripción"), figureColumn("Unidad"), figureColumn("Cant.")];
    const itemCells = (row: (typeof installations)[number]) => [row.share, row.ref, installationName(row) || EMPTY, row.unit || EMPTY, figure(row.quantity)];
    apartados.push(generatedApartado(`${PREFIX}-instalaciones`, "C) INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (IE, EA, OC)", {
      tables: [
        generatedTable(`${PREFIX}-tabla-instalaciones-partidas`, "Partidas de instalaciones especiales",
          [
            ...item, figureColumn("Edad"), figureColumn("Vida útil"), figureColumn("Vida remanente"),
            ...demeritColumns(columns.installations), figureColumn("Grado de terminación"), figureColumn("Indiviso"),
          ],
          installations.map((row) => {
            const factors = demerit(row);
            return [
              ...itemCells(row), whole(row.age), whole(row.usefulLife), remainingLife(row.usefulLife, row.age),
              consCell(row), factor(factors.age), factor(row.otherFactor),
              ...extraFactorsOf(row, columns.installations).map((extra) => factor(extra)), factor(factors.resultant),
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
            const isValued = value(`${key}.vnrParcial`) !== undefined;
            return [
              ...itemCells(row),
              isValued || row.unitReplacementCost !== null ? money(row.unitReplacementCost ?? 0) : EMPTY, priced(row, `${key}.vrnParcial`),
              factor(demerit(row).resultant),
              priced(row, `${key}.vnrUnitario`), priced(row, `${key}.vnrParcial`),
            ];
          }),
          { rowKeys: installations.map((row) => row.ref), summaryBoxes: [
            // The total of the VRN column, then the sums and the VNR, as the appraiser's book (video 8.7, 11:55).
            {
              id: "vrn",
              position: "bottom",
              align: "center",
              rows: [{ id: "total", label: "Valor de Reposición Nuevo (V.R.N.):", value: valued.length ? money(totalNewValue) : EMPTY }],
            },
            {
              id: "sumas",
              position: "bottom",
              align: "end",
              // Their ids are their places of before, so a label the appraiser renamed stays on its row.
              rows: [
                { id: "0", label: "Suma Privativa (P):", value: valued.length ? amount("costos.instalaciones.privativas") : EMPTY },
                { id: "1", label: "Suma Común (C):", value: valued.length ? amount("costos.instalaciones.comunes") : EMPTY },
                { id: "2", label: "Valor Neto de Reposición (V.N.R.):", value: valued.length && result ? money(input("costos.instalaciones.valor", "subtotal") ?? result.specialInstallations) : EMPTY },
              ],
            },
            {
              id: "valor",
              position: "bottom",
              align: "end",
              rows: [{
                label: "C) Valor de Instalaciones Especiales, Elementos Accesorios y Obras Complementarias:",
                value: valued.length && result ? money(result.specialInstallations) : EMPTY,
                emphasis: "strong",
              }],
            },
          ] }),
      ],
    }));
  }

  // The engine numbers the indirects it receives: the rows with a concept and a percentage.
  const entersIndirects = (row: (typeof calculation.indirects)[number]) => Boolean(row.concept.trim()) && (row.percentage ?? 0) > 0;
  const valuedIndirects = calculation.indirects.filter(entersIndirects);
  if (capture && calculation.indirects.length && !result?.indirects) {
    // Being captured: the rows as they are, the ones that already enter the calculation first, as it numbers them.
    const rows = [...valuedIndirects, ...calculation.indirects.filter((row) => !entersIndirects(row))];
    apartados.push(generatedApartado(`${PREFIX}-indirectos`, "D) COSTOS INDIRECTOS", {
      tables: [generatedTable(`${PREFIX}-tabla-indirectos`, "Indirectos", INDIRECT_COLUMNS,
        rows.map((row) => [row.concept, row.percentage === null ? EMPTY : percent(row.percentage, 2), EMPTY, EMPTY]))],
    }));
  }

  // Without a result (only installations without their value), the page shows them and no physical value yet.
  if (!result) return apartados.length ? [generatedBlock(PREFIX, "ENFOQUE FÍSICO O DE COSTOS", { apartados })] : [];

  if (result.indirects) {
    const pendingIndirects = capture ? calculation.indirects.filter((row) => !entersIndirects(row)) : [];
    const indirects = valuedIndirects;
    // Letter D and the wording of the appraiser's TCH book ("D) Costos Indirectos"); the table prints here, not in an annex.
    apartados.push(generatedApartado(`${PREFIX}-indirectos`, "D) COSTOS INDIRECTOS", {
      tables: [generatedTable(`${PREFIX}-tabla-indirectos`, "Indirectos", INDIRECT_COLUMNS,
        [
          ...indirects.map((row, index) => {
            const key = `costos.indirectos.${index + 1}`;
            return [row.concept, percent(row.percentage ?? 0, 2), money(input(key, "base") ?? 0), amount(key)];
          }),
          ...pendingIndirects.map((row) => [row.concept, row.percentage === null ? EMPTY : percent(row.percentage, 2), EMPTY, EMPTY]),
        ],
        { summaryBoxes: [{ id: "valor", position: "bottom", align: "end", rows: [{ label: "D) Costos Indirectos:", value: money(result.indirects), emphasis: "strong" }] }] })],
    }));
  }

  // The physical value closes the page, under the last table, with the parts it adds up.
  const last = apartados.at(-1);
  if (!last) return [];
  // A, B and C are always listed, with what each one adds (zero when there is none): the sum reads as the
  // appraiser's book, and a part missing shows (video 8.14, 43:08: «valor del terreno, valor de las
  // construcciones y valor de las instalaciones»; the sum said A+C and nobody saw that B was not there).
  const additions = costAdditionsOf(calculation.columns);
  const parts = [
    { letter: "A", label: "A) Valor del Terreno:", amount: result.land },
    { letter: "B", label: "B) Valor de las Construcciones:", amount: result.constructions },
    { letter: "C", label: "C) Valor de Instalaciones Especiales:", amount: result.specialInstallations },
    ...(result.indirects ? [{ letter: "D", label: "D) Costos Indirectos:", amount: result.indirects }] : []),
    // The values the appraiser added, each with the next letter (E, F…), as lines of the same summary that the sum adds.
    ...additions.map((item, index) => {
      const letter = String.fromCharCode("E".charCodeAt(0) + index);
      return { letter, label: `${letter}) ${item.label.replace(/:$/, "")}:`, amount: item.amount, id: costExtraValueRowId(item.id) };
    }),
  ];
  // The part whose own box closes the same table is not written again under it (video 8.7, 11:40: «me muestran C y luego otra vez C»).
  const letterOf: Record<string, string> = { [`${PREFIX}-terreno`]: "A", [`${PREFIX}-construcciones`]: "B", [`${PREFIX}-instalaciones`]: "C", [`${PREFIX}-indirectos`]: "D" };
  const above = letterOf[last.id];
  const closing: TableSummaryBox = {
    id: COST_PHYSICAL_VALUE_BOX,
    position: "bottom",
    align: "end",
    rows: [
      ...parts.filter((part) => part.letter !== above).map((part) => ({ id: "id" in part ? part.id : part.letter, label: part.label, value: money(part.amount) })),
      // As the appraiser's current book closes the page (Bugambilias, video of 20 Oct 2026; REAL_ARANDAS).
      { id: "total", label: `VALOR FÍSICO DE REPOSICIÓN (${parts.map((part) => part.letter).join("+")}):`, value: money(result.physicalValue), emphasis: "total" },
    ],
  };
  const closed = { ...last, tables: last.tables.map((item, index) => (index === last.tables.length - 1 ? withSummaryBox(item, closing) : item)) };
  return [generatedBlock(PREFIX, "ENFOQUE FÍSICO O DE COSTOS", { apartados: [...apartados.slice(0, -1), closed] })];
}

/** The box of the physical value, under the last table of the page. */
export const COST_PHYSICAL_VALUE_BOX = "valor-fisico";

/** The row of the physical value's box that prints a value the appraiser added. */
export const costExtraValueRowId = (id: string) => `extra-${id}`;

/** The table of the page whose boxes close it with the physical value; null while there is none. */
export function costPhysicalValueTable(blocks: Block[]): string | null {
  for (const block of blocks) {
    for (const apartado of block.apartados) {
      for (const item of apartado.tables) {
        if (ensureTableV2(item).schema?.summaryBoxes?.some((box) => box.id === COST_PHYSICAL_VALUE_BOX)) return item.id;
      }
    }
  }
  return null;
}

/**
 * The place of each captured indirect in the table of the page being
 * captured: the ones that enter the calculation first, as it numbers them,
 * then the ones still being written. Each item is the index of the indirect.
 */
export function costIndirectOrder(indirects: Array<{ concept: string; percentage: number | null }>): number[] {
  const enters = (row: { concept: string; percentage: number | null }) => Boolean(row.concept.trim()) && (row.percentage ?? 0) > 0;
  const indexes = indirects.map((_, index) => index);
  return [...indexes.filter((index) => enters(indirects[index])), ...indexes.filter((index) => !enters(indirects[index]))];
}

/**
 * Where each datum the cost approach captures sits in the tables of its page
 * (the table and the column the calculation writes it in), so the editor
 * captures it there. Kept beside the columns above: they are the same ones.
 */
export function costCaptureColumns(columns: { constructions: DemeritColumnsDto; installations: DemeritColumnsDto }) {
  const table = (name: string) => `${PREFIX}-tabla-${name}`;
  /** Cons., Edad, Otro, the factors added, FRe, Grado de terminación and Indiviso, from the first of them. */
  const demerit = (start: number, extra: number) => ({
    conservation: generatedColumnId(start),
    ageFactor: generatedColumnId(start + 1),
    otherFactor: generatedColumnId(start + 2),
    extraFactors: Array.from({ length: extra }, (_, index) => generatedColumnId(start + 3 + index)),
    resultantFactor: generatedColumnId(start + 3 + extra),
    completion: generatedColumnId(start + 4 + extra),
    undivided: generatedColumnId(start + 5 + extra),
  });
  const rowsOf = (name: string) => (keys: string[]) => generatedRowIds(table(name), keys.length, keys);
  return {
    land: {
      table: table("terreno"),
      row: generatedRowIds(table("terreno"), 1)[0],
      subjectArea: generatedColumnId(1),
      unitValue: generatedColumnId(2),
      factors: Object.fromEntries(LAND_FACTORS.map((factor, index) => [factor.key, generatedColumnId(3 + index)])) as Record<(typeof LAND_FACTORS)[number]["key"], string>,
      resultantFactor: generatedColumnId(3 + LAND_FACTORS.length),
    },
    constructions: {
      table: table("construcciones-tipos"),
      rows: rowsOf("construcciones-tipos"),
      ref: generatedColumnId(0),
      // The type's own data, written here as in INF. CONSTRUCCIÓN (video 8.14, 43:20).
      description: generatedColumnId(1),
      area: generatedColumnId(2),
      age: generatedColumnId(3),
      usefulLife: generatedColumnId(4),
      ...demerit(6, columns.constructions.extra.length),
    },
    constructionValues: { table: table("construcciones-valores"), rows: rowsOf("construcciones-valores"), unitReplacementCost: generatedColumnId(3) },
    installations: {
      table: table("instalaciones-partidas"),
      rows: rowsOf("instalaciones-partidas"),
      share: generatedColumnId(0),
      ref: generatedColumnId(1),
      description: generatedColumnId(2),
      unit: generatedColumnId(3),
      quantity: generatedColumnId(4),
      age: generatedColumnId(5),
      usefulLife: generatedColumnId(6),
      ...demerit(8, columns.installations.extra.length),
    },
    installationValues: { table: table("instalaciones-valores"), rows: rowsOf("instalaciones-valores"), unitReplacementCost: generatedColumnId(5) },
    indirects: {
      table: table("indirectos"),
      rows: (count: number) => generatedRowIds(table("indirectos"), count),
      concept: generatedColumnId(0),
      percentage: generatedColumnId(1),
      base: generatedColumnId(2),
      amount: generatedColumnId(3),
    },
  };
}

/** The table with one more summary box after the ones it has. */
export function withSummaryBox(tableItem: TableContent, box: TableSummaryBox): TableContent {
  const normalized = ensureTableV2(tableItem);
  const schema = normalized.schema ?? { zones: [] };
  return { ...normalized, schema: { ...schema, summaryBoxes: [...(schema.summaryBoxes ?? []), box] } } as unknown as TableContent;
}

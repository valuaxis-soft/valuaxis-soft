/**
 * Turns the cost calculation into the dictamen: one generated block in the
 * cost section, laid out as the appraiser's own format (A land, B
 * constructions, C special installations, D indirect costs, each with its
 * boxed value, and the physical value at the end), and the construction types and
 * special installations tables of the construction section: the types as the
 * section captures them, the installations as the cost panel does.
 */
import type { CostApproachResult } from "../engine/costs";
import type { Trace } from "../engine/trace";
import type { Apartado, AppSection, Block, TableContent } from "../model";
import { ensureTableV2, getDisplayColumns, type TableCellV2, type TableColumn, type TableRow, type TableSummaryBox } from "../services/table";
import {
  LAND_FACTORS,
  LAND_FACTOR_SHORT_LABELS,
  costColumnsOf,
  effectiveConservation,
  extraFactorLabel,
  extraFactorsOf,
  landReferenceArea,
  remainingUsefulLife,
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

const number = (digits: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const text = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? "—" : number(digits).format(value));

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
      ...parts.map((part) => ({ label: part.label, value: money(part.amount) })),
      // As the appraiser's current book closes the page (Bugambilias, video of 20 Oct 2026; REAL_ARANDAS).
      { label: `VALOR FÍSICO DE REPOSICIÓN (${parts.map((part) => part.letter).join("+")}):`, value: money(result.physicalValue), emphasis: "total" },
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

const CONSTRUCTION_TYPES_TABLE = "construccion_tipos";
const SPECIAL_INSTALLATIONS_TABLE = "instalaciones_especiales";

/**
 * Whether a table of the construction section is filled from the cost capture
 * (see withConstructionTables). It is found by ID in the Apartado it was
 * created in, so it stays there.
 */
export function isCostCaptureTable(tableId: string) {
  const id = tableId.toLowerCase();
  return id.endsWith(CONSTRUCTION_TYPES_TABLE) || id.endsWith(SPECIAL_INSTALLATIONS_TABLE);
}

/**
 * What each column of the construction section tables shows, in the order of
 * the template (sections/construccion): the key of the column and the headers
 * it is known by. The template has two "Tipo" columns in the types table: the
 * first is the reference, the second the type's description.
 */
const TYPES_COLUMNS = [
  { key: "tipo", names: ["tipo"] },
  { key: "tipo_construccion", names: ["tipo", "tipo de construccion"] },
  { key: "clasificacion", names: ["clasificacion"] },
  { key: "calidad", names: ["calidad"] },
  { key: "conservacion", names: ["conservacion"] },
  { key: "edad", names: ["edad"] },
  { key: "vut", names: ["vut", "vida util", "vida util total"] },
  { key: "vur", names: ["vur", "vida remanente", "vida util remanente"] },
  { key: "sup_m2", names: ["sup m2", "superficie", "superficie m2", "sup"] },
  { key: "descripcion", names: ["descripcion"] },
] as const;

const INSTALLATIONS_COLUMNS = [
  { key: "numero", names: ["", "no", "num", "numero", "ref"] },
  { key: "tipo", names: ["tipo"] },
  { key: "edad", names: ["edad"] },
  { key: "vut", names: ["vut", "vida util", "vida util total"] },
  { key: "vur", names: ["vur", "vida remanente", "vida util remanente"] },
  { key: "conservacion", names: ["conservacion"] },
  { key: "mantenimiento", names: ["mantenimiento", "mantenim"] },
  { key: "descripcion", names: ["descripcion"] },
] as const;

type CaptureColumns = typeof TYPES_COLUMNS | typeof INSTALLATIONS_COLUMNS;

const headerName = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The key of each column of the table, or null for a column the appraiser
 * added (it keeps what was written in it). A column is known by its id (the
 * template's key) or by its header; a header two columns share ("Tipo") goes
 * to them in order. A table whose headers were all renamed is read by
 * position, as before.
 */
function captureKeys(columns: TableColumn[], known: CaptureColumns): (string | null)[] {
  const taken = new Set<string>();
  const keys = columns.map((column): string | null => {
    const id = column.id.toLowerCase();
    const byId = known.find((item) => item.key === id && !taken.has(item.key));
    const name = headerName(column.name);
    const found = byId ?? known.find((item) => !taken.has(item.key) && (item.names as readonly string[]).includes(name));
    if (!found) return null;
    taken.add(found.key);
    return found.key;
  });
  if (keys.filter(Boolean).length >= Math.min(2, known.length)) return keys;
  return columns.map((_, index) => known[index]?.key ?? null);
}

/**
 * Rows of the construction section tables, from the capture, by column key.
 * Once the types (or the cost approach, for the installations) are captured
 * the table follows them, so a type deleted in the section leaves the printed
 * table too, even the last one; before that the table stays as the appraiser wrote it.
 */
function constructionRows(calculation: CostCalculationDto, tableId: string): { known: CaptureColumns; rows: Record<string, string>[] } | null {
  const id = tableId.toLowerCase();
  // Rows added in the panel but still empty stay out of the dictamen.
  const types = calculation.types.filter((row) => row.description.trim() || row.area !== null);
  const installations = calculation.installations.filter((row) => row.description.trim());
  if (id.endsWith(CONSTRUCTION_TYPES_TABLE) && (types.length || calculation.typesCaptured)) {
    // The conservation column is the cost approach's factor for the type, when it picked it.
    const conservationOf = (ref: string) => {
      const row = calculation.constructions.find((item) => item.ref.trim().toLowerCase() === ref.trim().toLowerCase());
      return row ? effectiveConservation(row) : null;
    };
    return {
      known: TYPES_COLUMNS,
      rows: types.map((row) => ({
        tipo: row.ref, tipo_construccion: row.description, clasificacion: row.classification, calidad: row.quality,
        conservacion: text(conservationOf(row.ref), 2), edad: text(row.age, 0), vut: text(row.usefulLife, 0), vur: text(remainingUsefulLife(row), 0),
        sup_m2: text(row.area), descripcion: "",
      })),
    };
  }
  if (id.endsWith(SPECIAL_INSTALLATIONS_TABLE) && (installations.length || calculation.configured)) {
    return {
      known: INSTALLATIONS_COLUMNS,
      rows: installations.map((row) => ({
        numero: row.ref, tipo: row.share === "C" ? "Común" : "Privativa", edad: text(row.age, 0), vut: text(row.usefulLife, 0),
        vur: row.usefulLife !== null && row.age !== null ? text(Math.max(row.usefulLife - row.age, 0), 0) : "—",
        conservacion: text(effectiveConservation(row), 3), mantenimiento: row.maintenance || "—",
        descripcion: `${row.description}${row.quantity ? ` (${text(row.quantity)}${row.unit ? ` ${row.unit}` : ""})` : ""}`,
      })),
    };
  }
  return null;
}

/**
 * The table with the rows of the capture. It keeps its columns as the
 * appraiser left them: one deleted (Mantenimiento, in an appraisal of a
 * building) stays deleted, one renamed or moved keeps its data, and one added
 * keeps what was written in it, row by row.
 */
function filledTable(tableItem: TableContent, filled: { known: CaptureColumns; rows: Record<string, string>[] }): TableContent {
  const table = ensureTableV2(tableItem);
  const keys = new Map(captureKeys(getDisplayColumns(table), filled.known).map((key, index) => [getDisplayColumns(table)[index].id, key]));
  const ids = new Set(table.rows.map((row) => row.id));
  const rows = filled.rows.map((values, index): TableRow => {
    const current = table.rows[index];
    let id = current?.id ?? `r-${table.id}-${index}`;
    if (!current) {
      while (ids.has(id)) id = `${id}-n`;
      ids.add(id);
    }
    const cells = Object.fromEntries(table.columns.map((column): [string, TableCellV2] => {
      const key = keys.get(column.id);
      if (key) return [column.id, { kind: "value", value: values[key] ?? "" }];
      return [column.id, current?.cells[column.id] ?? { kind: "value", value: "" }];
    }));
    return { id, cells };
  });
  if (JSON.stringify(rows) === JSON.stringify(table.rows)) return tableItem;
  return { ...table, title: tableItem.title, rows } as unknown as TableContent;
}

/**
 * Fills the construction types and special installations tables of the
 * construction section with the capture. Returns the same section when they
 * already show it, or when nothing is captured yet.
 */
export function withConstructionTables(section: AppSection, calculation: CostCalculationDto): AppSection {
  let changed = false;
  const blocks = section.blocks.map((item) => {
    const apartados = item.apartados.map((apartado) => {
      const tables = apartado.tables.map((tableItem) => {
        const filled = constructionRows(calculation, tableItem.id);
        if (!filled) return tableItem;
        const next = filledTable(tableItem, filled);
        if (next !== tableItem) changed = true;
        return next;
      });
      return tables.some((tableItem, index) => tableItem !== apartado.tables[index]) ? { ...apartado, tables } : apartado;
    });
    return apartados.some((apartado, index) => apartado !== item.apartados[index]) ? { ...item, apartados } : item;
  });
  return changed ? { ...section, blocks } : section;
}

/**
 * Turns the cost calculation into the dictamen: one generated block in the
 * cost section, laid out as the appraiser's own format (A land, B
 * constructions, C special installations, E indirects, each with its boxed
 * value, and the physical value at the end), and the construction types and
 * special installations tables of the construction section, which are
 * captured once in the cost panel.
 */
import type { CostApproachResult } from "../engine/costs";
import type { Trace } from "../engine/trace";
import type { Apartado, AppSection, Block, TableContent } from "../model";
import { ensureTableV2, type TableSummaryBox } from "../services/table";
import { LAND_FACTORS, type CostCalculationDto } from "./cost-types";
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

function table(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

/** Column titles of the land factors as the books abbreviate them. */
const LAND_FACTOR_SHORT_LABELS: Record<(typeof LAND_FACTORS)[number]["key"], string> = {
  negotiation: "Neg.", location: "Ubic.", surface: "Sup.", services: "Serv.", classification: "Clas.", topography: "Top.",
};

const DEMERIT = "Factores de Demérito";
const NEW_VALUE = "Valor de Reposición Nuevo (VRN)";
const NET_VALUE = "Valor Neto de Reposición (VNR)";
const demeritColumns = ["Cons.", "Edad", "Otro", "FRe"].map((name) => figureColumn(name, { group: DEMERIT }));
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
  const apartados: Apartado[] = [];

  if (value("costos.terreno.valor") !== undefined) {
    const land = calculation.land;
    const area = land.subjectArea ?? calculation.market.subjectArea ?? 0;
    const referenceArea = input("costos.terreno.factorSuperficie", "loteTipo") ?? area;
    const group = "Factores de Homologación";
    apartados.push(generatedApartado(`${PREFIX}-terreno`, "A) TERRENO EN ESTUDIO", {
      tables: [generatedTable(`${PREFIX}-tabla-terreno`, "Terreno",
        [
          figureColumn("Fracción"), figureColumn("Superficie de Sujeto (m²)"), moneyColumn("Valor Unitario ($/m²)"),
          ...LAND_FACTORS.map((factor) => figureColumn(LAND_FACTOR_SHORT_LABELS[factor.key], { group })),
          figureColumn("FRe", { group }),
          moneyColumn("Valor Unitario Neto $/m²"), moneyColumn("Valor Parcial $"),
        ],
        [[
          "I", figure(area), amount("costos.terreno.valorUnitario"),
          ...LAND_FACTORS.map((factor) => figure(factor.key === "surface" ? value("costos.terreno.factorSuperficie") : land.factors[factor.key])),
          figure(value("costos.terreno.factorResultante")),
          amount("costos.terreno.valorUnitarioNeto"), amount("costos.terreno.valorParcial"),
        ]],
        { summaryBoxes: [
          { id: "lote-tipo", position: "top", align: "start", rows: [{ label: "Lote Tipo:", value: squareMetres(referenceArea) }] },
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
            ...demeritColumns, figureColumn("Grado de terminación"), figureColumn("Indiviso"),
          ],
          constructions.map((row) => {
            const key = `costos.construcciones.${row.ref}`;
            return [
              row.ref, row.description || EMPTY, figure(row.area), whole(row.age), whole(row.usefulLife), remainingLife(row.usefulLife, row.age),
              figure(row.conservation), figure(value(`${key}.factorEdad`)), figure(row.otherFactor), figure(value(`${key}.factorResultante`)),
              percent(row.completion), percent(row.undivided),
            ];
          })),
        generatedTable(`${PREFIX}-tabla-construcciones-valores`, "Valor de las construcciones",
          [
            ...type,
            moneyColumn("Valor Unit. $", NEW_VALUE), moneyColumn("Valor Parcial VRN $", NEW_VALUE),
            figureColumn("Factor Resultante"),
            moneyColumn("Valor Unit. $", NET_VALUE), moneyColumn("Valor Parcial VNR $", NET_VALUE),
          ],
          constructions.map((row) => {
            const key = `costos.construcciones.${row.ref}`;
            return [
              row.ref, row.description || EMPTY, figure(row.area),
              money(row.unitReplacementCost ?? 0), amount(`${key}.vrnParcial`),
              figure(value(`${key}.factorResultante`)),
              amount(`${key}.vnrUnitario`), amount(`${key}.vnrParcial`),
            ];
          }),
          { summaryBoxes: [
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
    apartados.push(generatedApartado(`${PREFIX}-instalaciones`, "C) INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS", {
      tables: [
        generatedTable(`${PREFIX}-tabla-instalaciones-partidas`, "Partidas de instalaciones especiales",
          [
            ...item, figureColumn("Edad"), figureColumn("Vida útil"), figureColumn("Vida remanente"),
            ...demeritColumns, figureColumn("Grado de terminación"), figureColumn("Indiviso"),
          ],
          installations.map((row) => {
            const key = `costos.instalaciones.${row.ref}`;
            return [
              ...itemCells(row), whole(row.age), whole(row.usefulLife), remainingLife(row.usefulLife, row.age),
              figure(row.conservation), figure(input(`${key}.factorResultante`, "factorEdad")), figure(row.otherFactor), figure(value(`${key}.factorResultante`)),
              percent(row.completion), percent(row.undivided),
            ];
          })),
        generatedTable(`${PREFIX}-tabla-instalaciones-valores`, "Valor de las instalaciones especiales",
          [
            ...item,
            moneyColumn("Valor Unit. $", NEW_VALUE), moneyColumn("Valor Parcial VRN $", NEW_VALUE),
            figureColumn("F. Result."),
            moneyColumn("Valor Unit. $", NET_VALUE), moneyColumn("Valor Parcial VNR $", NET_VALUE),
          ],
          installations.map((row) => {
            const key = `costos.instalaciones.${row.ref}`;
            return [
              ...itemCells(row),
              money(row.unitReplacementCost ?? 0), amount(`${key}.vrnParcial`),
              figure(value(`${key}.factorResultante`)),
              amount(`${key}.vnrUnitario`), amount(`${key}.vnrParcial`),
            ];
          }),
          { summaryBoxes: [
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
    apartados.push(generatedApartado(`${PREFIX}-indirectos`, "E) INDIRECTOS", {
      tables: [generatedTable(`${PREFIX}-tabla-indirectos`, "Indirectos",
        [textColumn("Concepto"), figureColumn("Porcentaje"), moneyColumn("Base $"), moneyColumn("Importe $")],
        indirects.map((row, index) => {
          const key = `costos.indirectos.${index + 1}`;
          return [row.concept, percent(row.percentage ?? 0, 2), money(input(key, "base") ?? 0), amount(key)];
        }),
        { summaryBoxes: [{ id: "valor", position: "bottom", align: "end", rows: [{ label: "E) Indirectos:", value: money(result.indirects), emphasis: "strong" }] }] })],
    }));
  }

  // The physical value closes the page, under the last table, with the parts it adds up.
  const last = apartados.at(-1);
  if (!last) return [];
  const parts = [
    ...(value("costos.terreno.valor") !== undefined ? [{ letter: "A", label: "A) Valor del Terreno:", amount: result.land }] : []),
    ...(constructions.length ? [{ letter: "B", label: "B) Valor de las Construcciones:", amount: result.constructions }] : []),
    ...(installations.length ? [{ letter: "C", label: "C) Valor de Instalaciones Especiales:", amount: result.specialInstallations }] : []),
    ...(result.indirects ? [{ letter: "E", label: "E) Indirectos:", amount: result.indirects }] : []),
  ];
  const closing: TableSummaryBox = {
    id: "valor-fisico",
    position: "bottom",
    align: "end",
    rows: [
      ...parts.map((part) => ({ label: part.label, value: money(part.amount) })),
      { label: `VALOR FÍSICO O DIRECTO (${parts.map((part) => part.letter).join("+")}):`, value: money(result.physicalValue), emphasis: "total" },
    ],
  };
  const closed = { ...last, tables: last.tables.map((item, index) => (index === last.tables.length - 1 ? withSummaryBox(item, closing) : item)) };
  return [generatedBlock(PREFIX, "ENFOQUE FÍSICO O DE COSTOS", { apartados: [...apartados.slice(0, -1), closed] })];
}

/** The table with one more summary box after the ones it has. */
function withSummaryBox(tableItem: TableContent, box: TableSummaryBox): TableContent {
  const normalized = ensureTableV2(tableItem);
  const schema = normalized.schema ?? { zones: [] };
  return { ...normalized, schema: { ...schema, summaryBoxes: [...(schema.summaryBoxes ?? []), box] } } as unknown as TableContent;
}

function cellsOf(tableItem: TableContent) {
  const normalized = ensureTableV2(tableItem);
  return {
    columns: normalized.columns.map((column) => column.name),
    rows: normalized.rows.map((row) => normalized.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
  };
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

/** Rows of the construction section tables, from the capture. */
function constructionRows(calculation: CostCalculationDto, tableId: string): string[][] | null {
  const id = tableId.toLowerCase();
  // Rows added in the panel but still empty stay out of the dictamen.
  const constructions = calculation.constructions.filter((row) => row.description.trim() || row.area !== null);
  const installations = calculation.installations.filter((row) => row.description.trim());
  if (id.endsWith(CONSTRUCTION_TYPES_TABLE) && constructions.length) {
    return constructions.map((row) => [
      row.ref, row.description, row.classification, row.quality, text(row.conservation, 2), text(row.age, 0),
      text(row.usefulLife, 0), row.usefulLife !== null && row.age !== null ? text(Math.max(row.usefulLife - row.age, 0), 0) : "—",
      text(row.area), "",
    ]);
  }
  if (id.endsWith(SPECIAL_INSTALLATIONS_TABLE) && installations.length) {
    return installations.map((row) => [
      row.ref, row.share === "C" ? "Común" : "Privativa", text(row.age, 0), text(row.usefulLife, 0),
      row.usefulLife !== null && row.age !== null ? text(Math.max(row.usefulLife - row.age, 0), 0) : "—",
      text(row.conservation, 3), row.maintenance || "—", `${row.description}${row.quantity ? ` (${text(row.quantity)}${row.unit ? ` ${row.unit}` : ""})` : ""}`,
    ]);
  }
  return null;
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
        const rows = constructionRows(calculation, tableItem.id);
        if (!rows) return tableItem;
        const current = cellsOf(tableItem);
        if (JSON.stringify(current.rows) === JSON.stringify(rows)) return tableItem;
        changed = true;
        return table(tableItem.id, tableItem.title, current.columns, rows);
      });
      return tables.some((tableItem, index) => tableItem !== apartado.tables[index]) ? { ...apartado, tables } : apartado;
    });
    return apartados.some((apartado, index) => apartado !== item.apartados[index]) ? { ...item, apartados } : item;
  });
  return changed ? { ...section, blocks } : section;
}

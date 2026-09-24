/**
 * Turns the cost calculation into the dictamen: generated blocks in the cost
 * section, and the construction types and special installations tables of the
 * construction section, which are captured once in the cost panel.
 */
import type { CostApproachResult } from "../engine/costs";
import type { Trace } from "../engine/trace";
import type { AppSection, Block, TableContent } from "../model";
import { ensureTableV2 } from "../services/table";
import { LAND_FACTORS, landUnitValue, type CostCalculationDto } from "./cost-types";
import { GENERATED_BLOCK_PREFIX } from "./market-document";

const PREFIX = `${GENERATED_BLOCK_PREFIX}costos`;

/** Template blocks of the cost section that the generated blocks stand in for. */
export const COST_TEMPLATE_BLOCK_IDS = [
  "costos-block-1-terreno",
  "costos-block-2-construcciones",
  "costos-block-3-instalaciones-especiales-elementos-accesorios-y-obras-complementarias",
  "costos-block-4-resumen-del-enfoque-de-costos",
];

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (digits: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const text = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? "—" : number(digits).format(value));

function block(id: string, title: string, parts: Partial<Pick<Block, "concepts" | "tables">>): Block {
  return { id, title, sectionLabel: "", enabled: true, required: false, concepts: parts.concepts ?? [], apartados: [], tables: parts.tables ?? [], images: [] };
}

const concepts = (prefix: string, rows: [string, string][]) =>
  rows.map(([label, value], index) => ({ id: `${prefix}-${index + 1}`, label, value, enabled: true }));

function table(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

/** Blocks of the cost section. Empty while nothing is captured. */
export function costDocumentBlocks(calculation: CostCalculationDto, result: CostApproachResult | null, trace: Trace | null): Block[] {
  if (!result || !trace) return [];
  const value = (key: string) => trace.find(key)?.value;
  const blocks: Block[] = [];

  if (value("costos.terreno.valor") !== undefined) {
    const land = calculation.land;
    blocks.push(block(`${PREFIX}-terreno`, "TERRENO", {
      concepts: concepts(`${PREFIX}-terreno`, [
        ["Superficie del terreno", `${text(land.subjectArea ?? calculation.market.subjectArea)} m²`],
        ["Valor unitario de mercado", `${money.format(value("costos.terreno.valorUnitario") ?? landUnitValue(calculation) ?? 0)} /m²`],
        ...LAND_FACTORS.map((factor): [string, string] => [
          `Factor de ${factor.label.toLowerCase()}`,
          text(factor.key === "surface" ? value("costos.terreno.factorSuperficie") : land.factors[factor.key], 4),
        ]),
        ["Factor resultante", text(value("costos.terreno.factorResultante"), 4)],
        ["Valor unitario neto", `${money.format(value("costos.terreno.valorUnitarioNeto") ?? 0)} /m²`],
        ["A) Valor del terreno", money.format(result.land)],
      ]),
    }));
  }

  const constructions = calculation.constructions.filter((row) => value(`costos.construcciones.${row.ref}.vnrParcial`) !== undefined);
  if (constructions.length) {
    blocks.push(block(`${PREFIX}-construcciones`, "CONSTRUCCIONES", {
      tables: [table(`${PREFIX}-tabla-construcciones`, "Cálculo del valor de las construcciones",
        ["Ref.", "Descripción", "Superficie (m²)", "Edad", "Vida útil", "F. edad", "F. conservación", "F. resultante", "VRN unitario", "VNR"],
        constructions.map((row) => {
          const key = `costos.construcciones.${row.ref}`;
          return [
            row.ref, row.description || "—", text(row.area), text(row.age, 0), text(row.usefulLife, 0),
            text(value(`${key}.factorEdad`), 4), text(row.conservation, 4), text(value(`${key}.factorResultante`), 4),
            money.format(row.unitReplacementCost ?? 0), money.format(value(`${key}.vnrParcial`) ?? 0),
          ];
        }))],
    }));
  }

  const installations = calculation.installations.filter((row) => value(`costos.instalaciones.${row.ref}.vnrParcial`) !== undefined);
  if (installations.length) {
    blocks.push(block(`${PREFIX}-instalaciones`, "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS", {
      tables: [table(`${PREFIX}-tabla-instalaciones`, "Instalaciones especiales, elementos accesorios y obras complementarias",
        ["Ref.", "Descripción", "P/C", "Cantidad", "Edad", "Vida útil", "F. resultante", "VRN unitario", "VNR"],
        installations.map((row) => {
          const key = `costos.instalaciones.${row.ref}`;
          return [
            row.ref, row.description, row.share, `${text(row.quantity)}${row.unit ? ` ${row.unit}` : ""}`, text(row.age, 0), text(row.usefulLife, 0),
            text(value(`${key}.factorResultante`), 4), money.format(row.unitReplacementCost ?? 0), money.format(value(`${key}.vnrParcial`) ?? 0),
          ];
        }))],
    }));
  }

  if (result.indirects) {
    blocks.push(block(`${PREFIX}-indirectos`, "INDIRECTOS", {
      concepts: concepts(`${PREFIX}-indirectos`, [
        ...calculation.indirects
          .map((row, index): [string, string] | null => {
            const amount = value(`costos.indirectos.${index + 1}`);
            return amount === undefined ? null : [row.concept, `${text((row.percentage ?? 0) * 100)} % de ${money.format(row.base ?? 0)} = ${money.format(amount)}`];
          })
          .filter((row): row is [string, string] => row !== null),
        ["E) Indirectos", money.format(result.indirects)],
      ]),
    }));
  }

  blocks.push(block(`${PREFIX}-resumen`, "RESUMEN DEL ENFOQUE DE COSTOS", {
    concepts: concepts(`${PREFIX}-resumen`, [
      ["A) Valor del terreno", money.format(result.land)],
      ["B) Valor de las construcciones", money.format(result.constructions)],
      ["C) Instalaciones especiales", money.format(result.specialInstallations)],
      ...(result.indirects ? [["E) Indirectos", money.format(result.indirects)] as [string, string]] : []),
      ["Valor físico o directo", money.format(result.physicalValue)],
    ]),
  }));
  return blocks;
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

/** Rows of the construction section tables, from the capture. */
function constructionRows(calculation: CostCalculationDto, tableId: string): string[][] | null {
  const id = tableId.toLowerCase();
  // Rows added in the panel but still empty stay out of the dictamen.
  const constructions = calculation.constructions.filter((row) => row.description.trim() || row.area !== null);
  const installations = calculation.installations.filter((row) => row.description.trim());
  if (id.endsWith("construccion_tipos") && constructions.length) {
    return constructions.map((row) => [
      row.ref, row.description, row.classification, row.quality, text(row.conservation, 2), text(row.age, 0),
      text(row.usefulLife, 0), row.usefulLife !== null && row.age !== null ? text(Math.max(row.usefulLife - row.age, 0), 0) : "—",
      text(row.area), "",
    ]);
  }
  if (id.endsWith("instalaciones_especiales") && installations.length) {
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

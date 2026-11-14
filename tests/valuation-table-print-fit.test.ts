/**
 * A table of the dictamen never leaves the page (Nov 2026): the land table of
 * Costos with its 12 columns and three of the appraiser's own with long
 * titles, which printed 470 px past the right edge, now shares the width by
 * content, wraps its headers between words and only then takes a smaller
 * letter, never under 8 px. A table that does not fit even so is squeezed into
 * the page and the editor suggests the page on its side.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { figureColumn, generatedTable, moneyColumn, resultantColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import { LAND_FACTORS, LAND_FACTOR_SHORT_LABELS } from "../src/features/valuations/calculation/cost-types";
import { editGeneratedTable } from "../src/features/valuations/calculation/generated-table-layout";
import type { TableContent } from "../src/features/valuations/model";
import { appendTableColumn, ensureTableV2, setColumnWidth } from "../src/features/valuations/services/table";
import { evaluateTableFormulas } from "../src/features/valuations/services/table-formula-engine";
import {
  LANDSCAPE_CONTENT_WIDTH_PX,
  MIN_TABLE_FONT_PX,
  PORTRAIT_CONTENT_WIDTH_PX,
  TABLE_FIT_STEPS,
  TABLE_FONT_PX,
  naturalTableWidth,
  pageContentWidth,
  planTablePrintFit,
  printFitColumns,
  textWidthEm,
} from "../src/features/valuations/services/table-print-fit";

const group = "Factores de Homologación";

/** The land table of Costos as the calculation writes it: 12 columns (cost-document.ts). */
function landTable(): TableContent {
  return generatedTable("motor-costos-tabla-terreno", "Terreno",
    [
      figureColumn("Fracción"), figureColumn("Superficie de Sujeto (m²)"), moneyColumn("Valor Unitario ($/m²)"),
      ...LAND_FACTORS.map((factor) => figureColumn(LAND_FACTOR_SHORT_LABELS[factor.key], { group })),
      resultantColumn("FRe", group),
      moneyColumn("Valor Unitario Neto $/m²"), moneyColumn("Valor Parcial $"),
    ],
    [["I", "1,245.80", "$ 12,850.00", "0.95", "1.05", "0.98", "1.00", "1.02", "0.97", "0.97", "$ 12,464.50", "$ 15,528,274.10"]]);
}

/** The same table with three columns of the appraiser's own, with long titles (#105). */
function landTableWithOwnColumns(): TableContent {
  let table = landTable();
  for (const [title, value] of [
    ["Factor de forma irregular del predio", "1.00"],
    ["Observaciones del valuador sobre el frente", "1.00"],
    ["Valor unitario de referencia catastral", "$ 9,870.00"],
  ]) {
    table = editGeneratedTable(table, (current) => {
      const next = appendTableColumn(ensureTableV2(current));
      const column = next.columns.at(-1)!;
      column.name = title;
      next.rows[0].cells[column.id] = { kind: "value", value };
      return { ...next, version: 2 } as unknown as TableContent;
    });
  }
  return table;
}

/** The homologation of the land market with six factors (market-document.ts). */
function homologationTable(): TableContent {
  const factors = "FACTORES DE HOMOLOGACIÓN";
  return generatedTable("motor-mercado-terreno_venta-enfoque-tabla-homologacion", "Homologación",
    [
      figureColumn("REF"), moneyColumn("OFERTA $ (TERRENO)"), figureColumn("SUP. m²"), moneyColumn("Valor Unitario $/m²"),
      ...["Neg.", "Ubic.", "Sup.", "Zona", "Frente", "Top."].map((name) => figureColumn(name, { group: factors })),
      resultantColumn("FRe", factors),
      moneyColumn("Valor Unitario Homologado $/m²"),
    ],
    [1, 2, 3, 4, 5].map((ref) => [String(ref), "$ 2,285,000.00", "192.00", "$ 11,310.45", "0.95", "1.02", "0.99", "1.00", "1.03", "0.98", "0.97", "$ 10,990.12"]));
}

/** Twelve months and a total of amounts: too wide for an upright page even at the smallest letter. */
function monthlyTable(): TableContent {
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre", "Total anual"];
  return generatedTable("flujo", "Flujo mensual", [textColumn("Concepto"), ...months.map((month) => moneyColumn(month))],
    [["Ingresos por arrendamiento", ...months.map(() => "$ 1,234,567.89")]]);
}

const columnsOf = (content: TableContent) => {
  const table = ensureTableV2(content);
  return printFitColumns(table, evaluateTableFormulas(table));
};
const total = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0);
const longestWord = (text: string) => Math.max(...text.split(/\s+/).map((word) => textWidthEm(word, true)));

test("the land table of Costos with three own columns of long titles no longer leaves the upright page", () => {
  const columns = columnsOf(landTableWithOwnColumns());
  assert.equal(columns.length, 15);
  assert.ok(naturalTableWidth(columns) > PORTRAIT_CONTENT_WIDTH_PX, "as it printed before, wider than the page");

  const fit = planTablePrintFit(columns, PORTRAIT_CONTENT_WIDTH_PX);
  assert.equal(fit.kind, "fit");
  if (fit.kind !== "fit") return;
  assert.equal(fit.fits, true, "it fits without the page on its side");
  assert.ok(total(fit.widths) <= PORTRAIT_CONTENT_WIDTH_PX + 0.01, `${total(fit.widths)} px, never wider than the page`);
  assert.ok(fit.fontPx >= MIN_TABLE_FONT_PX && fit.fontPx < TABLE_FONT_PX, `a smaller letter, legible: ${fit.fontPx} px`);
  // Every header wraps between its words: each column holds its longest word whole, and every figure on one line.
  columns.forEach((column, index) => {
    const room = fit.widths[index] - 2 * fit.paddingPx - 2;
    assert.ok(room >= longestWord(column.header) * fit.fontPx, `«${column.header}» keeps its words whole`);
    for (const cell of column.cells) {
      if (column.noWrap) assert.ok(room >= textWidthEm(cell, false) * fit.fontPx, `${cell} on one line`);
    }
  });
});

test("the homologation with six factors and a narrow table print as always: 11 px, widths after their content", () => {
  assert.deepEqual(planTablePrintFit(columnsOf(homologationTable()), PORTRAIT_CONTENT_WIDTH_PX), { kind: "natural" });
  const small = generatedTable("resumen", "Resumen", [textColumn("Concepto"), moneyColumn("Importe")], [["Terreno", "$ 15,528,274.10"]]);
  assert.deepEqual(planTablePrintFit(columnsOf(small), PORTRAIT_CONTENT_WIDTH_PX), { kind: "natural" });
});

test("the land table as the calculation writes it (12 columns) still fits at 11 px", () => {
  const fit = planTablePrintFit(columnsOf(landTable()), PORTRAIT_CONTENT_WIDTH_PX);
  assert.ok(fit.kind === "natural" || fit.fontPx === TABLE_FONT_PX, "the letter stays at 11 px");
});

test("a table that is a little too wide first takes less room around its values, then a smaller letter", () => {
  const columns = columnsOf(landTableWithOwnColumns());
  const plans = [900, 820, 752, 680, 620].map((width) => planTablePrintFit(columns, width));
  const fonts = plans.map((plan) => (plan.kind === "fit" ? plan.fontPx : TABLE_FONT_PX));
  // The narrower the page, never a bigger letter.
  fonts.reduce((previous, font) => {
    assert.ok(font <= previous, `${fonts.join(" → ")}`);
    return font;
  }, TABLE_FONT_PX);
  // Room shrinks at 11 px before the letter does.
  assert.deepEqual(TABLE_FIT_STEPS.slice(0, 3).map((step) => step.fontPx), [11, 11, 11]);
  assert.ok(TABLE_FIT_STEPS[0].paddingPx > TABLE_FIT_STEPS[2].paddingPx);
  assert.equal(TABLE_FIT_STEPS.at(-1)?.fontPx, MIN_TABLE_FONT_PX, "never under 8 px");
});

test("a table too wide even at 8 px is squeezed into the page and says so; on its side it fits", () => {
  const columns = columnsOf(monthlyTable());
  const upright = planTablePrintFit(columns, pageContentWidth("portrait"));
  assert.equal(upright.kind, "fit");
  if (upright.kind !== "fit") return;
  assert.equal(upright.fits, false, "the editor suggests the page on its side");
  assert.equal(upright.fontPx, MIN_TABLE_FONT_PX);
  assert.ok(Math.abs(total(upright.widths) - PORTRAIT_CONTENT_WIDTH_PX) < 0.5, "still exactly the width of the page");

  const landscape = planTablePrintFit(columns, pageContentWidth("landscape"));
  assert.ok(landscape.kind === "natural" || landscape.fits, "on a page on its side it fits");
  assert.equal(pageContentWidth("landscape"), LANDSCAPE_CONTENT_WIDTH_PX);
  assert.equal(pageContentWidth("portrait", 57), PORTRAIT_CONTENT_WIDTH_PX - 57, "the binding margin narrows the page");
});

test("a value still out of its cell after layout takes the next step; a width set by hand is kept while it fits", () => {
  const columns = columnsOf(landTableWithOwnColumns());
  const first = planTablePrintFit(columns, PORTRAIT_CONTENT_WIDTH_PX);
  assert.equal(first.kind, "fit");
  if (first.kind !== "fit") return;
  const next = planTablePrintFit(columns, PORTRAIT_CONTENT_WIDTH_PX, { fromStep: first.step + 2 });
  assert.equal(next.kind, "fit");
  if (next.kind === "fit") assert.ok(next.step > first.step);
  // A natural table that overflows once laid out is fitted from the first step.
  const natural = planTablePrintFit(columnsOf(homologationTable()), PORTRAIT_CONTENT_WIDTH_PX, { fromStep: 1 });
  assert.equal(natural.kind, "fit");

  const sized = ensureTableV2(landTableWithOwnColumns());
  const withWidth = setColumnWidth(sized, sized.columns[0].id, 60);
  const fitted = planTablePrintFit(printFitColumns(withWidth, evaluateTableFormulas(withWidth)), PORTRAIT_CONTENT_WIDTH_PX);
  assert.equal(fitted.kind === "fit" ? fitted.widths[0] : null, 60);
});

test("the measure of the letter is close to the document's own (Geist, measured in Chrome)", () => {
  // Widths in em measured with canvas in the dictamen (13 Nov 2026), regular and bold.
  const measured: Array<[string, number, number]> = [
    ["Neg.", 2.079, 2.206], ["Fracción", 3.894, 4.221], ["Observaciones", 6.783, 7.358],
    ["$ 15,528,274.10", 6.956, 7.551], ["0.95", 2.083, 2.231], ["(TERRENO)", 5.048, 5.348],
  ];
  for (const [text, regular, bold] of measured) {
    assert.ok(Math.abs(textWidthEm(text, false) - regular) / regular < 0.15, `${text}: ${textWidthEm(text, false)} vs ${regular}`);
    assert.ok(Math.abs(textWidthEm(text, true) - bold) / bold < 0.15, `${text} bold: ${textWidthEm(text, true)} vs ${bold}`);
  }
});

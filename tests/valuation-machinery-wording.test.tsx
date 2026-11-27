/**
 * A valuation of machinery and equipment speaks of machinery (27 nov 2026):
 * its market section has one switch «Agregar al informe valuatorio: mercado
 * de maquinaria y equipo», not one for buildings and one for land; the
 * conclusion says why each approach has no value in its own words; and the
 * subject's cells of the technical characteristics it has no datum for are
 * blank, not marked as a datum still missing. Invented data.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ConclusionCalculationDto } from "../src/features/valuations/calculation/conclusion-types";
import { machineryMarketBlocks, machineryMarketTableId } from "../src/features/valuations/calculation/machinery-document";
import { DEFAULT_MACHINERY_MARKET, EMPTY_MACHINERY_ITEM, emptyOffer, toMachineryMarketEngineInput } from "../src/features/valuations/calculation/machinery-types";
import { ApproachValues, MACHINERY_UNAVAILABLE_REASONS } from "../src/features/valuations/components/calculation/conclusion-panel";
import { ReportInclusionBadge, SectionDocumentSettings } from "../src/features/valuations/components/editor/section-document-settings";
import { computeMachineryMarket } from "../src/features/valuations/engine/machinery";
import type { AppSection } from "../src/features/valuations/model";
import {
  MACHINERY_MARKET_REPORT_LABEL,
  marketLeftOut,
  excludedReportApproaches,
  reportSwitchIncluded,
  sectionReportSwitches,
  withReportSwitch,
} from "../src/features/valuations/services/report-approaches";
import { ensureTableV2 } from "../src/features/valuations/services/table";

const section = (excludedFromReport?: string[]): AppSection => ({
  id: "mercadoVenta", label: "VIII", title: "ENF. MERCADO VENTA", sourceFile: "", enabled: true, required: false, blocks: [],
  ...(excludedFromReport ? { excludedFromReport } : {}),
} as AppSection);

test("a machinery valuation's market section has one switch, of machinery and equipment, that takes its market in and out", () => {
  const [entry, ...others] = sectionReportSwitches(section(), { machinery: true });
  assert.equal(others.length, 0);
  assert.equal(entry.label, MACHINERY_MARKET_REPORT_LABEL);
  // Off, both markets of the section are left out: the conclusion leaves the machinery market out (marketLeftOut).
  const off = section(withReportSwitch(section(), entry, false));
  assert.equal(reportSwitchIncluded(off, entry), false);
  assert.equal(marketLeftOut(excludedReportApproaches([off])), true);
  // On again, nothing is left out; a document saved with only one of them off reads as in the report.
  assert.equal(withReportSwitch(off, entry, true), undefined);
  assert.equal(reportSwitchIncluded(section(["mercado-inmuebles"]), entry), true);
  // A real estate valuation keeps its two markets.
  assert.deepEqual(sectionReportSwitches(section()).map((item) => item.label), ["Mercado de venta de inmuebles", "Mercado de venta de terrenos"]);
});

test("the section's settings and its badge speak of machinery, never of buildings or land", () => {
  const html = renderToStaticMarkup(<SectionDocumentSettings section={section()} allSections={[section()]} readOnly={false} onUpdateSection={() => undefined} machinery />);
  assert.match(html, /Agregar al informe valuatorio: mercado de maquinaria y equipo/);
  assert.doesNotMatch(html, /inmuebles|terrenos/);
  const realEstate = renderToStaticMarkup(<SectionDocumentSettings section={section()} allSections={[section()]} readOnly={false} onUpdateSection={() => undefined} />);
  assert.match(realEstate, /mercado de venta de inmuebles/);
  // Out of the report, the badge of the section says so; the machinery one has no «inmuebles» to name.
  assert.match(renderToStaticMarkup(<ReportInclusionBadge section={section(["mercado-inmuebles", "mercado-terrenos"])} machinery />), /No incluido en el informe/);
  assert.equal(renderToStaticMarkup(<ReportInclusionBadge section={section(["mercado-inmuebles"])} machinery />), "", "still in the report");
});

test("the conclusion of a machinery valuation says why a value is missing in the words of its approaches", () => {
  const calculation = { values: { costos: null, mercado: null, ingresos: null }, marketSource: null, method: { kind: "single", approach: "mercado" }, justification: null, configured: false, locked: false, excluded: [] } as unknown as ConclusionCalculationDto;
  const html = renderToStaticMarkup(<ApproachValues calculation={calculation} machinery />);
  assert.ok(html.includes(MACHINERY_UNAVAILABLE_REASONS.mercado));
  assert.ok(html.includes(MACHINERY_UNAVAILABLE_REASONS.ingresos));
  assert.doesNotMatch(html, /inmuebles|terrenos|construcciones/);
});

test("the subject's location and offer price in the technical characteristics are blank, not a datum missing", () => {
  const market = {
    ...DEFAULT_MACHINERY_MARKET, usefulLife: 10,
    offers: [{ ...emptyOffer(0), description: "Montacargas", price: 100000, age: 2, rating: 9, location: "Ciudad Inventada" }],
  };
  const input = toMachineryMarketEngineInput(market);
  assert.ok(input.ok);
  const subject = { ...EMPTY_MACHINERY_ITEM, brand: "Marca Uno", age: 4, usefulLife: 10 };
  for (const capture of [false, true]) {
    const [block] = machineryMarketBlocks(market, subject, computeMachineryMarket(input.input), { capture });
    const table = ensureTableV2(block.apartados.flatMap((apartado) => apartado.tables).find((item) => item.id === machineryMarketTableId("caracteristicas"))!);
    const row = (label: string) => table.rows.map((item) => table.columns.map((column) => {
      const cell = item.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })).find((cells) => cells[0] === label)!;
    assert.deepEqual(row("Ubicación"), ["Ubicación", "", "Ciudad Inventada"]);
    assert.deepEqual(row("Precio Oferta"), ["Precio Oferta", "", "$ 100,000.00"]);
    // A datum of the subject the cost capture lacks is still «—»: it is missing.
    assert.deepEqual(row("Modelo").slice(0, 2), ["Modelo", "—"]);
  }
});

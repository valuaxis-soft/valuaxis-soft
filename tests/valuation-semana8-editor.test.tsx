/**
 * The editor after the videos of week 8 (26 Nov 2026): leaving with work to
 * save always asks «¿Deseas guardar antes de salir?» and a comparable added
 * shows «Cambios pendientes» (8.12, 10:32–11:05); the edit view in the
 * valuation's palette (8.12, 25:50); the two «Deshacer» told apart and the
 * calculations' pages out of the document's undo (8.7, 3:29 and 18:17); the
 * title of the carátula's value written by hand (audio of 26 Nov).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CaratulaConclusionModule } from "../src/features/valuations/components/caratula-preview-modules";
import { BlockEditorHeader } from "../src/features/valuations/components/editor/section-editor";
import { CALCULATION_REDO_LABEL, CALCULATION_UNDO_LABEL } from "../src/features/valuations/components/calculation/use-draft-history";
import { EDITOR_SHADED_ROW, EDITOR_ZEBRA_ROW } from "../src/features/valuations/components/calculation/calculation-table-style";
import { EXIT_DIALOG_TITLE, leaveIntercepted, setLeaveGuard } from "../src/features/valuations/components/workspace/model/navigation-guard";
import { comparablesChanged } from "../src/features/valuations/components/workspace/model/save-status";
import { blockMetadataFromContent, hydrateBlockMetadata } from "../src/features/valuations/metadata";
import type { Block, CaratulaFormData, ValuationMeta } from "../src/features/valuations/model";
import { pendingMutations, pendingMutationsSettled, trackMutation } from "../src/lib/pending-mutations";
import "./support/ssr-portal-shim";

const source = (path: string) => readFileSync(path, "utf8");

/* ------------------------------------------------------------------ */
/*  Leaving with work to save (8.12, 10:32–11:05)                      */
/* ------------------------------------------------------------------ */

test("a calculation panel's save still on its way counts as work to save; reading does not", async () => {
  let finish: () => void = () => undefined;
  const saving = trackMutation("PUT", () => new Promise<void>((resolve) => { finish = resolve; }));
  const reading = trackMutation("GET", () => Promise.resolve("datos"));
  assert.equal(pendingMutations(), 1);
  assert.equal(await reading, "datos");
  let settled = false;
  const waiting = pendingMutationsSettled().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "leaving waits for it");
  finish();
  await saving;
  await waiting;
  assert.equal(settled, true);
  assert.equal(pendingMutations(), 0);
  // A failed save stops counting too.
  await trackMutation("POST", () => Promise.reject(new Error("sin red"))).catch(() => undefined);
  assert.equal(pendingMutations(), 0);
});

test("every way out of the editor asks while there is work to save: links, the browser, the tab, the command palette", () => {
  const save = source("src/features/valuations/components/workspace/hooks/use-valuation-save.ts");
  assert.match(save, /const mustAskBeforeLeaving = hasUnsavedChanges \|\| panelSaving;/);
  for (const guard of [/if \(!mustAskBeforeLeaving\) return;\n\s+const onBeforeUnload/, /if \(!mustAskBeforeLeaving \|\| historyGuardRef\.current\) return;/, /if \(!mustAskBeforeLeaving \|\| leavingRef\.current\) return;\n\s+const anchor/, /if \(mustAskBeforeLeaving\) \{\n\s+setPendingExit/]) {
    assert.match(save, guard);
  }
  assert.match(save, /await pendingMutationsSettled\(\);/, "«Guardar y salir» waits for the panels' saves");
  assert.match(source("src/lib/api-client.ts"), /trackMutation\(options\?\.method,/);
  assert.match(source("src/features/dashboard/components/command-palette.tsx"), /if \(leaveIntercepted\(href\)\) return;/);
  assert.match(source("src/features/valuations/components/workspace/valuation-workspace-dialogs.tsx"), /<AlertDialogTitle>\{EXIT_DIALOG_TITLE\}<\/AlertDialogTitle>/);
  assert.equal(EXIT_DIALOG_TITLE, "¿Deseas guardar antes de salir?");
});

test("a page that navigates from code asks the open editor first; without an editor it goes", () => {
  assert.equal(leaveIntercepted("/dashboard"), false);
  const asked: string[] = [];
  const release = setLeaveGuard((href) => { asked.push(href); return true; });
  assert.equal(leaveIntercepted("/avaluos"), true);
  assert.deepEqual(asked, ["/avaluos"]);
  release();
  assert.equal(leaveIntercepted("/avaluos"), false);
});

test("a comparable added, deleted or reordered marks «Cambios pendientes»; opening a market does not", () => {
  const market = (...ids: string[]) => ({ comparables: ids.map((id) => ({ id })) });
  assert.equal(comparablesChanged(undefined, market("a")), false, "the first report is the editor opening it");
  assert.equal(comparablesChanged(market("a"), market("a")), false);
  assert.equal(comparablesChanged(market("a"), market("a", "b")), true);
  assert.equal(comparablesChanged(market("a", "b"), market("b", "a")), true);
  assert.equal(comparablesChanged(market("a", "b"), market("a")), true);
  assert.match(source("src/features/valuations/components/workspace/hooks/use-calculation-document-sync.ts"), /if \(comparablesChanged\(marketsByType\.current\.get\(type\), calculation\)\) setSaveStatus\?\.\("dirty"\);/);
});

/* ------------------------------------------------------------------ */
/*  The two «Deshacer» (8.7, 3:29 and 18:17)                           */
/* ------------------------------------------------------------------ */

test("the calculation's undo says it is the calculation's; the top bar's, the valuation's", () => {
  assert.equal(CALCULATION_UNDO_LABEL, "Deshacer en este cálculo");
  assert.equal(CALCULATION_REDO_LABEL, "Rehacer en este cálculo");
  for (const panel of ["market-calculation-panel", "cost-calculation-panel"]) {
    const text = source(`src/features/valuations/components/calculation/${panel}.tsx`);
    assert.match(text, /<Undo2 data-icon="inline-start" \/> \{CALCULATION_UNDO_LABEL\}/, panel);
    assert.doesNotMatch(text, /<Undo2 data-icon="inline-start" \/> Deshacer\n/, panel);
  }
  assert.match(source("src/features/valuations/components/workspace/valuation-top-bar.tsx"), /aria-label="Deshacer en el avalúo"/);
});

test("Ctrl+Z of the document no longer takes back a calculation's pages nor jumps to them: they are written again after it", () => {
  const sync = source("src/features/valuations/components/workspace/hooks/use-calculation-document-sync.ts");
  assert.match(sync, /\}, \{ groupKey, follows: true \}\);/, "every page a calculation writes follows it");
  assert.match(sync, /updateCaratula\(\{ valorTotal: total, valorConLetra: result\.valueInWords \}, \{ follows: true \}\)/);
  assert.match(source("src/features/valuations/components/workspace/hooks/use-editor-state.ts"), /if \(!options\?\.follows\) pushEditorHistory\(current, options\);/);
  const workspace = source("src/features/valuations/components/workspace/valuation-workspace.tsx");
  assert.match(workspace, /if \(step\) void resyncCalculationsRef\.current\(\);/);
  assert.match(workspace, /resyncCalculationsRef\.current = calculationSync\.resyncAll;/);
});

/* ------------------------------------------------------------------ */
/*  The edit view in the valuation's palette (8.12, 25:50)            */
/* ------------------------------------------------------------------ */

test("the editor's tables and title bands read the valuation's palette, with the blue of always as fallback", () => {
  assert.equal(EDITOR_ZEBRA_ROW, "bg-[var(--doc-zebra,#F1F5F9)]");
  assert.equal(EDITOR_SHADED_ROW, "bg-[var(--doc-zebra-strong,#E2E8F0)]");
  const table = source("src/features/valuations/components/editor/table-editor.tsx");
  assert.match(table, /rowIndex % 2 === 0 && EDITOR_ZEBRA_ROW/);
  assert.match(table, /CALC_HEAD, "border-transparent \[&_textarea\]:text-inherit",/, "every header, not only the calculation's");
  assert.doesNotMatch(table, /bg-primary\/\[0\.03\]/);
  const header = renderToStaticMarkup(<BlockEditorHeader title="INF TERRENO"><span /></BlockEditorHeader>);
  assert.match(header, /bg-\[var\(--doc-pastel-soft,#E7EEF7\)\]/);
  assert.match(header, /text-\[color:var\(--doc-on-pastel-soft,#00285A\)\]/);
  // The chrome stays in Valuaxis blue: the workspace sets the palette only as document variables.
  assert.match(source("src/features/valuations/components/workspace/valuation-workspace.tsx"), /style=\{paletteStyle\} data-valuation-workspace=""/);
});

/* ------------------------------------------------------------------ */
/*  The title of the carátula's value, by hand (audio of 26 Nov)      */
/* ------------------------------------------------------------------ */

const caratula = { valorTotal: "1500000", valorConLetra: "UN MILLÓN QUINIENTOS MIL PESOS 00/100 M.N.", firmas: [] } as unknown as CaratulaFormData;
const machinery = { folio: "PRB-1", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "maquinaria_equipo", appraisalClass: "MAQUINARIA", essence: "Retroexcavadora" } as unknown as ValuationMeta;
const conclusion = (extra: Partial<Block> = {}): Block => ({ id: "concl", title: "CONCLUSIÓN", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...extra });

test("the carátula's value box prints the title written by hand; empty, the one of the kind of property", () => {
  const print = (valueTitle?: string) => renderToStaticMarkup(<CaratulaConclusionModule blocks={[conclusion()]} caratula={caratula} meta={machinery} valueTitle={valueTitle} />);
  assert.match(print(), /data-concluded-value-label="true">VALOR COMERCIAL DE LA RETROEXCAVADORA</);
  assert.match(print("VALOR COMERCIAL DE LA RETROEXCAVADORA CATERPILLAR 416F"), /data-concluded-value-label="true">VALOR COMERCIAL DE LA RETROEXCAVADORA CATERPILLAR 416F</);
  assert.match(print("   "), /VALOR COMERCIAL DE LA RETROEXCAVADORA</);
  // Kept with the carátula's header block, which every carátula has, and read by the dictamen from there.
  assert.match(source("src/features/valuations/components/report-preview.tsx"), /section\.blocks\.find\(\(block\) => block\.id === COMPANY_HEADER_BLOCK_ID\)\?\.valueTitle/);
  // Saved with the block, without a migration.
  const stored = JSON.parse(JSON.stringify(blockMetadataFromContent({ valueTitle: "  VALOR DE REPOSICIÓN  " })));
  assert.equal(hydrateBlockMetadata(stored).valueTitle, "VALOR DE REPOSICIÓN");
  assert.equal(hydrateBlockMetadata(blockMetadataFromContent({ valueTitle: "" })).valueTitle, undefined);
  const editor = source("src/features/valuations/components/editor/caratula-editor.tsx");
  assert.match(editor, /<FieldLabel htmlFor="caratula-value-title">Título del valor<\/FieldLabel>/);
});

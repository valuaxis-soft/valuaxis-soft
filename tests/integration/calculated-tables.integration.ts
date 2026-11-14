/**
 * Video 5.3: what the appraiser sets on the tables the calculation writes (in
 * the editor) and on the headers of the capture tables (in the panels) is
 * saved with the document and comes back the same.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { figureColumn, generatedTable, resultantColumn, textColumn } from "../../src/features/valuations/calculation/generated-content";
import { editGeneratedTable, layoutOf } from "../../src/features/valuations/calculation/generated-table-layout";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection, Block, TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { withCaptureGroup, withCaptureLabel, withTableHeaders } from "../../src/features/valuations/services/capture-headers";
import { ensureTableV2, insertTableColumnBeside, insertTableRow, printableColumns, renameTableColumn, setColumnHidden, type TableV2 } from "../../src/features/valuations/services/table";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

const TABLE_ID = "motor-costos-enfoque-tabla-construcciones-valores";
const written = () => generatedTable(TABLE_ID, "Valor de las construcciones",
  [figureColumn("Ref."), textColumn("Tipo"), figureColumn("Cons.", { group: "Factores" }), resultantColumn("FRe", "Factores")],
  [["T-1", "Casa", "0.90", "0.72"], ["T-2", "Cochera", "0.90", "0.70"]],
  { rowKeys: ["T-1", "T-2"] });
const edit = (table: TableContent, change: (table: TableV2) => TableV2) =>
  editGeneratedTable(table, (current) => ({ ...change(ensureTableV2(current)), version: 2 }) as unknown as TableContent);

test("a table the calculation writes, edited in the editor, and the capture headers of its panel are saved and read back", async () => {
  const fixture = await createValuationFixture();
  const sections = await load(fixture);
  let table = written();
  table = edit(table, (v2) => renameTableColumn(v2, "col-4", "F. Resultante"));
  table = edit(table, (v2) => setColumnHidden(v2, "col-3", true));
  table = edit(table, (v2) => insertTableColumnBeside(v2, "col-2", "right", "Notas"));
  table = edit(table, (v2) => insertTableRow(v2, v2.rows.length));
  const block: Block = {
    id: "motor-costos-enfoque", title: "ENFOQUE FÍSICO O DE COSTOS", sectionLabel: "", enabled: true, required: false, concepts: [], images: [], tables: [],
    apartados: [{ id: "motor-costos-enfoque-construcciones", title: "B) CONSTRUCCIONES", enabled: true, concepts: [], images: [], tables: [table] }],
  };
  const columns = [{ key: "fraccion", label: "Fracción" }, { key: "superficie", label: "Superficie" }, { key: "valor", label: "Valor" }];
  const captureHeaders = withTableHeaders(undefined, "costos.terreno", withCaptureGroup(withCaptureLabel(undefined, "fraccion", "Fracc."), columns, "fraccion", "superficie", "TERRENO"));
  await save(fixture, sections.map((section) => (section.id === "costos" ? { ...section, blocks: [block, ...section.blocks], captureHeaders } : section)));

  const reloaded = (await load(fixture)).find((section) => section.id === "costos")!;
  assert.deepEqual(reloaded.captureHeaders, captureHeaders, "the panel's headers come back");
  const saved = reloaded.blocks.find((item) => item.id.toLowerCase() === "motor-costos-enfoque")!.apartados[0].tables[0];
  assert.deepEqual(layoutOf(saved), layoutOf(table), "the layout comes back whole");
  assert.deepEqual(printableColumns(ensureTableV2(saved)).map((column) => column.name), ["Ref.", "Tipo", "Notas", "F. Resultante"]);
  assert.equal(ensureTableV2(saved).rows.length, 3, "with the appraiser's row");
});

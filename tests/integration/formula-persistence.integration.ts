import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { applyConceptFormulaEverywhere } from "../../src/features/valuations/concept-links";
import type { AppSection, Block, Concept, TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { buildFormulaIndex, compileFormula, formulaToText } from "../../src/features/valuations/services/formula-references";
import { ensureTableV2, setCellFormula, setCellResultFormat, type TableV2 } from "../../src/features/valuations/services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "../../src/features/valuations/services/table-formula-engine";
import { applyValuationFormulas } from "../../src/features/valuations/services/valuation-formulas";
import { concludeValuation, reopenValuation, saveValuationSections, type SectionPayload } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const SECTION_ID = "costos";

function table(id: string, title: string, columns: string[], rows: string[][]): TableV2 {
  return {
    id,
    title,
    version: 2,
    columns: columns.map((name, index) => ({ id: `col-${id}-${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `row-${id}-${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`col-${id}-${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

/** The document as the editor holds it before any formula is written. */
function editorSections(): AppSection[] {
  const block = (id: string, title: string, concepts: Concept[], tables: TableV2[]): Block => ({
    id, title, sectionLabel: "", enabled: true, required: false, concepts, apartados: [], tables: tables as unknown as TableContent[], images: [],
  });
  const homologation = table("tbl-homologacion", "Homologación", ["Ref", "Valor $/m²", "Neg.", "Zona", "Ubic.", "Sup.", "F. resultante", "Valor homologado"], [
    ["1", "$ 9,000.00", "0.95", "1.05", "0.98", "1.02", "", ""],
    ["2", "$ 8,200.00", "0.95", "1.00", "1.03", "0.97", "", ""],
    ["", "", "", "", "", "", "Promedio", ""],
  ]);
  const summary = table("tbl-resumen", "Resumen de valores", ["Concepto", "Importe"], [["Terreno", ""], ["Raíz cúbica de 27", ""], ["Dos a la décima", ""]]);
  const terreno = block("bloque-terreno", "Terreno", [
    // An id as the editor creates it before the first save: saving turns it into a key.
    { id: "Concepto Superficie 1", label: "Superficie total de terreno:", value: "169.78", valueFormat: "m2" },
    { id: "concepto-unitario", label: "Valor unitario:", value: "", type: "currency" },
    { id: "concepto-valor", label: "Valor del terreno:", value: "", type: "currency" },
    { id: "concepto-uso", label: "Uso de suelo:", value: "Habitacional" },
  ], [homologation]);
  return [{
    id: SECTION_ID,
    label: "ENF. COSTOS",
    title: "ENF. COSTOS",
    sourceFile: "",
    enabled: true,
    required: false,
    blocks: [
      { ...terreno, apartados: [{ id: "apartado-resumen", title: "Resumen", enabled: true, concepts: [{ id: "concepto-redondeado", label: "Valor redondeado:", value: "", type: "currency" }], tables: [summary as unknown as TableContent], images: [] }] },
    ],
  }];
}

const eachContent = (block: Block) => [block, ...block.apartados];

/** Writes a formula as the editor does: compiled against the document as it is, then everything recomputed. */
function write(sections: AppSection[], target: { concept: string } | { table: string; row: number; column: number }, text: string): AppSection[] {
  const index = buildFormulaIndex(sections);
  const updated = sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      const content = <T extends Pick<Block, "concepts" | "tables">>(item: T): T => {
        if ("concept" in target) {
          const compiled = compileFormula(text, { index });
          assert.ok(compiled.ok, `${text}${compiled.ok ? "" : `: ${compiled.message}`}`);
          return { ...item, concepts: applyConceptFormulaEverywhere(item.concepts, target.concept, compiled.formula) };
        }
        return {
          ...item,
          tables: item.tables.map((current) => {
            const v2 = ensureTableV2(current);
            if (v2.id !== target.table) return current;
            const compiled = compileFormula(text, { index, table: v2 });
            assert.ok(compiled.ok, `${text}${compiled.ok ? "" : `: ${compiled.message}`}`);
            return setCellFormula(v2, v2.rows[target.row - 1].id, v2.columns[target.column - 1].id, compiled.formula) as unknown as TableContent;
          }),
        };
      };
      return { ...content(block), apartados: block.apartados.map(content) };
    }),
  }));
  return applyValuationFormulas(updated);
}

function withFormulas() {
  let sections = editorSections();
  for (const row of [1, 2]) {
    sections = write(sections, { table: "tbl-homologacion", row, column: 7 }, `=REDONDEAR(C${row}*D${row}*E${row}*F${row}; 4)`);
    sections = write(sections, { table: "tbl-homologacion", row, column: 8 }, `=B${row}*G${row}`);
  }
  sections = write(sections, { table: "tbl-homologacion", row: 3, column: 8 }, "=PROMEDIO(H1:H2)");
  sections = write(sections, { concept: "concepto-unitario" }, "=[Homologación]!H3");
  sections = write(sections, { concept: "concepto-valor" }, "=[Superficie total de terreno]*[Valor unitario]");
  sections = write(sections, { concept: "concepto-redondeado" }, "=REDONDEAR([Valor del terreno]; -3)");
  sections = write(sections, { table: "tbl-resumen", row: 1, column: 2 }, "=[Valor del terreno]");
  sections = write(sections, { table: "tbl-resumen", row: 2, column: 2 }, "=RAIZ(27; 3)");
  sections = write(sections, { table: "tbl-resumen", row: 3, column: 2 }, "=2^10+[Homologación]!C1*0");
  return sections;
}

async function save(fixture: Fixture, sections: AppSection[]) {
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    // The editor's own payload, as the request carries it.
    sections: JSON.parse(JSON.stringify(buildSectionsPayload(sections))) as SectionPayload[],
  });
}

/** The saved document as the editor and the dictamen load it. */
async function load(fixture: Fixture) {
  const valuation = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.ok(valuation, "valuation loads");
  const sections = initialSectionsFor(valuation);
  const block = sections.flatMap((section) => section.blocks).find((item) => item.id === "bloque-terreno");
  assert.ok(block, "the saved block loads");
  const index = buildFormulaIndex(sections);
  const contents = eachContent(block);
  const tableById = (id: string) => ensureTableV2(contents.flatMap((item) => item.tables).find((item) => item.id === id));
  const conceptByLabel = (label: string) => {
    const found = contents.flatMap((item) => item.concepts).find((item) => item.label === label);
    assert.ok(found, label);
    return found;
  };
  return {
    sections,
    value: (label: string) => conceptByLabel(label).value,
    conceptFormula: (label: string) => {
      const formula = conceptByLabel(label).formula;
      return formula ? `=${formulaToText(formula, { index })}` : null;
    },
    cell: (tableId: string, row: number, column: number) => {
      const current = tableById(tableId);
      return getCellDisplayValue(current, current.rows[row - 1].id, current.columns[column - 1].id, evaluateTableFormulas(current));
    },
    cellFormula: (tableId: string, row: number, column: number) => {
      const current = tableById(tableId);
      const cell = current.rows[row - 1].cells[current.columns[column - 1].id];
      return cell.kind === "formula" ? `=${formulaToText(cell.formula, { index, table: current })}` : null;
    },
  };
}

function assertComputed(document: Awaited<ReturnType<typeof load>>, message: string) {
  // 0.95 × 1.05 × 0.98 × 1.02 = 0.9971; 0.95 × 1.00 × 1.03 × 0.97 = 0.9491
  assert.equal(document.cell("tbl-homologacion", 1, 7), "0.9971", message);
  assert.equal(document.cell("tbl-homologacion", 1, 8), "$8,973.90", message);
  assert.equal(document.cell("tbl-homologacion", 2, 7), "0.9491", message);
  assert.equal(document.cell("tbl-homologacion", 2, 8), "$7,782.62", message);
  assert.equal(document.cell("tbl-homologacion", 3, 8), "$8,378.26", message);
  assert.equal(document.value("Valor unitario:"), "8378.26", message);
  assert.equal(document.value("Valor del terreno:"), "1422460.98", message);
  assert.equal(document.value("Valor redondeado:"), "1422000.00", message);
  assert.equal(document.cell("tbl-resumen", 1, 2), "$1,422,460.98", message);
  assert.equal(document.cell("tbl-resumen", 2, 2), "3", message);
  assert.equal(document.cell("tbl-resumen", 3, 2), "1,024", message);
}

function assertFormulas(document: Awaited<ReturnType<typeof load>>, message: string) {
  assert.equal(document.cellFormula("tbl-homologacion", 1, 7), "=REDONDEAR(C1*D1*E1*F1; 4)", message);
  assert.equal(document.cellFormula("tbl-homologacion", 2, 8), "=B2*G2", message);
  assert.equal(document.cellFormula("tbl-homologacion", 3, 8), "=PROMEDIO(H1:H2)", message);
  assert.equal(document.cellFormula("tbl-homologacion", 1, 2), null, message);
  assert.equal(document.conceptFormula("Valor unitario:"), "=[Homologación]!H3", message);
  assert.equal(document.conceptFormula("Valor del terreno:"), "=[Superficie total de terreno]*[Valor unitario]", message);
  assert.equal(document.conceptFormula("Valor redondeado:"), "=REDONDEAR([Valor del terreno]; -3)", message);
  assert.equal(document.conceptFormula("Uso de suelo:"), null, message);
  assert.equal(document.cellFormula("tbl-resumen", 1, 2), "=[Valor del terreno]", message);
  assert.equal(document.cellFormula("tbl-resumen", 2, 2), "=RAIZ(27; 3)", message);
  assert.equal(document.cellFormula("tbl-resumen", 3, 2), "=2^10+[Homologación]!C1*0", message);
}

/** What a version stores for its concepts and cells, without row ids. */
async function storedContent(versionId: number) {
  const nodes = await prisma.nodoDocumento.findMany({
    where: { seccionDocumento: { IdVersionAvaluo: versionId }, DFechaEliminacion: null },
    orderBy: { SClave: "asc" },
    include: {
      valores: true,
      tablasDocumentos: { orderBy: { IOrden: "asc" }, include: { filas: { orderBy: { IOrden: "asc" }, include: { celdas: { orderBy: { columnaTablaDocumento: { IOrden: "asc" } } } } } } },
    },
  });
  return JSON.parse(JSON.stringify(nodes.map((node) => ({
    key: node.SClave,
    config: node.JConfiguracion,
    values: node.valores.map((value) => value.SValorTexto ?? String(value.NValorNumerico ?? "")),
    tables: node.tablasDocumentos.map((item) => ({
      name: item.SNombre,
      rows: item.filas.map((row) => row.celdas.map((cell) => ({ text: cell.SValorTexto, complex: cell.JValorComplejo, calculated: cell.BEsCalculado }))),
    })),
  }))));
}

test("typed formulas, references to other tables and to concepts, and computed concepts are saved and reloaded", async () => {
  const fixture = await createValuationFixture();
  const sections = withFormulas();
  await save(fixture, sections);

  const reloaded = await load(fixture);
  assertFormulas(reloaded, "after the first save");
  assertComputed(reloaded, "after the first save");

  // The reloaded document saves and reloads the same: nothing is lost on the second trip.
  await save(fixture, reloaded.sections);
  const again = await load(fixture);
  assertFormulas(again, "after the second save");
  assertComputed(again, "after the second save");
});

test("what is stored are the formulas and the last result of each concept, not the results of the cells", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, withFormulas());
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const stored = await storedContent(IdVersionTrabajo!);

  const concept = stored.find((node: { key: string }) => node.key === "concepto-valor");
  assert.equal(concept.config.payload.formula.expression.type, "binary");
  assert.deepEqual(concept.config.payload.formula.expression.left.operand, { type: "concept", conceptId: "Concepto Superficie 1" }, "by the id the editor gave the concept");
  assert.deepEqual(concept.values, ["1422460.98"], "the last result, for whatever reads the value without computing");
  assert.ok(stored.some((node: { key: string }) => node.key === "concepto_superficie_1"), "the concept it points at is stored under the key of that id");

  const homologation = stored.flatMap((node: { tables: Array<{ name: string }> }) => node.tables).find((item: { name: string }) => item.name === "Homologación");
  const cell = homologation.rows[0][7];
  assert.equal(cell.text, null);
  assert.equal(cell.calculated, true);
  assert.equal(cell.complex.kind, "formula");
  assert.deepEqual(cell.complex.formula.expression.left.operand, { type: "cell", rowId: "row-tbl-homologacion-1", columnId: "col-tbl-homologacion-2" });
  assert.equal(JSON.stringify(stored).includes("formulaResults"), false);
});

test("the format chosen for a result and an edited source are saved; the results follow the source", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, withFormulas());
  const first = await load(fixture);

  // The appraiser changes a factor and asks for the unit value as a plain number.
  const edited = applyValuationFormulas(first.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      tables: block.tables.map((current) => {
        const v2 = ensureTableV2(current);
        if (v2.id !== "tbl-homologacion") return current;
        const changed = { ...v2, rows: v2.rows.map((row, index) => (index === 0 ? { ...row, cells: { ...row.cells, [v2.columns[2].id]: { kind: "value" as const, value: "1.00" } } } : row)) };
        return setCellResultFormat(changed, changed.rows[0].id, changed.columns[7].id, { type: "number", precision: 2 }) as unknown as TableContent;
      }),
    })),
  })));
  await save(fixture, edited);

  const reloaded = await load(fixture);
  assertFormulas(reloaded, "after editing a source");
  // 1.00 × 1.05 × 0.98 × 1.02 = 1.0496 → 9,446.40; average with 7,782.62 = 8,614.51
  assert.equal(reloaded.cell("tbl-homologacion", 1, 7), "1.0496");
  assert.equal(reloaded.cell("tbl-homologacion", 1, 8), "9,446.40", "written with the format chosen for the cell");
  assert.equal(reloaded.cell("tbl-homologacion", 3, 8), "$8,614.51");
  assert.equal(reloaded.value("Valor unitario:"), "8614.51");
  assert.equal(reloaded.value("Valor del terreno:"), "1462571.51");
  assert.equal(reloaded.cell("tbl-resumen", 1, 2), "$1,462,571.51");
});

test("removing a formula and deleting a source are saved: the value typed stays and the reference reads #REF!", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, withFormulas());
  const first = await load(fixture);

  const edited = applyValuationFormulas(first.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      // "Valor unitario" goes back to a typed value, and the concept "Superficie" is deleted.
      concepts: applyConceptFormulaEverywhere(block.concepts, "concepto-unitario", undefined, "9000").filter((item) => item.label !== "Superficie total de terreno:"),
    })),
  })));
  await save(fixture, edited);

  const reloaded = await load(fixture);
  assert.equal(reloaded.conceptFormula("Valor unitario:"), null);
  assert.equal(reloaded.value("Valor unitario:"), "9000");
  assert.equal(reloaded.conceptFormula("Valor del terreno:"), "=#REF!*[Valor unitario]");
  assert.equal(reloaded.value("Valor del terreno:"), "#REF!");
  assert.equal(reloaded.cell("tbl-resumen", 1, 2), "#REF!");
  assert.equal(reloaded.cell("tbl-homologacion", 3, 8), "$8,378.26", "what does not read the deleted concept still computes");
});

test("conclude and reopen: the new version computes from its own copies, and editing it leaves the concluded one unchanged", async () => {
  const fixture = await createValuationFixture();
  const user = fixture.user;
  await save(fixture, withFormulas());

  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const finalBefore = await storedContent(concluded.IdVersionFinal!);
  const whileConcluded = await load(fixture);
  assertFormulas(whileConcluded, "concluded");
  assertComputed(whileConcluded, "concluded");

  await reopenValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, reason: "Revisión", acceptedText: "Acepto" });
  const reopened = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.notEqual(reopened.IdVersionTrabajo, concluded.IdVersionFinal);
  assert.deepEqual(await storedContent(reopened.IdVersionTrabajo!), finalBefore, "the reopened version starts as the concluded one");
  const afterReopen = await load(fixture);
  assertFormulas(afterReopen, "reopened");
  assertComputed(afterReopen, "reopened");

  // A source changes in the reopened version: its formulas follow, reading the copied cells and concepts.
  const edited = applyValuationFormulas(afterReopen.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map((item) => (item.label === "Superficie total de terreno:" ? { ...item, value: "200" } : item)),
    })),
  })));
  await save(fixture, edited);
  const afterEdit = await load(fixture);
  assertFormulas(afterEdit, "reopened and edited");
  assert.equal(afterEdit.value("Valor del terreno:"), "1675652.00");
  assert.equal(afterEdit.value("Valor redondeado:"), "1676000.00");
  assert.equal(afterEdit.cell("tbl-resumen", 1, 2), "$1,675,652.00");

  assert.deepEqual(await storedContent(concluded.IdVersionFinal!), finalBefore, "the concluded version is untouched");
});

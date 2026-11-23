/**
 * The reference of an installation written in the cost approach (22 nov
 * 2026): saved, read back the same, its own references never renumbered, and
 * a repeated one refused whole. With its table of the construction section
 * linked, the row of that table takes the new reference (one truth, both
 * ways); unlinked, the table keeps its own and the cost approach the new one.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  findCaptureTable,
  mergeCapture,
  readCapture,
  serverItems,
  syncedFromTable,
  withConstructionTables,
} from "../../src/features/valuations/calculation/construction-capture";
import { costInputSchema } from "../../src/features/valuations/calculation/cost-schemas";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, costInputOf, emptyInstallation, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import type { AppSection, TableContent } from "../../src/features/valuations/model";
import { construccionSection } from "../../src/features/valuations/sections/construccion";
import { ensureTableV2 } from "../../src/features/valuations/services/table";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });
const save = async (fixture: Fixture, payload: CostInputDto) => {
  await saveCostCalculation(fixture.publicId, editor(fixture), costInputSchema.parse(payload) as unknown as CostInputDto);
  return getCostCalculation(fixture.publicId, fixture.organizationId);
};
// Invented installations, with references of the appraiser's own.
const installation = (index: number, ref: string, description: string) =>
  ({ ...emptyInstallation(index), ref, description, unit: "pza", quantity: 1, age: 5, usefulLife: 30, conservation: 0.9, unitReplacementCost: 10_000 });
const refsOf = (table: TableContent) => {
  const v2 = ensureTableV2(table);
  return v2.rows.map((row) => { const cell = row.cells[v2.columns[0].id]; return cell?.kind === "value" ? cell.value : ""; });
};

test("a reference written in the cost approach is kept on reading it back, linked and unlinked, and a repeated one is refused", async () => {
  const fixture = await createValuationFixture();
  const before = await save(fixture, {
    land: { ...DEFAULT_LAND, subjectArea: 200, unitValue: 9000 },
    constructions: [],
    installations: [installation(0, "IE-1", "Cisterna inventada"), installation(1, "IE-2", "Barda inventada")],
    indirects: [],
  });
  assert.deepEqual(before.installations.map((row) => row.ref), ["IE-1", "IE-2"]);

  // The table of the construction section as the editor has it, linked, agreeing with the server.
  const section = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, before, { types: null, installations: null });
  const table = findCaptureTable(section, "installations");
  assert.ok(table);
  const synced = syncedFromTable(table, serverItems("installations", before));

  // IE-1 becomes IE-7 in the cost approach: saved, and read back the same; IE-2 is not renumbered.
  const input = costInputOf(before);
  const renamed = await save(fixture, { ...input, installations: input.installations.map((row) => (row.ref === "IE-1" ? { ...row, ref: "IE-7" } : row)) });
  assert.deepEqual(renamed.installations.map((row) => row.ref), ["IE-7", "IE-2"]);
  assert.equal(renamed.installations[0].unitReplacementCost, 10_000, "with its value and factors");

  // Linked: the row of the table takes the reference, so what the table saves next is the same.
  const linked = mergeCapture(table, serverItems("installations", renamed), synced, renamed);
  assert.deepEqual(refsOf(linked), ["IE-7", "IE-2"]);
  assert.deepEqual(readCapture(linked, "installations", null).map(({ item }) => item.ref), ["IE-7", "IE-2"]);

  // Unlinked: the table keeps its own; the cost approach keeps the new one.
  const v2 = ensureTableV2(table);
  const unlinked = { ...v2, schema: { ...(v2.schema ?? { zones: [] }), capture: { kind: "installations" as const, unlinked: true } } } as unknown as TableContent;
  assert.deepEqual(refsOf(mergeCapture(unlinked, serverItems("installations", renamed), synced, renamed)), ["IE-1", "IE-2"]);
  assert.deepEqual((await getCostCalculation(fixture.publicId, fixture.organizationId)).installations.map((row) => row.ref), ["IE-7", "IE-2"]);

  // A repeated reference is refused whole (the panel says so before sending it), and nothing saved is lost.
  const again = costInputOf(renamed);
  assert.throws(() => costInputSchema.parse({ ...again, installations: again.installations.map((row) => ({ ...row, ref: "IE-2" })) }), /no se pueden repetir/);
  assert.deepEqual((await getCostCalculation(fixture.publicId, fixture.organizationId)).installations.map((row) => row.ref), ["IE-7", "IE-2"]);
});

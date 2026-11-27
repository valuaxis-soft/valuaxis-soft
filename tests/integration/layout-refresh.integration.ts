/**
 * Video 8.3 (24 Nov 2026): «los cambios… traten de aplicármelo a lo que ya
 * trabajé». A valuation saved with the shape of before (a conclusion without
 * the concluded value, income pages written by an older generator, with the
 * appraiser's edits) is opened as the editor opens it: it takes the current
 * format and the current pages and keeps what was captured and edited; saved
 * and opened again, nothing changes. A concluded valuation is not touched.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { CONCLUSION_KEYS, isConcludedValueBlock } from "../../src/features/valuations/calculation/conclusion-document";
import { INCOME_BLOCK_PREFIX, INCOME_TEMPLATE_BLOCK_IDS, incomeDocumentBlocks } from "../../src/features/valuations/calculation/income-document";
import { getIncomeCalculation, saveIncomeCalculation } from "../../src/features/valuations/calculation/income.service";
import { DEFAULT_INCOME, incomeEngineConfig, toIncomeEngineInput, type IncomeCalculationDto } from "../../src/features/valuations/calculation/income-types";
import { replaceGeneratedBlocks } from "../../src/features/valuations/calculation/market-document";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { computeIncomeApproach } from "../../src/features/valuations/engine/income";
import type { AppSection, Block } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { LAYOUT_VERSION, hasPendingLayoutSteps, layoutStepsFor, layoutVersionOf, refreshDocumentLayout } from "../../src/features/valuations/services/layout-refresh";
import { planLayoutRefreshes, stampCurrentLayoutVersion } from "../../src/features/valuations/services/layout-refresh.service";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });
const sectionOf = (sections: AppSection[], id: string) => sections.find((section) => section.id === id)!;
const withSection = (sections: AppSection[], id: string, change: (section: AppSection) => AppSection) =>
  sections.map((section) => (section.id === id ? change(section) : section));

/** The income pages as the editor writes them on opening (useCalculationDocumentSync.applyIncome). */
function incomePages(calculation: IncomeCalculationDto): Block[] {
  const input = toIncomeEngineInput(calculation);
  return input.ok
    ? incomeDocumentBlocks(calculation, computeIncomeApproach(input.input, incomeEngineConfig(calculation)))
    : incomeDocumentBlocks(calculation, null, input.reason);
}
const syncIncome = (sections: AppSection[], calculation: IncomeCalculationDto) =>
  withSection(sections, "ingresos", (section) =>
    replaceGeneratedBlocks(section, (block) => block.id.startsWith(INCOME_BLOCK_PREFIX), incomePages(calculation), { placeholderIds: INCOME_TEMPLATE_BLOCK_IDS }));

/** What opening it in the editor does: the format (policy «all») and the calculation's pages. */
async function open(fixture: Fixture) {
  const sections = await load(fixture);
  const steps = layoutStepsFor({ policy: "all", version: layoutVersionOf(sections) });
  const refreshed = refreshDocumentLayout(sections, steps);
  const calculation = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  return { before: sections, sections: syncIncome(refreshed.sections, calculation), changes: refreshed.changes };
}

/** A valuation saved as before the recent changes: its conclusion and its income pages. */
async function oldValuation() {
  const fixture = await createValuationFixture();
  await saveIncomeCalculation(fixture.publicId, fixture.user, {
    ...DEFAULT_INCOME,
    rentableUnits: [{ description: "Casa habitación", area: 180, unitRent: 95 }],
  });
  const calculation = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  const current = incomePages(calculation);
  assert.ok(current.length >= 2, "the income approach writes its pages");
  // An older generator: the first page had another title and the last page did not exist. The appraiser hid the first one.
  const stale: Block[] = [{ ...current[0], title: "CAPITALIZACIÓN DE RENTAS (FORMATO ANTERIOR)", enabled: false }, ...current.slice(1, -1)];
  let sections = await load(fixture);
  sections = withSection(sections, "ingresos", (section) => ({ ...section, blocks: [...stale, ...section.blocks.filter((block) => !INCOME_TEMPLATE_BLOCK_IDS.includes(block.id))] }));
  // The conclusion of a firm template made before: the approaches with their values, the appraiser's text, no concluded value.
  sections = withSection(sections, "conclusiones", (section) => ({
    ...section,
    blocks: section.blocks.map((block, index) => (index ? block : {
      ...block,
      concepts: block.concepts
        .filter((concept) => ![CONCLUSION_KEYS.value, CONCLUSION_KEYS.words].includes(concept.calculationKey as never))
        .map(({ calculationKey: _key, ...concept }) => (concept.label === "Observaciones finales" ? { ...concept, value: "Observación propia del valuador." } : concept)),
    })),
  }));
  await save(fixture, sections);
  return { fixture, current };
}

test("an old valuation opened takes the current format and income pages and keeps what the appraiser captured and edited", async () => {
  const { fixture, current } = await oldValuation();
  const stored = await load(fixture);
  assert.equal(layoutVersionOf(stored), 0);
  assert.equal(sectionOf(stored, "conclusiones").blocks.some(isConcludedValueBlock), false, "as saved before: no concluded value");

  const opened = await open(fixture);
  assert.ok(opened.changes.length > 0);
  const conclusion = sectionOf(opened.sections, "conclusiones");
  const valueBlock = conclusion.blocks.find(isConcludedValueBlock);
  assert.ok(valueBlock, "the conclusion prints in the despacho's format");
  assert.equal(valueBlock.concepts.find((concept) => concept.label === "Observaciones finales")?.value, "Observación propia del valuador.");
  const income = sectionOf(opened.sections, "ingresos").blocks.filter((block) => block.id.startsWith(INCOME_BLOCK_PREFIX));
  assert.deepEqual(income.map((block) => block.title), current.map((block) => block.title), "every page of the current generator, with its current title");
  assert.equal(income[0].enabled, false, "the page the appraiser hid stays hidden");

  await save(fixture, opened.sections);
  const reopened = await load(fixture);
  assert.equal(layoutVersionOf(reopened), LAYOUT_VERSION, "the version is saved with the carátula");
  assert.equal(sectionOf(reopened, "conclusiones").blocks.find(isConcludedValueBlock)?.concepts.find((concept) => concept.calculationKey === CONCLUSION_KEYS.value)?.label, "Valor concluido");

  // Opened again: nothing to do, nothing changes.
  const again = await open(fixture);
  assert.equal(again.changes.length, 0);
  assert.equal(sectionOf(again.sections, "ingresos"), sectionOf(again.before, "ingresos"), "the income pages are the same");
  assert.equal(refreshDocumentLayout(reopened).changes.length, 0, "not even «Actualizar formato» finds anything");

  const { plans } = await planLayoutRefreshes({ policy: "all", publicIds: [fixture.publicId] });
  assert.equal(plans[0].withButton.length, 0, "the report says it is current");
});

test("the report lists an old valuation by its folio and leaves concluded valuations out, without writing", async () => {
  const { fixture } = await oldValuation();
  const concluded = await oldValuation();
  await prisma.avaluo.update({ where: { UIdentificadorPublico: concluded.fixture.publicId }, data: { BBloqueado: true, DFechaBloqueo: new Date() } });
  const before = await load(concluded.fixture);

  const { plans, concluded: skipped } = await planLayoutRefreshes({ policy: "all", publicIds: [fixture.publicId, concluded.fixture.publicId] });
  assert.deepEqual(plans.map((plan) => plan.publicId), [fixture.publicId]);
  assert.equal(skipped, 1);
  assert.ok(plans[0].onOpen.length > 0);
  assert.ok(plans[0].folio);
  // The policy «new» leaves a valuation created before the change for the button.
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { DFechaCreacion: new Date("2026-10-01T12:00:00Z") } });
  const [later] = (await planLayoutRefreshes({ policy: "new", publicIds: [fixture.publicId] })).plans;
  assert.deepEqual([later.onOpen.length, later.withButton.length > 0], [0, true]);

  // Nothing was written: the concluded one reads as before, the other is still unrefreshed.
  assert.deepEqual(await load(concluded.fixture), before);
  assert.equal(layoutVersionOf(await load(fixture)), 0);
});

test("a valuation created now is stamped with the current format: opening it changes nothing and «Actualizar formato» is not highlighted", async () => {
  const fixture = await createValuationFixture();
  // Its sections written, as «Crear avalúo» writes them (initializeWorkingVersionStructure).
  await save(fixture, await load(fixture));
  const { IdAvaluo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const version = await prisma.versionAvaluo.findFirstOrThrow({ where: { IdAvaluo }, orderBy: { IdVersionAvaluo: "desc" } });
  assert.equal(layoutVersionOf(await load(fixture)), 0, "as created before the stamp");
  await prisma.$transaction((tx) => stampCurrentLayoutVersion(tx, version.IdVersionAvaluo));

  const stamped = await load(fixture);
  assert.equal(layoutVersionOf(stamped), LAYOUT_VERSION);
  assert.equal(hasPendingLayoutSteps(stamped), false);
  assert.equal(layoutStepsFor({ policy: "all", version: layoutVersionOf(stamped) }).length, 0, "opening it runs no step");
  // Saved by the editor, the version stays with the carátula.
  await save(fixture, stamped);
  assert.equal(layoutVersionOf(await load(fixture)), LAYOUT_VERSION);
});

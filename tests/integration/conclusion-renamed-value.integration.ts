/**
 * V7.3-28 (video 7.3, 26:08): «el valor concluido debería de poderse ajustar,
 * el nombre que ellos decidan». The appraiser renames the concept of the
 * concluded value; saved and opened again, it keeps his name and keeps
 * receiving the concluded value. A valuation saved before the concepts had
 * their key is recognized once by the template label and renames the same.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { CONCLUSION_KEYS, conclusionValues, withConceptValues } from "../../src/features/valuations/calculation/conclusion-document";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { conclusionEngineConfig, conclusionInput } from "../../src/features/valuations/calculation/conclusion-types";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { concludeValue } from "../../src/features/valuations/engine/conclusion";
import type { AppSection, Concept } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

/** A valuation whose cost approach gives the value it concludes with. */
async function valuation(costs: number) {
  const fixture = await createValuationFixture();
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.ok(IdVersionTrabajo);
  await prisma.enfoqueCosto.create({ data: { IdVersionAvaluo: IdVersionTrabajo, NValorFisicoTotal: costs } });
  await saveConclusionSettings(fixture.publicId, fixture.user, { method: { kind: "single", approach: "costos" }, justification: null });
  return { ...fixture, versionId: IdVersionTrabajo };
}

const isConclusion = (section: AppSection) => section.id === "conclusiones";

/** What the editor writes in the conclusion when it syncs with the calculation. */
async function synced(fixture: Fixture, sections: AppSection[]) {
  const calculation = await getConclusionCalculation(fixture.publicId, fixture.organizationId);
  const values = conclusionValues(calculation, concludeValue(conclusionInput(calculation), conclusionEngineConfig(calculation)));
  return sections.map((section) => (isConclusion(section) ? withConceptValues(section, values) : section));
}

const mapConcluded = (sections: AppSection[], update: (concept: Concept) => Concept) => sections.map((section) => (!isConclusion(section) ? section : {
  ...section,
  blocks: section.blocks.map((block) => ({ ...block, concepts: block.concepts.map((concept) => (concept.label === "Valor concluido" || concept.calculationKey === CONCLUSION_KEYS.value ? update(concept) : concept)) })),
}));

const concludedOf = (sections: AppSection[]) =>
  sections.find(isConclusion)!.blocks.flatMap((block) => block.concepts).find((concept) => concept.calculationKey === CONCLUSION_KEYS.value);

test("a concluded value renamed «Valor de mercado» keeps its name and keeps receiving the value after saving and opening again", async () => {
  const fixture = await valuation(8_530_000);
  const opened = await load(fixture);
  assert.equal(concludedOf(opened)?.label, "Valor concluido", "a new valuation's template already carries the key");

  await save(fixture, mapConcluded(opened, (concept) => ({ ...concept, label: "Valor de mercado" })));
  const reopened = await load(fixture);
  assert.equal(concludedOf(reopened)?.label, "Valor de mercado");

  await save(fixture, await synced(fixture, reopened));
  const written = concludedOf(await load(fixture));
  assert.deepEqual([written?.label, written?.value], ["Valor de mercado", "8530000.00"]);

  // The calculation changes: the renamed concept follows it.
  await prisma.enfoqueCosto.update({ where: { IdVersionAvaluo: fixture.versionId }, data: { NValorFisicoTotal: 8_260_000 } });
  await saveConclusionSettings(fixture.publicId, fixture.user, { method: { kind: "single", approach: "costos" }, justification: null });
  await save(fixture, await synced(fixture, await load(fixture)));
  assert.equal(concludedOf(await load(fixture))?.value, "8260000.00");
});

test("a valuation saved before the key existed: recognized by its label once, then renamed, it still receives the value", async () => {
  const fixture = await valuation(8_530_000);
  // As saved before: the concept without its key.
  await save(fixture, mapConcluded(await load(fixture), ({ calculationKey: _key, ...concept }) => concept));
  const before = (await load(fixture)).find(isConclusion)!.blocks[0].concepts.find((concept) => concept.label === "Valor concluido");
  assert.equal(before?.calculationKey, undefined);

  await save(fixture, await synced(fixture, await load(fixture)));
  assert.equal(concludedOf(await load(fixture))?.value, "8530000.00", "the sync gives it its key");

  await save(fixture, mapConcluded(await load(fixture), (concept) => ({ ...concept, label: "Valor comercial" })));
  await prisma.enfoqueCosto.update({ where: { IdVersionAvaluo: fixture.versionId }, data: { NValorFisicoTotal: 8_260_000 } });
  await saveConclusionSettings(fixture.publicId, fixture.user, { method: { kind: "single", approach: "costos" }, justification: null });
  await save(fixture, await synced(fixture, await load(fixture)));
  const concluded = concludedOf(await load(fixture));
  assert.deepEqual([concluded?.label, concluded?.value], ["Valor comercial", "8260000.00"]);
});

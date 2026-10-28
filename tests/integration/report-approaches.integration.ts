/**
 * "Agregar al informe valuatorio": an approach turned off in its section is
 * saved with the document, leaves the conclusion at once and comes back when
 * it is turned on again.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { withApproachIncluded } from "../../src/features/valuations/services/report-approaches";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });
const turn = (sections: AppSection[], sectionId: string, included: boolean) =>
  sections.map((section) => (section.id === sectionId
    ? { ...section, excludedFromReport: withApproachIncluded(section, "costos", included) }
    : section));

test("the cost approach turned off for the report leaves the conclusion, is read back off and comes back when turned on", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await save(fixture, await load(fixture));
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const versionId = avaluo.IdVersionTrabajo ?? -1;
  await prisma.enfoqueCosto.create({ data: { IdVersionAvaluo: versionId, NValorFisicoTotal: 8_580_000 } });
  await prisma.enfoqueIngreso.create({ data: { IdVersionAvaluo: versionId, NValorCapitalizacion: 7_000_000 } });
  await saveConclusionSettings(fixture.publicId, user, { method: { kind: "single", approach: "costos" }, justification: null });

  const concluded = await prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(Number(concluded.NValorConcluido), 8_580_000);

  // Off: the document keeps the choice and the conclusion no longer has the cost approach.
  await save(fixture, turn(await load(fixture), "costos", false));
  const reloaded = await load(fixture);
  assert.deepEqual(reloaded.find((section) => section.id === "costos")?.excludedFromReport, ["costos"]);
  const without = await getConclusionCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(without.values.costos, null);
  assert.equal(without.values.ingresos, 7_000_000);
  assert.deepEqual(without.excluded, ["costos"]);
  const summary = await prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(summary.NValorConcluido, null, "the chosen approach left the report: nothing is concluded with it");
  assert.equal(summary.NValorEnfoqueCostos, null);

  // On again: back in the conclusion.
  await save(fixture, turn(reloaded, "costos", true));
  assert.equal((await load(fixture)).find((section) => section.id === "costos")?.excludedFromReport, undefined);
  const restored = await prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(Number(restored.NValorConcluido), 8_580_000);
  assert.deepEqual((await getConclusionCalculation(fixture.publicId, fixture.organizationId)).excluded, []);
});

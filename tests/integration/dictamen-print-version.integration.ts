/**
 * A concluded valuation never changes (Álvaro): concluding stamps the print
 * rules on its version, keeping its calculation precision, and one concluded
 * before the stamp existed reads back with print rules 0, its long titles cut
 * as they were stored, in the dictamen and in «Historial». A draft reads the
 * current rules. Every text is invented.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { precisionOf, type CalculationPrecision } from "../../src/features/valuations/calculation/calculation-precision";
import { getValuationByPublicId, getValuationVersionByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { CURRENT_PRINT_VERSION } from "../../src/features/valuations/services/print-version";
import { concludeValuation, saveValuationSections, type SectionPayload } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** Longer than the 250 characters the column of a block's title keeps. */
const LONG_TITLE = "BLOQUE DE PRUEBA CON UN TÍTULO MUY EXTENSO ".repeat(8).trim();
/** Not the precision a valuation is born with. */
const PRECISION: CalculationPrecision = { decimals: 4, calculateWithShown: true };

const document: SectionPayload[] = [{
  id: "costos",
  label: "ENF. COSTOS",
  title: "ENF. COSTOS",
  blocks: [{ id: "bloque-largo", title: LONG_TITLE, concepts: [{ id: "concepto-valor", label: "Valor", value: "1.00" }], images: [] }],
}];

async function workingVersion(fixture: Fixture) {
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.ok(IdVersionTrabajo);
  return IdVersionTrabajo;
}

async function savedWithPrecision(fixture: Fixture) {
  await saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: document });
  const versionId = await workingVersion(fixture);
  await prisma.versionAvaluo.update({ where: { IdVersionAvaluo: versionId }, data: { JConfiguracionCalculo: PRECISION } });
  return versionId;
}

const conclude = (fixture: Fixture) => concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });

const blockTitle = (valuation: Awaited<ReturnType<typeof getValuationByPublicId>>) =>
  valuation?.sections.find((section) => section.id === "costos")?.blocks.find((block) => block.id === "bloque-largo")?.title;

test("a draft reads the current print rules and its long titles whole", async () => {
  const fixture = await createValuationFixture();
  await savedWithPrecision(fixture);
  const draft = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.equal(draft?.printVersion, CURRENT_PRINT_VERSION);
  assert.equal(blockTitle(draft), LONG_TITLE);
});

test("concluding stamps the print rules and keeps the version's precision", async () => {
  const fixture = await createValuationFixture();
  const versionId = await savedWithPrecision(fixture);
  await conclude(fixture);
  const stored = await prisma.versionAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: versionId }, select: { JConfiguracionCalculo: true } });
  assert.equal((stored.JConfiguracionCalculo as Record<string, unknown>).dictamenPrintVersion, CURRENT_PRINT_VERSION);
  assert.deepEqual(precisionOf(stored.JConfiguracionCalculo), PRECISION);
  const concluded = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.equal(concluded?.printVersion, CURRENT_PRINT_VERSION);
  assert.equal(blockTitle(concluded), LONG_TITLE);
});

test("a valuation concluded before the stamp reads print rules 0 and its titles cut, in the dictamen and in «Historial»", async () => {
  const fixture = await createValuationFixture();
  const versionId = await savedWithPrecision(fixture);
  await conclude(fixture);
  // As concluded before this release: its configuration holds the precision only.
  await prisma.versionAvaluo.update({ where: { IdVersionAvaluo: versionId }, data: { JConfiguracionCalculo: PRECISION } });

  const concluded = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.equal(concluded?.locked, true);
  assert.equal(concluded?.printVersion, 0);
  const title = blockTitle(concluded);
  assert.ok(title && title.length < LONG_TITLE.length && LONG_TITLE.startsWith(title), "cut as stored");

  const { INumeroVersion } = await prisma.versionAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: versionId } });
  const history = await getValuationVersionByPublicId(fixture.publicId, fixture.organizationId, INumeroVersion);
  assert.equal(history?.printVersion, 0);
  assert.equal(blockTitle(history), title);
});

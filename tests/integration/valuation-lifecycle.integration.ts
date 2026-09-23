import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import type { TableV2 } from "../../src/features/valuations/services/table";
import { serializeTableForSave } from "../../src/features/valuations/services/table-persistence";
import {
  concludeValuation,
  reopenValuation,
  saveValuationSections,
  type SectionPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

function table(areaValue: string): TableV2 {
  return {
    id: "tbl-terreno",
    title: "Terreno",
    version: 2,
    columns: [
      { id: "col-concepto", name: "Concepto" },
      { id: "col-valor", name: "Valor" },
    ],
    rows: [
      {
        id: "row-superficie",
        cells: {
          "col-concepto": { kind: "value", value: "Superficie" },
          "col-valor": { kind: "value", value: areaValue },
        },
      },
    ],
  };
}

function sections(areaValue: string): SectionPayload[] {
  return [
    {
      id: "costos",
      label: "ENF. COSTOS",
      title: "ENF. COSTOS",
      blocks: [
        {
          id: "bloque-terreno",
          title: "Terreno",
          concepts: [{ id: "concepto-valor-unitario", label: "Valor unitario", value: "7,000.00" }],
          subBlocks: [
            {
              id: "apartado-factores",
              title: "Factores",
              concepts: [{ id: "concepto-negociacion", label: "Negociación", value: "0.95" }],
            },
          ],
          tables: [serializeTableForSave(table(areaValue) as unknown as TableContent)],
        },
      ],
    },
  ];
}

async function save(fixture: Fixture, areaValue: string) {
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: sections(areaValue),
  });
}

async function loadBlock(fixture: Fixture) {
  const valuation = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.ok(valuation);
  const block = valuation.sections
    .find((section) => section.id === "costos" || section.label === "ENF. COSTOS")
    ?.blocks.find((item) => item.id === "bloque-terreno");
  assert.ok(block, "the saved block loads");
  return block;
}

function summarize(block: Awaited<ReturnType<typeof loadBlock>>) {
  return {
    concept: block.concepts.find((concept) => concept.id === "concepto-valor-unitario")?.value,
    apartado: block.subBlocks.find((item) => item.id === "apartado-factores")?.concepts[0]?.value,
    area: block.tables[0]?.table?.rows[0]?.cells["col-valor"],
  };
}

const expected = (area: string) => ({
  concept: "7,000.00",
  apartado: "0.95",
  area: { kind: "value", value: area },
});

test("a concluded valuation still shows its content", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, "160.00");
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });

  assert.deepEqual(summarize(await loadBlock(fixture)), expected("160.00"));
});

test("reopening copies the whole document into the new working version", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, "160.00");
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  const reopened = await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    reason: "Corrección de superficie",
    acceptedText: "Acepto reabrir el avalúo",
  });

  assert.ok(("copied" in reopened ? reopened.copied?.nodes ?? 0 : 0) > 0, "nodes were copied");
  assert.deepEqual(summarize(await loadBlock(fixture)), expected("160.00"));
});

test("editing after reopening changes the working version and leaves the final one intact", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, "160.00");
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  const before = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    reason: "Corrección de superficie",
    acceptedText: "Acepto reabrir el avalúo",
  });

  await save(fixture, "175.50");
  assert.deepEqual(summarize(await loadBlock(fixture)), expected("175.50"));

  const finalCells = await prisma.celdaTablaDocumento.findMany({
    where: {
      filaTablaDocumento: { tablaDocumento: { nodoDocumento: { seccionDocumento: { IdVersionAvaluo: before.IdVersionFinal! } } } },
    },
    select: { SValorTexto: true },
  });
  assert.ok(finalCells.some((cell) => cell.SValorTexto === "160.00"), "the concluded version keeps its value");
  assert.ok(!finalCells.some((cell) => cell.SValorTexto === "175.50"), "the concluded version is not modified");
});

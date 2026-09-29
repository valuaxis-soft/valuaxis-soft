import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Prisma } from "@prisma/client";
import { saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, emptyInstallation, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import { saveIncomeCalculation } from "../../src/features/valuations/calculation/income.service";
import { DEFAULT_ANNUITY, DEFAULT_DEDUCTIONS, DEFAULT_MARKET_RATE } from "../../src/features/valuations/calculation/income-types";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, type ComparableFactorDto, type FactorType } from "../../src/features/valuations/calculation/market-types";
import type { TableContent } from "../../src/features/valuations/model";
import type { TableV2 } from "../../src/features/valuations/services/table";
import { serializeTableForSave } from "../../src/features/valuations/services/table-persistence";
import { copyVersionContent } from "../../src/features/valuations/services/valuation-version-copy.service";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/* ------------------------------------------------------------------ */
/*  A valuation with every kind of content                             */
/* ------------------------------------------------------------------ */

function table(id: string, title: string, rows: Array<[string, string, string]>): TableContent {
  const v2: TableV2 = {
    id,
    title,
    version: 2,
    columns: [
      { id: "col-concepto", name: "Concepto" },
      { id: "col-valor", name: "Valor" },
      { id: "col-nota", name: "Nota" },
    ],
    rows: rows.map(([rowId, concept, value]) => ({
      id: rowId,
      cells: {
        "col-concepto": { kind: "value", value: concept },
        "col-valor": { kind: "value", value },
        "col-nota": { kind: "value", value: `nota ${rowId}` },
      },
    })),
  };
  return serializeTableForSave(v2 as unknown as TableContent) as unknown as TableContent;
}

const factor = (type: FactorType, value: number | null, subjectRating: number | null = null, comparableRating: number | null = null): ComparableFactorDto =>
  ({ type, value, subjectRating, comparableRating, justification: `Justificación ${type}` });

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price,
    factors: [factor("NEGOCIACION", 0.95), factor("ZONA", null, 1, 1.05), factor("FRENTE", 1)],
    landUse: "Habitacional", shape: "Regular", zone: null, frontage: 8, depth: 20, topography: "Plano", services: "Completos",
    notes: `Notas ${location}`, sourceName: "Altos 360", contactName: "Contacto", contactPhone: "348 249 3129",
    url: `https://example.test/${encodeURIComponent(location)}`, offerDate: "2026-05-04",
    ...extra,
  };
}

const costs: CostInputDto = {
  land: { ...DEFAULT_LAND },
  constructions: [{
    ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media",
    area: 180, age: 5, usefulLife: 70, conservation: 0.95, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 12000,
  }],
  installations: [
    { ...emptyInstallation(0), description: "Cisterna", quantity: 1, age: 5, usefulLife: 30, conservation: 1, unitReplacementCost: 35000 },
    { ...emptyInstallation(1), description: "Barda perimetral", quantity: 40, age: 5, usefulLife: 50, conservation: 0.9, unitReplacementCost: 1500 },
  ],
  indirects: [{ concept: "Honorarios", percentage: 0.08, base: null }],
};

/** Fills every part of the document that a version copy must carry over. */
async function buildRichValuation() {
  const fixture = await createValuationFixture();
  const user = fixture.user;
  const sections = (withExtraBlock: boolean) => [{
    id: "costos",
    label: "ENF. COSTOS",
    title: "ENF. COSTOS",
    blocks: [
      {
        id: "bloque-terreno",
        title: "Terreno",
        concepts: [
          { id: "concepto-valor-unitario", label: "Valor unitario", value: "9,000.00" },
          { id: "concepto-superficie", label: "Superficie", value: 169.78 },
        ],
        images: [{ id: "foto-fachada", title: "Fachada", src: "/organizaciones/x/avaluos/y/fachada.jpg" }],
        subBlocks: [{
          id: "apartado-factores",
          title: "Factores",
          concepts: [{ id: "concepto-negociacion", label: "Negociación", value: "0.95" }],
          tables: [table("tbl-apartado", "Factores", [["row-a", "Zona", "1.05"]])],
        }],
        tables: [
          table("tbl-terreno", "Terreno", [["row-1", "Superficie", "169.78"], ["row-2", "Frente", "8.00"], ["row-3", "Fondo", "20.00"]]),
          table("tbl-retirada", "Retirada", [["row-x", "No", "0"]]),
        ],
      },
      ...(withExtraBlock
        ? [{ id: "bloque-borrado", title: "Borrado", concepts: [{ id: "concepto-huerfano", label: "Huérfano", value: "x" }] }]
        : []),
    ],
  }];

  // The extra block is saved and then removed by the editor: soft-deleted with its child.
  await saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, sections: sections(true) });
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: sections(false),
    caratula: { solicitante: "Valuadores de los Altos", propietario: "Juan Pérez", valorTotal: 8580000, fechaAvaluo: "2026-09-28", fechaVigencia: "2027-03-28" },
  });
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const versionId = IdVersionTrabajo!;

  // Parts of tables the editor removed: a column, a row and a whole table.
  const tables = await prisma.tablaDocumento.findMany({
    where: { nodoDocumento: { seccionDocumento: { IdVersionAvaluo: versionId } } },
    include: { columnas: true, filas: true },
  });
  const land = tables.find((item) => item.SNombre === "Terreno")!;
  await prisma.columnaTablaDocumento.update({
    where: { IdColumnaTablaDocumento: land.columnas.find((column) => column.SNombre === "Nota")!.IdColumnaTablaDocumento },
    data: { DFechaEliminacion: new Date() },
  });
  await prisma.filaTablaDocumento.update({ where: { IdFilaTablaDocumento: land.filas.find((row) => row.IOrden === 2)!.IdFilaTablaDocumento }, data: { BActivo: false } });
  const retired = tables.find((item) => item.SNombre === "Retirada")!;
  await prisma.tablaDocumento.update({
    where: { IdTablaDocumento: retired.IdTablaDocumento },
    data: { JConfiguracion: { ...(retired.JConfiguracion as Prisma.JsonObject), removed: true } },
  });

  // Market, with an adjustment on one comparable.
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA", subjectArea: 169.78, baseArea: null, surfacePower: 6,
    adoptedUnitValue: 9000, justification: "Dentro del rango.", additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  for (const [index, location] of ["Villa Toledo", "Virreyes", "16 de Septiembre", "Mixtecos"].entries()) {
    await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable(location, 140 + index * 10, 1_260_000 + index * 50_000));
  }
  const first = await prisma.comparableAvaluo.findFirstOrThrow({ where: { IdVersionAvaluo: versionId }, orderBy: { IOrden: "asc" } });
  await prisma.ajusteComparable.create({
    data: { IdComparableAvaluo: first.IdComparableAvaluo, SConcepto: "Ajuste por esquina", NValorOriginal: 9000, NFactor: 1.1, NValorAjustado: 9900, SJustificacion: "Esquina", IOrden: 0 },
  });

  // Rent market and income approach.
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "INMUEBLE_RENTA", subjectArea: 250, baseArea: null, surfacePower: 3,
    adoptedUnitValue: 30, justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  for (const [location, area, price] of [["Renta 1", 410, 9500], ["Renta 2", 400, 9000], ["Renta 3", 380, 8300], ["Renta 4", 350, 8000]] as const) {
    await createComparable(fixture.publicId, user, "INMUEBLE_RENTA", { ...comparable(location, area, price), factors: [factor("NEGOCIACION", 0.95)] });
  }
  await saveIncomeCalculation(fixture.publicId, user, {
    method: "tabla", annuity: DEFAULT_ANNUITY, marketRate: DEFAULT_MARKET_RATE,
    rentableUnits: [{ description: "Casa habitación", area: 250, unitRent: null }],
    deductions: DEFAULT_DEDUCTIONS, ratingColumns: [1, 3, 1, 2, 2, 0, 4], appliedRate: 0.0886,
  });

  // Costs last: the conclusion summary follows.
  await saveCostCalculation(fixture.publicId, user, costs);
  return { fixture, versionId };
}

/* ------------------------------------------------------------------ */
/*  Comparing versions                                                 */
/* ------------------------------------------------------------------ */

/** Own and parent row ids, and bookkeeping dates, that are expected to differ in a copy. */
const ROW_KEYS = /^(Id(SeccionDocumento|NodoDocumento|NodoPadre|VersionAvaluo|TablaDocumento|ColumnaTablaDocumento|FilaTablaDocumento|CeldaTablaDocumento|ValorNodoDocumento|CaratulaAvaluo|ComparableAvaluo|AjusteComparable|FactorHomologacion|EnfoqueIngreso|DeduccionIngreso|ResumenValor|EnfoqueMercado|ConstruccionAvaluo|TipoConstruccionAvaluo|InstalacionEspecialAvaluo|CostoIndirecto|EnfoqueCosto|CostoTerreno|CostoConstruccion|CostoInstalacion)|UIdentificadorPublico|DFechaCreacion|DFechaModificacion)$/;

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !ROW_KEYS.test(key))
      .map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

const byKey = <T extends { SClave: string }>(rows: T[]) => [...rows].sort((a, b) => a.SClave.localeCompare(b.SClave));

/** Everything a version holds, as content without row ids; only live nodes, columns and rows. */
async function versionContent(versionId: number) {
  const sections = await prisma.seccionDocumento.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: [{ IOrden: "asc" }, { SClave: "asc" }] });
  const nodes = await prisma.nodoDocumento.findMany({
    where: { seccionDocumento: { IdVersionAvaluo: versionId }, DFechaEliminacion: null, OR: [{ IdNodoPadre: null }, { nodoPadre: { DFechaEliminacion: null } }] },
    include: {
      seccionDocumento: { select: { SClave: true } },
      nodoPadre: { select: { SClave: true } },
      valores: true,
      tablasDocumentos: {
        include: {
          columnas: { where: { DFechaEliminacion: null }, orderBy: { IOrden: "asc" } },
          filas: {
            where: { BActivo: true },
            orderBy: { IOrden: "asc" },
            include: { celdas: { where: { columnaTablaDocumento: { DFechaEliminacion: null } }, include: { columnaTablaDocumento: { select: { SClave: true } } } } },
          },
        },
      },
    },
  });
  const liveNodes = byKey(nodes.map((node) => ({
    ...node,
    tablasDocumentos: node.tablasDocumentos
      .filter((item) => !(item.JConfiguracion as { removed?: boolean } | null)?.removed)
      .map((item) => ({ ...item, filas: item.filas.map((row) => ({ ...row, celdas: [...row.celdas].sort((a, b) => a.columnaTablaDocumento.SClave.localeCompare(b.columnaTablaDocumento.SClave)) })) })),
  })));
  const comparables = await prisma.comparableAvaluo.findMany({
    where: { IdVersionAvaluo: versionId },
    include: { ajustesComparables: { orderBy: { IOrden: "asc" } }, factoresHomologacion: { orderBy: { IOrden: "asc" } } },
    orderBy: [{ IdTipoComparable: "asc" }, { IOrden: "asc" }],
  });
  const constructions = await prisma.construccionAvaluo.findMany({ where: { IdVersionAvaluo: versionId }, include: { tiposConstruccion: true } });
  const installations = await prisma.instalacionEspecialAvaluo.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { SReferencia: "asc" } });
  const indirects = await prisma.costoIndirecto.findMany({ where: { IdVersionAvaluo: versionId } });
  const costApproach = await prisma.enfoqueCosto.findUnique({
    where: { IdVersionAvaluo: versionId },
    include: {
      costosTerrenos: true,
      costosConstrucciones: { include: { tipoConstruccionAvaluo: { select: { SReferencia: true } } } },
      costosInstalaciones: { include: { instalacionEspecialAvaluo: { select: { SReferencia: true } } } },
    },
  });
  const income = await prisma.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId }, include: { deduccionesIngreso: { orderBy: { IOrden: "asc" } } } });
  const summary = await prisma.resumenValor.findUnique({ where: { IdVersionAvaluo: versionId } });
  const market = await prisma.enfoqueMercado.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { IdTipoComparable: "asc" } });
  const caratula = await prisma.caratulaAvaluo.findUnique({ where: { IdVersionAvaluo: versionId } });
  return { sections, nodes: liveNodes, comparables, constructions, installations, indirects, costApproach, income, summary, market, caratula };
}

/** Row ids of every copied table, to prove no row is shared between two versions. */
async function rowIds(versionId: number) {
  const content = await versionContent(versionId);
  const tables = content.nodes.flatMap((node) => node.tablasDocumentos);
  return {
    sections: content.sections.map((row) => row.IdSeccionDocumento),
    nodes: content.nodes.map((row) => row.IdNodoDocumento),
    values: content.nodes.flatMap((node) => node.valores.map((value) => value.IdValorNodoDocumento)),
    tables: tables.map((row) => row.IdTablaDocumento),
    columns: tables.flatMap((item) => item.columnas.map((column) => column.IdColumnaTablaDocumento)),
    rows: tables.flatMap((item) => item.filas.map((row) => row.IdFilaTablaDocumento)),
    cells: tables.flatMap((item) => item.filas.flatMap((row) => row.celdas.map((cell) => cell.IdCeldaTablaDocumento))),
    comparables: content.comparables.map((row) => row.IdComparableAvaluo),
    comparablePublicIds: content.comparables.map((row) => row.UIdentificadorPublico),
    adjustments: content.comparables.flatMap((row) => row.ajustesComparables.map((item) => item.IdAjusteComparable)),
    factors: content.comparables.flatMap((row) => row.factoresHomologacion.map((item) => item.IdFactorHomologacion)),
    constructions: content.constructions.map((row) => row.IdConstruccionAvaluo),
    constructionTypes: content.constructions.flatMap((row) => row.tiposConstruccion.map((item) => item.IdTipoConstruccionAvaluo)),
    installations: content.installations.map((row) => row.IdInstalacionEspecialAvaluo),
    indirects: content.indirects.map((row) => row.IdCostoIndirecto),
    costApproach: [content.costApproach?.IdEnfoqueCosto],
    costRows: [
      ...(content.costApproach?.costosTerrenos.map((row) => `t${row.IdCostoTerreno}`) ?? []),
      ...(content.costApproach?.costosConstrucciones.map((row) => `c${row.IdCostoConstruccion}`) ?? []),
      ...(content.costApproach?.costosInstalaciones.map((row) => `i${row.IdCostoInstalacion}`) ?? []),
    ],
    income: [content.income?.IdEnfoqueIngreso],
    deductions: content.income?.deduccionesIngreso.map((row) => row.IdDeduccionIngreso) ?? [],
    summary: [content.summary?.IdResumenValor],
    market: content.market.map((row) => row.IdEnfoqueMercado),
    caratula: [content.caratula?.IdCaratulaAvaluo],
  };
}

async function newEmptyVersion(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const state = await prisma.estadoVersionAvaluo.findFirstOrThrow({ where: { SClave: "TRABAJO" } });
  const last = await prisma.versionAvaluo.aggregate({ where: { IdAvaluo: avaluo.IdAvaluo }, _max: { INumeroVersion: true } });
  const version = await prisma.versionAvaluo.create({
    data: {
      IdAvaluo: avaluo.IdAvaluo,
      IdUsuarioCreador: fixture.user.id,
      IdEstadoVersionAvaluo: state.IdEstadoVersionAvaluo,
      INumeroVersion: Math.max(90, (last._max.INumeroVersion ?? 0) + 1),
    },
  });
  return version.IdVersionAvaluo;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test("a version copy carries every section, node, value, table, comparable, approach and the caratula", async () => {
  const { fixture, versionId } = await buildRichValuation();
  const target = await newEmptyVersion(fixture);
  const stats = await prisma.$transaction((tx) => copyVersionContent(tx, { fromVersionId: versionId, toVersionId: target }), { timeout: 60_000 });

  const source = await versionContent(versionId);
  const copy = await versionContent(target);
  assert.deepEqual(plain(copy), plain(source), "the copy has the same content");

  // The source really had all of it, so the comparison above is meaningful.
  assert.ok(source.sections.length > 1);
  assert.ok(source.nodes.some((node) => node.valores.some((value) => value.SValorTexto === "organizaciones/x/avaluos/y/fachada.jpg")), "image reference");
  assert.equal(source.comparables.length, 8);
  assert.equal(source.comparables[0].ajustesComparables.length, 1);
  assert.ok(source.comparables.every((row) => row.factoresHomologacion.length > 0));
  assert.equal(source.constructions.length, 1);
  assert.equal(source.installations.length, 2);
  assert.equal(source.indirects.length, 1);
  assert.equal(source.costApproach?.costosConstrucciones.length, 1);
  assert.equal(source.costApproach?.costosInstalaciones.length, 2);
  assert.ok((source.income?.deduccionesIngreso.length ?? 0) > 0);
  assert.ok(source.summary && source.caratula);
  assert.equal(source.market.length, 2);

  assert.equal(stats.sections, source.sections.length);
  assert.equal(stats.nodes, copy.nodes.length);
  assert.equal(stats.comparables, 8);
  assert.equal(stats.caratula, true);
  assert.equal(stats.tables, copy.nodes.flatMap((node) => node.tablasDocumentos).length);
});

test("the copy shares no row with the source and its references point inside the copy", async () => {
  const { fixture, versionId } = await buildRichValuation();
  const target = await newEmptyVersion(fixture);
  await prisma.$transaction((tx) => copyVersionContent(tx, { fromVersionId: versionId, toVersionId: target }), { timeout: 60_000 });

  const source = await rowIds(versionId);
  const copy = await rowIds(target);
  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    assert.equal(copy[key].length, source[key].length, `${key}: same number of rows`);
    const shared = copy[key].filter((id) => source[key].some((other) => String(other) === String(id)));
    assert.deepEqual(shared, [], `${key}: no shared row`);
  }

  // Cost rows point to the copy's construction types and installations.
  const approach = await prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: target }, include: { costosConstrucciones: true, costosInstalaciones: true } });
  assert.ok(approach.costosConstrucciones.every((row) => copy.constructionTypes.includes(row.IdTipoConstruccionAvaluo)));
  assert.ok(approach.costosInstalaciones.every((row) => copy.installations.includes(row.IdInstalacionEspecialAvaluo)));
  // Cells point to the copy's columns.
  const cells = await prisma.celdaTablaDocumento.findMany({ where: { IdCeldaTablaDocumento: { in: copy.cells as bigint[] } }, select: { IdColumnaTablaDocumento: true } });
  assert.ok(cells.every((cell) => copy.columns.includes(cell.IdColumnaTablaDocumento)));
});

test("deleted nodes, their children, removed tables, deleted columns and inactive rows are not copied", async () => {
  const { fixture, versionId } = await buildRichValuation();
  const target = await newEmptyVersion(fixture);
  await prisma.$transaction((tx) => copyVersionContent(tx, { fromVersionId: versionId, toVersionId: target }), { timeout: 60_000 });

  const nodes = await prisma.nodoDocumento.findMany({ where: { seccionDocumento: { IdVersionAvaluo: target } }, include: { tablasDocumentos: { include: { columnas: true, filas: true } } } });
  const titles = nodes.map((node) => node.STitulo);
  assert.ok(!titles.includes("Borrado"), "the removed block");
  assert.ok(!titles.includes("Huérfano"), "the removed block's concept");
  assert.ok(nodes.every((node) => node.DFechaEliminacion === null), "only live nodes");
  const tables = nodes.flatMap((node) => node.tablasDocumentos);
  assert.ok(!tables.some((item) => item.SNombre === "Retirada"), "the removed table");
  const land = tables.find((item) => item.SNombre === "Terreno")!;
  assert.deepEqual(land.columnas.map((column) => column.SNombre).sort(), ["Concepto", "Valor"], "the deleted column");
  assert.equal(land.filas.length, 2, "the inactive row");
  assert.ok(land.filas.every((row) => row.BActivo));
});

test("copying an empty version copies nothing and does not fail", async () => {
  const fixture = await createValuationFixture();
  const from = await newEmptyVersion(fixture);
  const to = await newEmptyVersion(fixture);
  const stats = await prisma.$transaction((tx) => copyVersionContent(tx, { fromVersionId: from, toVersionId: to }));
  assert.deepEqual(stats, { sections: 0, nodes: 0, values: 0, tables: 0, columns: 0, rows: 0, cells: 0, caratula: false, comparables: 0 });
});

test("after reopening, edits to the working version never reach the concluded version", async () => {
  const { fixture } = await buildRichValuation();
  const user = fixture.user;
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const finalBefore = plain(await versionContent(concluded.IdVersionFinal!));

  await reopenValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, reason: "Revisión", acceptedText: "Acepto" });
  const reopened = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.deepEqual(plain(await versionContent(reopened.IdVersionTrabajo!)), finalBefore, "the reopened version starts as the concluded one");

  // Edit everything that can be edited in the new version.
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  await updateComparable(fixture.publicId, user, market.comparables[0].id, comparable("Villa Toledo", 150, 2_000_000));
  await saveMarketSettings(fixture.publicId, user, { ...market.settings, adoptedUnitValue: 9500 });
  await saveCostCalculation(fixture.publicId, user, { ...costs, installations: costs.installations.slice(0, 1) });
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "costos", label: "ENF. COSTOS", title: "ENF. COSTOS", blocks: [{ id: "bloque-terreno", title: "Terreno", concepts: [{ id: "concepto-valor-unitario", label: "Valor unitario", value: "9,500.00" }] }] }],
    caratula: { solicitante: "Otro solicitante" },
  });

  assert.deepEqual(plain(await versionContent(concluded.IdVersionFinal!)), finalBefore, "the concluded version is untouched");
  const final = await prisma.versionAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: concluded.IdVersionFinal! } });
  assert.ok(final.SHashContenido, "and keeps its content hash");
});

test("editing a comparable after reopening leaves the concluded version's property and publication as they were", async () => {
  const { fixture } = await buildRichValuation();
  const user = fixture.user;
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  const { IdVersionFinal } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const finalComparable = () => prisma.comparableAvaluo.findFirstOrThrow({
    where: { IdVersionAvaluo: IdVersionFinal!, IReferencia: 1, tipoComparable: { SClave: "TERRENO_VENTA" } },
    include: { propiedad: true, publicacionPropiedad: true },
  });
  const before = await finalComparable();

  await reopenValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, reason: "Revisión", acceptedText: "Acepto" });
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  await updateComparable(fixture.publicId, user, market.comparables[0].id, comparable("Otra ubicación", 300, 3_000_000, { url: "https://example.test/otra" }));

  const after = await finalComparable();
  assert.equal(after.propiedad.SNombre, before.propiedad.SNombre);
  assert.equal(String(after.propiedad.NSuperficieTerreno), String(before.propiedad.NSuperficieTerreno));
  assert.equal(after.publicacionPropiedad?.SURL, before.publicacionPropiedad?.SURL);
  assert.equal(String(after.publicacionPropiedad?.NPrecio), String(before.publicacionPropiedad?.NPrecio));
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getOrderedValuationSections } from "../../src/features/valuations/sections/section-registry";
import {
  concludeValuation,
  initializeWorkingVersionStructure,
  reopenValuation,
  saveValuationSections,
  ValuationWorkflowError,
  type SectionPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { ensureWorkingVersion } from "../../src/features/valuations/services/valuation-workflow/working-version";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const REOPEN = { reason: "Corrección de superficie", acceptedText: "Acepto reabrir el avalúo" };

/** Rejects with a ValuationWorkflowError of `status` (and `message`, when given). */
async function rejectsWith(promise: Promise<unknown>, status: number, message?: string | RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ValuationWorkflowError, `expected ValuationWorkflowError, got ${String(error)}`);
    assert.equal(error.status, status);
    if (typeof message === "string") assert.equal(error.message, message);
    if (message instanceof RegExp) assert.match(error.message, message);
    return true;
  });
}

function document(overrides: { concepts?: string[]; blocks?: string[]; images?: string[]; value?: string } = {}): SectionPayload[] {
  const blockIds = overrides.blocks ?? ["bloque-terreno"];
  return [{
    id: "costos",
    label: "ENF. COSTOS",
    title: "ENF. COSTOS",
    // Concepts and images go in the first block; editor ids are unique in a section.
    blocks: blockIds.map((blockId, index) => ({
      id: blockId,
      title: `Bloque ${blockId}`,
      concepts: (index > 0 ? [] : overrides.concepts ?? ["concepto-valor-unitario"]).map((conceptId) => ({
        id: conceptId,
        label: conceptId,
        value: overrides.value ?? "7,000.00",
      })),
      images: (index > 0 ? [] : overrides.images ?? []).map((imageId) => ({ id: imageId, title: "Fachada", src: `/uploads/2026-09/${imageId}.jpg` })),
    })),
  }];
}

const save = (fixture: Fixture, sections: SectionPayload[] = document(), user = fixture.user, organizationId = fixture.organizationId) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId, user, sections });
const conclude = (fixture: Fixture, organizationId = fixture.organizationId) =>
  concludeValuation({ publicId: fixture.publicId, organizationId, user: fixture.user });
const reopen = (fixture: Fixture, input: Partial<typeof REOPEN> = {}, organizationId = fixture.organizationId) =>
  reopenValuation({ publicId: fixture.publicId, organizationId, user: fixture.user, ...REOPEN, ...input });
const avaluo = (fixture: Fixture) => prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });

/** Live nodes of a version, by the editor's id (the payload's id). */
async function liveNodes(versionId: number) {
  const nodes = await prisma.nodoDocumento.findMany({
    where: { seccionDocumento: { IdVersionAvaluo: versionId }, DFechaEliminacion: null },
    include: { valores: true },
  });
  return new Map(nodes.map((node) => {
    const payload = (node.JConfiguracion as { payload?: { id?: string } } | null)?.payload;
    return [payload?.id ?? node.SClave, node];
  }));
}

/* ------------------------------------------------------------------ */
/*  Tenant isolation                                                   */
/* ------------------------------------------------------------------ */

test("another organization can neither save, conclude nor reopen a valuation, and nothing changes", async () => {
  const fixture = await createValuationFixture();
  const intruder = await createValuationFixture();
  await save(fixture);
  const before = await avaluo(fixture);

  await rejectsWith(save(fixture, document({ value: "1.00" }), intruder.user, intruder.organizationId), 404, "Avaluo no encontrado");
  await rejectsWith(conclude(fixture, intruder.organizationId), 404);
  await conclude(fixture);
  await rejectsWith(reopen(fixture, {}, intruder.organizationId), 404);

  const after = await avaluo(fixture);
  assert.equal(after.IdVersionFinal, before.IdVersionTrabajo, "only the owner concluded it");
  assert.equal(after.IdVersionTrabajo, null, "the intruder did not reopen it");
  const nodes = await liveNodes(after.IdVersionFinal!);
  assert.equal(nodes.get("concepto-valor-unitario")?.valores[0]?.SValorTexto, "7,000.00", "the intruder's value was not saved");
});

test("a deleted valuation cannot be saved, concluded or reopened", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { BActivo: false, DFechaEliminacion: new Date() } });
  await rejectsWith(save(fixture), 404);
  await rejectsWith(conclude(fixture), 404);
  await rejectsWith(reopen(fixture), 404);
});

/* ------------------------------------------------------------------ */
/*  Conclude                                                           */
/* ------------------------------------------------------------------ */

test("concluding locks the valuation, finalizes the version with a hash and records the history", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  const before = await avaluo(fixture);
  const result = await conclude(fixture);

  assert.ok("hash" in result && /^[0-9a-f]{64}$/.test(result.hash!));
  assert.equal("status" in result && result.status, "TERMINADO");
  const after = await avaluo(fixture);
  assert.equal(after.BBloqueado, true);
  assert.equal(after.IdVersionTrabajo, null);
  assert.equal(after.IdVersionFinal, before.IdVersionTrabajo);
  assert.ok(after.DFechaConclusion && after.DFechaBloqueo);
  const version = await prisma.versionAvaluo.findUniqueOrThrow({
    where: { IdVersionAvaluo: after.IdVersionFinal! },
    include: { estadoVersionAvaluo: true },
  });
  assert.equal(version.estadoVersionAvaluo.SClave, "FINALIZADA");
  assert.equal(version.IdUsuarioFinalizador, fixture.user.id);
  assert.equal(version.SHashContenido, "hash" in result ? result.hash : null);
  const history = await prisma.estadoAvaluoHistorial.findMany({ where: { IdAvaluo: after.IdAvaluo }, include: { estadoNuevo: true, estadoAnterior: true } });
  assert.deepEqual(history.map((row) => [row.estadoAnterior?.SClave, row.estadoNuevo.SClave, row.SMotivo, row.IdUsuario]), [
    ["NUEVO", "TERMINADO", "Conclusion de avaluo", fixture.user.id],
  ]);
});

test("concluding twice writes no second history entry and keeps the first final version", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  const first = await avaluo(fixture);
  await conclude(fixture).catch(() => undefined);
  const after = await avaluo(fixture);
  assert.equal(after.IdVersionFinal, first.IdVersionFinal);
  assert.equal(await prisma.estadoAvaluoHistorial.count({ where: { IdAvaluo: after.IdAvaluo } }), 1);
});

test("concluding twice reports that it is already concluded", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  assert.deepEqual(await conclude(fixture), { id: fixture.publicId, alreadyConcluded: true });
});

test("a valuation that was never edited cannot be concluded", async () => {
  const fixture = await createValuationFixture();
  await rejectsWith(conclude(fixture), 409, "No existe version de trabajo");
  assert.equal((await avaluo(fixture)).BBloqueado, false);
});

test("a document without visible required sections cannot be concluded", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  const { IdVersionTrabajo } = await avaluo(fixture);
  await prisma.seccionDocumento.updateMany({ where: { IdVersionAvaluo: IdVersionTrabajo!, BObligatoria: true }, data: { BVisible: false } });
  await rejectsWith(conclude(fixture), 409, "No hay secciones obligatorias configuradas para concluir");
  const after = await avaluo(fixture);
  assert.equal(after.BBloqueado, false, "nothing was locked");
  assert.equal(after.IdVersionTrabajo, IdVersionTrabajo);
});

test("a concluded valuation rejects edits and keeps its content", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  await rejectsWith(save(fixture, document({ value: "9,999.00" })), 409, "El avaluo esta bloqueado");
  const { IdVersionFinal } = await avaluo(fixture);
  assert.equal((await liveNodes(IdVersionFinal!)).get("concepto-valor-unitario")?.valores[0]?.SValorTexto, "7,000.00");
});

/* ------------------------------------------------------------------ */
/*  Reopen                                                             */
/* ------------------------------------------------------------------ */

test("reopening needs a reason and the accepted terms", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  await rejectsWith(reopen(fixture, { reason: "   " }), 400, "El motivo es obligatorio");
  await rejectsWith(reopen(fixture, { acceptedText: "" }), 400, "La aceptacion de terminos es obligatoria");
  assert.equal((await avaluo(fixture)).BBloqueado, true, "still concluded");
});

test("a valuation that was never concluded cannot be reopened", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await rejectsWith(reopen(fixture), 409, "No existe version final para reabrir");
});

test("reopening creates the next version from the final one and records who, why and what was accepted", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  const concluded = await avaluo(fixture);
  const result = await reopen(fixture);

  const after = await avaluo(fixture);
  assert.equal(after.BBloqueado, false);
  assert.equal(after.DFechaBloqueo, null);
  assert.equal(after.INumeroVersionActual, concluded.INumeroVersionActual + 1);
  assert.equal(after.IdVersionFinal, concluded.IdVersionFinal, "the final version stays as it was");
  assert.ok("versionId" in result && after.IdVersionTrabajo === result.versionId);
  const version = await prisma.versionAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: after.IdVersionTrabajo! }, include: { estadoVersionAvaluo: true } });
  assert.equal(version.IdVersionOrigen, concluded.IdVersionFinal);
  assert.equal(version.INumeroVersion, after.INumeroVersionActual);
  assert.equal(version.SMotivoReapertura, REOPEN.reason);
  assert.equal(version.STextoAceptacion, REOPEN.acceptedText);
  assert.equal(version.BTerminosAceptados, true);
  assert.equal(version.estadoVersionAvaluo.BPermiteEdicion, true);
  const reopening = await prisma.reaperturaAvaluo.findFirstOrThrow({ where: { IdAvaluo: after.IdAvaluo } });
  assert.deepEqual(
    [reopening.IdVersionAnterior, reopening.IdVersionNueva, reopening.IdUsuario, reopening.SMotivo, reopening.STextoAceptado],
    [concluded.IdVersionFinal, after.IdVersionTrabajo, fixture.user.id, REOPEN.reason, REOPEN.acceptedText],
  );
  const history = await prisma.estadoAvaluoHistorial.findMany({ where: { IdAvaluo: after.IdAvaluo }, orderBy: { IdEstadoAvaluoHistorial: "asc" } });
  assert.equal(history.length, 2);
  assert.equal(history[1].SMotivo, REOPEN.reason);
  assert.equal(history[1].IdVersionAvaluo, after.IdVersionTrabajo);
});

test("reopening an open valuation does nothing", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  await reopen(fixture);
  const open = await avaluo(fixture);
  assert.deepEqual(await reopen(fixture), { id: fixture.publicId, alreadyOpen: true });
  const after = await avaluo(fixture);
  assert.equal(after.IdVersionTrabajo, open.IdVersionTrabajo);
  assert.equal(after.INumeroVersionActual, open.INumeroVersionActual);
  assert.equal(await prisma.reaperturaAvaluo.count({ where: { IdAvaluo: after.IdAvaluo } }), 1);
});

test("conclude, reopen, edit, conclude again: each final version keeps its own content", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, document({ value: "100.00" }));
  await conclude(fixture);
  const first = (await avaluo(fixture)).IdVersionFinal!;
  await reopen(fixture);
  await save(fixture, document({ value: "200.00" }));
  await conclude(fixture);
  const second = await avaluo(fixture);

  assert.notEqual(second.IdVersionFinal, first);
  assert.equal(second.INumeroVersionActual, 2);
  assert.equal((await liveNodes(first)).get("concepto-valor-unitario")?.valores[0]?.SValorTexto, "100.00");
  assert.equal((await liveNodes(second.IdVersionFinal!)).get("concepto-valor-unitario")?.valores[0]?.SValorTexto, "200.00");
  await reopen(fixture);
  assert.equal((await avaluo(fixture)).INumeroVersionActual, 3);
});

test("a reopened valuation is in the REABIERTO status", async () => {
  const fixture = await createValuationFixture();
  await save(fixture);
  await conclude(fixture);
  await reopen(fixture);
  const after = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId }, include: { estadoAvaluo: true } });
  assert.equal(after.estadoAvaluo.SClave, "REABIERTO");
});

/* ------------------------------------------------------------------ */
/*  Working version and saving                                         */
/* ------------------------------------------------------------------ */

test("the working version is created once, with every section of the registry, and is idempotent", async () => {
  const fixture = await createValuationFixture();
  const { IdAvaluo } = await avaluo(fixture);
  const versionId = await initializeWorkingVersionStructure({ avaluoId: IdAvaluo, userId: fixture.user.id });
  const again = await initializeWorkingVersionStructure({ avaluoId: IdAvaluo, userId: fixture.user.id });
  assert.equal(again, versionId);
  assert.equal(await ensureWorkingVersion({ avaluoId: IdAvaluo, userId: fixture.user.id }), versionId);
  assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo } }), 1);

  const registry = getOrderedValuationSections();
  const sections = await prisma.seccionDocumento.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { IOrden: "asc" } });
  assert.equal(sections.length, registry.length, "no duplicated sections");
  assert.deepEqual(sections.map((section) => section.SNombre), registry.map((definition) => definition.label));
  assert.deepEqual(sections.map((section) => section.BObligatoria), registry.map((definition) => definition.required));

  // Every section has content roots; running twice does not duplicate them.
  const roots = await prisma.nodoDocumento.groupBy({
    by: ["IdSeccionDocumento"],
    where: { seccionDocumento: { IdVersionAvaluo: versionId }, IdNodoPadre: null, DFechaEliminacion: null },
    _count: { _all: true },
  });
  assert.equal(roots.length, registry.length);
  const construction = sections.find((section) => registry.find((item) => item.label === section.SNombre)?.key === "CONSTRUCCION")!;
  const constructionRoots = roots.find((row) => row.IdSeccionDocumento === construction.IdSeccionDocumento)!._count._all;
  assert.ok(constructionRoots >= 1, "the construction section starts with its template blocks");
  await initializeWorkingVersionStructure({ avaluoId: IdAvaluo, userId: fixture.user.id });
  const rootsAgain = await prisma.nodoDocumento.count({ where: { seccionDocumento: { IdVersionAvaluo: versionId }, IdNodoPadre: null, DFechaEliminacion: null } });
  assert.equal(rootsAgain, roots.reduce((sum, row) => sum + row._count._all, 0));
});

test("the general caratula template replaces an empty placeholder only when asked", async () => {
  const fixture = await createValuationFixture();
  const { IdAvaluo } = await avaluo(fixture);
  const versionId = await initializeWorkingVersionStructure({ avaluoId: IdAvaluo, userId: fixture.user.id });
  const caratula = await prisma.seccionDocumento.findFirstOrThrow({ where: { IdVersionAvaluo: versionId, IOrden: 0 } });
  const placeholder = await prisma.nodoDocumento.findMany({ where: { IdSeccionDocumento: caratula.IdSeccionDocumento, DFechaEliminacion: null } });
  assert.equal(placeholder.length, 1, "without the option the caratula only has its placeholder");

  await initializeWorkingVersionStructure({
    avaluoId: IdAvaluo,
    userId: fixture.user.id,
    initializeGeneralCaratula: true,
    generalCaratulaDefaults: { responsibleName: "Ing. Álvaro Gutiérrez", valuationDate: "2026-09-28" },
  });
  const live = await prisma.nodoDocumento.findMany({ where: { IdSeccionDocumento: caratula.IdSeccionDocumento, DFechaEliminacion: null } });
  assert.ok(live.length > 1, "the template blocks were written");
  assert.ok(!live.some((node) => node.IdNodoDocumento === placeholder[0].IdNodoDocumento), "the empty placeholder was retired");
});

test("ensureWorkingVersion rejects a valuation that does not exist", async () => {
  await rejectsWith(ensureWorkingVersion({ avaluoId: -1, userId: 1 }), 404);
});

test("saving removes the blocks, concepts and images the editor no longer sends", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, document({ blocks: ["bloque-a", "bloque-b"], concepts: ["c-1", "c-2"], images: ["foto-1", "foto-2"] }));
  const { IdVersionTrabajo } = await avaluo(fixture);
  const first = await liveNodes(IdVersionTrabajo!);
  for (const id of ["bloque-a", "bloque-b", "c-1", "c-2", "foto-1", "foto-2"]) assert.ok(first.has(id), `${id} saved`);
  assert.equal(first.get("foto-1")?.valores[0]?.SValorTexto, "uploads/2026-09/foto-1.jpg", "images keep the storage key, not the URL");

  await save(fixture, document({ blocks: ["bloque-a"], concepts: ["c-2"], images: ["foto-2"] }));
  const second = await liveNodes(IdVersionTrabajo!);
  assert.ok(second.has("bloque-a") && second.has("c-2") && second.has("foto-2"));
  for (const id of ["bloque-b", "c-1", "foto-1"]) assert.ok(!second.has(id), `${id} was removed`);
  const removed = await prisma.nodoDocumento.findMany({ where: { IdNodoDocumento: { in: ["bloque-b", "c-1", "foto-1"].map((id) => first.get(id)!.IdNodoDocumento) } } });
  assert.ok(removed.every((node) => node.DFechaEliminacion && !node.BVisible), "soft-deleted, not destroyed");
});

test("saving the same section by id or label updates one section, and the caratula is stored", async () => {
  const fixture = await createValuationFixture();
  const longTitle = "Título ".repeat(60);
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: [{ ...document()[0], title: longTitle, enabled: false, sortOrder: 7 }],
    caratula: { solicitante: "  Valuadores de los Altos  ", valorTotal: "8,580,000.00", fechaAvaluo: "2026-09-28", valuador: "" },
  });
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: [{ ...document({ value: "7,500.00" })[0], id: undefined, label: "costos" }],
  });
  const { IdVersionTrabajo } = await avaluo(fixture);
  const sections = await prisma.seccionDocumento.findMany({ where: { IdVersionAvaluo: IdVersionTrabajo!, SClave: { in: ["costos", "COSTOS"] } } });
  assert.equal(sections.length, 1, "no duplicated section");
  assert.equal((await liveNodes(IdVersionTrabajo!)).get("concepto-valor-unitario")?.valores[0]?.SValorTexto, "7,500.00");

  const caratula = await prisma.caratulaAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: IdVersionTrabajo! } });
  assert.equal(caratula.SNombreSolicitante, "Valuadores de los Altos");
  assert.equal(Number(caratula.NValorTotal), 8580000);
  assert.equal(caratula.SNombreValuador, null);
  assert.equal(caratula.DFechaAvaluo?.toISOString().slice(0, 10), "2026-09-28");
});

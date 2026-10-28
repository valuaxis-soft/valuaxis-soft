/**
 * The calculation memory on the local database: what it reads from a real
 * valuation (a free table with formulas, the land market and the cost
 * approach), and its PDF route with permissions, tenant isolation and
 * concluded valuations. Chromium is replaced by a fake that "prints" a small PDF.
 */
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { chromium } from "playwright-core";
import { POST } from "../../src/app/api/avaluos/[id]/memoria-calculo/pdf/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND } from "../../src/features/valuations/calculation/cost-types";
import { createComparable, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { ENGINE_VERSION } from "../../src/features/valuations/engine/config";
import { loadCalculationMemory } from "../../src/features/valuations/memory/calculation-memory.service";
import type { MemoryTable } from "../../src/features/valuations/memory/calculation-memory";
import type { AppSection, TableContent } from "../../src/features/valuations/model";
import { buildFormulaIndex, compileFormula } from "../../src/features/valuations/services/formula-references";
import { setCellFormula, type TableV2 } from "../../src/features/valuations/services/table";
import { ValuationWorkflowError } from "../../src/features/valuations/services/valuation-workflow/errors";
import { concludeValuation, saveValuationSections, type SectionPayload } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const FAKE_PDF = Buffer.from("%PDF-1.7\n% memoria de prueba\n%%EOF\n");
const originalChromiumPath = process.env.CHROMIUM_PATH;

after(async () => {
  if (originalChromiumPath === undefined) delete process.env.CHROMIUM_PATH;
  else process.env.CHROMIUM_PATH = originalChromiumPath;
  await prisma.$disconnect();
});

/** Replaces Chromium: records what was opened and how, and returns a small PDF. */
function fakeChromium(t: TestContext) {
  process.env.CHROMIUM_PATH = "/fake/chromium";
  const opened: Array<{ url: string; cookies: Array<{ name: string; value: string }>; options: Record<string, unknown> }> = [];
  t.mock.method(chromium, "launch", async () => {
    let cookies: Array<{ name: string; value: string }> = [];
    let url = "";
    const page = {
      setDefaultTimeout() {},
      async goto(target: string) {
        url = target;
        return { ok: () => true, status: () => 200 };
      },
      url: () => url,
      async emulateMedia() {},
      async evaluate() {},
      locator: () => ({ count: async () => 3 }),
      waitForTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
      pdf: async (options: Record<string, unknown>) => {
        opened.push({ url, cookies, options });
        return FAKE_PDF;
      },
    };
    return {
      async newContext() {
        return {
          async addCookies(list: Array<{ name: string; value: string }>) {
            cookies = list.map(({ name, value }) => ({ name, value }));
          },
          async route() {},
          newPage: async () => page,
        };
      },
      async close() {},
    };
  });
  return opened;
}

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

/** A free table whose last column multiplies the first two, in the costs section. */
function documentWithFormulas(): AppSection[] {
  let table: TableV2 = {
    id: "tbl-memoria",
    title: "Cálculo libre",
    version: 2,
    columns: ["Superficie", "Valor unitario", "Importe"].map((name, index) => ({ id: `col-${index + 1}`, name })),
    rows: [["169.78", "9000", ""]].map((row, rowIndex) => ({
      id: `row-${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`col-${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
  const compiled = compileFormula("=A1*B1", { index: buildFormulaIndex([]), table });
  assert.ok(compiled.ok);
  table = setCellFormula(table, "row-1", "col-3", compiled.formula);
  return [{
    id: "costos",
    label: "VI",
    title: "ENF. COSTOS",
    sourceFile: "",
    enabled: true,
    required: false,
    blocks: [{
      id: "bloque-libre", title: "Cálculos del perito", sectionLabel: "", enabled: true, required: false,
      concepts: [], apartados: [], tables: [table as unknown as TableContent], images: [],
    }],
  }];
}

/** A valuation with a formula table, a land market of four comparables and a cost approach. */
async function capturedValuation() {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: JSON.parse(JSON.stringify(buildSectionsPayload(documentWithFormulas()))) as SectionPayload[],
  });
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA",
    subjectArea: 169.78,
    baseArea: null,
    surfacePower: 6,
    adoptedUnitValue: 9000,
    justification: null,
    additionalAmount: 0,
    factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  for (const [location, area, price] of [["Villa Toledo", 140, 1260000], ["Virreyes", 140, 1220000], ["Mixtecos", 140, 1330000], ["Encino", 196.62, 2261130]] as const) {
    await createComparable(fixture.publicId, user, "TERRENO_VENTA", {
      location, area, price,
      factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }, { type: "ZONA", value: null, subjectRating: 0.9, comparableRating: 1, justification: null }],
      landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
      notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
    });
  }
  await saveCostCalculation(fixture.publicId, user, {
    land: { ...DEFAULT_LAND },
    constructions: [{
      ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media",
      area: 120, age: 10, usefulLife: 60, conservation: 1, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 12000,
    }],
    installations: [],
    indirects: [],
  });
  return fixture;
}

/** A member of the fixture's organization with `roleKey`, signed in. */
async function signIn(fixture: Fixture, roleKey: string) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return { jar, token };
}

async function post(jar: TestCookieJar, publicId: string) {
  const request = new Request(`http://localhost/api/avaluos/${publicId}/memoria-calculo/pdf`, {
    method: "POST",
    headers: { "x-real-ip": "203.0.113.10", "user-agent": "Pruebas" },
  });
  const context = { params: Promise.resolve({ id: publicId }) } as Parameters<typeof POST>[1];
  return withCookies(jar, () => POST(request, context));
}

/* ------------------------------------------------------------------ */
/*  What the memory reads                                              */
/* ------------------------------------------------------------------ */

test("the memory of a captured valuation has its formula table and the traces of the market and the cost approach", async () => {
  const fixture = await capturedValuation();
  const { memory, comparables } = await loadCalculationMemory(fixture.user, fixture.publicId, new Date("2026-10-20T12:00:00Z"));
  assert.equal(comparables.length, 4, "the memoria técnica has the sheet of each comparable used");
  assert.ok(comparables.every((card) => card.type === "TERRENO_VENTA" && card.uses.length === 0));

  const [table] = memory.document.filter((item): item is MemoryTable => item.kind === "table");
  assert.equal(table.title, "Cálculo libre");
  assert.deepEqual(table.columns.map((column) => column.letter), ["A", "B", "C"]);
  assert.deepEqual(table.rows[0].cells.map((cell) => [cell.address, cell.computed, cell.formula ?? null]), [
    ["A1", false, null],
    ["B1", false, null],
    ["C1", true, "=A1*B1"],
  ]);
  assert.equal(table.rows[0].cells[2].withValues, "=169.78*9000");

  // In the order of the dictamen: the cost approach prints before the market (as in the books), the conclusion last.
  assert.deepEqual(memory.approaches.map((approach) => approach.key), ["MOTOR.COSTOS", "MOTOR.MERCADO.TERRENO_VENTA", "MOTOR.CONCLUSION"]);
  for (const approach of memory.approaches) {
    assert.ok(approach.steps.length > 0, `${approach.key} has steps`);
    assert.equal(approach.storedVersion, ENGINE_VERSION, `${approach.key} was stored by this engine`);
    assert.equal(approach.differs, false, `${approach.key} reproduces what was stored`);
  }
  const market = memory.approaches.find((approach) => approach.key === "MOTOR.MERCADO.TERRENO_VENTA")!;
  assert.equal(market.steps.at(-1)?.key, "mercado.valor");
  assert.equal(market.captured.length, 4, "the zone factor of each comparable was typed as =0.9/1");
  assert.equal(market.captured[0].formula, "=0.9/1");
});

test("a concluded valuation keeps its memory, read from the final version", async () => {
  const fixture = await capturedValuation();
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: editor(fixture) });
  const { memory } = await loadCalculationMemory(fixture.user, fixture.publicId);
  assert.equal(memory.concluded, true);
  assert.ok(memory.approaches.find((approach) => approach.key === "MOTOR.COSTOS")?.steps.length);
  assert.equal(memory.document.length, 1);
});

test("another organization's valuation is not found", async () => {
  const victim = await capturedValuation();
  const intruder = await createValuationFixture();
  await assert.rejects(loadCalculationMemory(intruder.user, victim.publicId), (error: unknown) =>
    error instanceof ValuationWorkflowError && error.status === 404);
});

/* ------------------------------------------------------------------ */
/*  PDF route                                                          */
/* ------------------------------------------------------------------ */

test("every role that exports prints the memory with its own session and page numbers; the export is audited", async (t) => {
  for (const roleKey of ["ADMINISTRADOR", "VALUADOR", "REVISOR", "CONSULTA"]) {
    const opened = fakeChromium(t);
    const fixture = await capturedValuation();
    const { jar, token } = await signIn(fixture, roleKey);
    const response = await post(jar, fixture.publicId);
    assert.equal(response.status, 200, roleKey);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="Memoria-de-calculo-${folio}.pdf"`);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(FAKE_PDF));

    assert.equal(opened.length, 1);
    assert.match(opened[0].url, new RegExp(`/avaluos/${fixture.publicId}/memoria-calculo$`));
    assert.deepEqual(opened[0].cookies, [{ name: AUTH_SESSION_COOKIE, value: token }]);
    assert.equal(opened[0].options.displayHeaderFooter, true, "page numbers at the foot");

    const audit = await prisma.auditoria.findFirstOrThrow({ where: { SIdentificadorEntidad: fixture.publicId, SAccion: "VALUATION_EXPORT" } });
    assert.deepEqual(audit.JMetadatos, { format: "memoria-calculo-pdf", final: false, bytes: FAKE_PDF.length });
  }
});

test("a concluded valuation's memory is still printed", async (t) => {
  fakeChromium(t);
  const fixture = await capturedValuation();
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: editor(fixture) });
  const { jar } = await signIn(fixture, "CONSULTA");
  const response = await post(jar, fixture.publicId);
  assert.equal(response.status, 200);
  const audit = await prisma.auditoria.findFirstOrThrow({ where: { SIdentificadorEntidad: fixture.publicId, SAccion: "VALUATION_EXPORT" } });
  assert.equal((audit.JMetadatos as { final?: boolean }).final, true);
});

test("through the route, another organization's valuation is not found and nothing is printed", async (t) => {
  const opened = fakeChromium(t);
  const victim = await capturedValuation();
  const intruder = await createValuationFixture();
  const { jar } = await signIn(intruder, "ADMINISTRADOR");
  const response = await post(jar, victim.publicId);
  assert.equal(response.status, 404);
  assert.equal(opened.length, 0);
});

test("without a session the route answers 401", async (t) => {
  const opened = fakeChromium(t);
  const fixture = await createValuationFixture();
  const response = await post(new TestCookieJar(), fixture.publicId);
  assert.equal(response.status, 401);
  assert.equal(opened.length, 0);
});

test("a valuation without content has no memory to print", async (t) => {
  const opened = fakeChromium(t);
  const fixture = await createValuationFixture({ precision: "shown" });
  const { jar } = await signIn(fixture, "VALUADOR");
  const response = await post(jar, fixture.publicId);
  assert.equal(response.status, 409);
  assert.equal(opened.length, 0);
});

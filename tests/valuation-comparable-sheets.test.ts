import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

import { WARNING_HELP, comparableWarnings } from "../src/features/valuations/calculation/comparable-review";
import type { ReviewRowDto } from "../src/features/valuations/calculation/comparable-card.service";
import { cleanAttributes, MAX_COMPARABLE_ATTRIBUTES } from "../src/features/valuations/calculation/market-types";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { buildComparableListHref, hasAdvancedFilters, parseComparableListParams } from "../src/features/valuations/comparable-base/comparable-list-params";
import { sheetRows } from "../src/features/valuations/components/calculation/comparable-sheet";
import { reviewRowMatches } from "../src/features/valuations/components/calculation/comparable-review-dialog";
import { crc32, storedZip } from "../src/features/valuations/services/stored-zip";

/* ------------------------------------------------------------------ */
/*  Deliverables: the .zip                                             */
/* ------------------------------------------------------------------ */

/** Reads a ZIP back by its central directory, as an unzipper does. */
function readZip(archive: Buffer) {
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50, "end of central directory");
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const files: Array<{ name: string; data: Buffer; crc: number }> = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, "central header");
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const size = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const local = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    assert.equal(archive.readUInt32LE(local), 0x04034b50, "local header");
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const raw = archive.subarray(start, start + size);
    files.push({ name, crc, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    offset += 46 + nameLength;
  }
  return files;
}

test("CRC-32 is the one ZIP stores", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("the deliverables zip carries the dictamen and the memory as they are, with their names", () => {
  const dictamen = Buffer.from("%PDF-1.7 dictamen");
  const memory = Buffer.from("%PDF-1.7 memoria de cálculo");
  const archive = storedZip([
    { name: "Dictamen-VDA-0001.pdf", data: dictamen },
    { name: "Memoria-de-calculo-VDA-0001.pdf", data: memory },
  ], new Date(2026, 9, 28, 10, 30));
  const files = readZip(archive);
  assert.deepEqual(files.map((file) => file.name), ["Dictamen-VDA-0001.pdf", "Memoria-de-calculo-VDA-0001.pdf"]);
  assert.deepEqual(files[0].data, dictamen);
  assert.deepEqual(files[1].data, memory);
  assert.equal(files[1].crc, crc32(memory));
});

/* ------------------------------------------------------------------ */
/*  Characteristics added to a comparable                              */
/* ------------------------------------------------------------------ */

test("added characteristics keep a name and a value, trimmed, each name once", () => {
  assert.deepEqual(cleanAttributes([
    { name: "  Alberca ", value: " Sí " },
    { name: "Vista", value: "" },
    { name: "", value: "algo" },
    { name: "alberca", value: "Techada" },
    { name: "Amueblado", value: "Parcial" },
  ]), [{ name: "alberca", value: "Techada" }, { name: "Amueblado", value: "Parcial" }]);
  assert.deepEqual(cleanAttributes(null), []);
  assert.equal(cleanAttributes(Array.from({ length: 30 }, (_, index) => ({ name: `C${index}`, value: "x" }))).length, MAX_COMPARABLE_ATTRIBUTES);
});

test("a comparable takes its added characteristics; a client of before leaves them out", () => {
  const base = {
    location: "Juárez 12", area: 100, price: 1000000, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null,
    services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
  };
  assert.equal(comparableInputSchema.parse(base).attributes, undefined);
  assert.deepEqual(comparableInputSchema.parse({ ...base, attributes: [{ name: "Alberca", value: "Sí" }] }).attributes, [{ name: "Alberca", value: "Sí" }]);
  assert.equal(comparableInputSchema.safeParse({ ...base, attributes: [{ name: "x".repeat(61), value: "Sí" }] }).success, false);
});

test("the base filters by an added characteristic and its value, and the link keeps them", () => {
  const params = parseComparableListParams({ caracteristica: " Alberca ", valorCaracteristica: "sí" });
  assert.equal(params.attribute, "Alberca");
  assert.equal(params.attributeValue, "sí");
  assert.equal(hasAdvancedFilters(params), true);
  assert.equal(buildComparableListHref(params), "/comparables?caracteristica=Alberca&valorCaracteristica=s%C3%AD");
  assert.equal(hasAdvancedFilters(parseComparableListParams({})), false);
});

/* ------------------------------------------------------------------ */
/*  Review: filters, search and the help of each warning               */
/* ------------------------------------------------------------------ */

function reviewRow(overrides: Partial<ReviewRowDto["comparable"]>, status?: "VERIFICADO" | "RECHAZADO"): ReviewRowDto {
  return {
    type: "INMUEBLE_VENTA",
    warnings: [{ key: "NO_SCREENSHOT", message: "Sin pantalla de referencia." }],
    comparable: {
      id: "c-1", reference: 1, location: "Av. Hidalgo 300, col. Centro", area: 100, price: 1000000, landUse: null, shape: null, zone: null,
      frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: "Inmuebles24", contactName: "Ana Pérez",
      contactPhone: null, url: null, offerDate: null, photos: [], factors: [], folio: 123,
      ...(status ? { review: { status, checks: {}, notes: "Precio confirmado por teléfono", reviewedBy: null, reviewedAt: null } } : {}),
      ...overrides,
    },
  };
}

test("the review finds a comparable by its number, place, source, contact, notes, state or warning, without accents or case", () => {
  const row = reviewRow({}, "VERIFICADO");
  for (const query of ["C-00123", "hidalgo centro", "INMUEBLES24", "perez", "telefono", "verificado", "pantalla", ""]) {
    assert.equal(reviewRowMatches(row, query), true, query);
  }
  assert.equal(reviewRowMatches(row, "zapopan"), false);
  assert.equal(reviewRowMatches(reviewRow({}), "verificado"), false, "a comparable not reviewed reads as por revisar");
});

test("every warning has its help, and the portal contact and the missing screenshot explain what to do", () => {
  const warnings = comparableWarnings(
    { location: "Calle sin número", area: 100, sourceName: "Inmuebles24", contactName: "Inmuebles24", contactPhone: null, offerDate: null, hasScreenshot: false },
    { type: "TERRENO_VENTA", subjectArea: null, today: "2026-10-28" },
  );
  assert.deepEqual(warnings.map((warning) => warning.key), ["NO_NUMBER", "PORTAL_CONTACT", "NO_SCREENSHOT"]);
  for (const warning of warnings) assert.ok(WARNING_HELP[warning.key].length > 40, warning.key);
  assert.match(WARNING_HELP.PORTAL_CONTACT, /sólo por portal/);
  assert.match(WARNING_HELP.NO_SCREENSHOT, /Ctrl\+V/);
});

/* ------------------------------------------------------------------ */
/*  The sheet's layout                                                 */
/* ------------------------------------------------------------------ */

test("the sheet puts two pairs per row and a wide item on a row of its own", () => {
  const items = [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "wide", wide: true }, { label: "d" }];
  assert.deepEqual(sheetRows(items).map((row) => row.map((item) => item.label)), [["a", "b"], ["c"], ["wide"], ["d"]]);
});

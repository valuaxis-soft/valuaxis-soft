import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { isPlatformOperator, parseOperatorEmails } from "../src/features/operator/operator-access";
import { parseUserDirectoryParams, searchTerms, specialtyText, userDirectoryQuery, userKindLabel } from "../src/features/operator/user-directory-params";
import { buildUserDirectoryWorkbook } from "../src/features/operator/user-directory-workbook";
import type { UserDirectoryEntry } from "../src/features/operator/user-directory.repository";

test("without OPERATOR_EMAILS nobody is an operator", () => {
  assert.equal(isPlatformOperator("dueno@example.test", undefined), false);
  assert.equal(isPlatformOperator("dueno@example.test", ""), false);
  assert.equal(isPlatformOperator("dueno@example.test", " , "), false);
  assert.equal(isPlatformOperator(null, "dueno@example.test"), false);
});

test("OPERATOR_EMAILS is a comma-separated list, case-insensitive and trimmed", () => {
  const raw = " Dueno@Example.test ,otro@example.test,";
  assert.deepEqual([...parseOperatorEmails(raw)], ["dueno@example.test", "otro@example.test"]);
  assert.equal(isPlatformOperator("DUENO@example.TEST", raw), true);
  assert.equal(isPlatformOperator("otro@example.test", raw), true);
  assert.equal(isPlatformOperator("dueno@example.test.evil", raw), false);
  assert.equal(isPlatformOperator("x-dueno@example.test", raw), false);
});

test("the directory's query string is validated: anything invalid falls back to the default", () => {
  assert.deepEqual(parseUserDirectoryParams({}), { q: "", accredited: "todos", sort: "alta", direction: "desc", page: 1 });
  assert.deepEqual(
    parseUserDirectoryParams({ q: "  Ana López ", acreditado: "si", orden: "acceso", dir: "asc", page: "3" }),
    { q: "Ana López", accredited: "si", sort: "acceso", direction: "asc", page: 3 },
  );
  assert.deepEqual(
    parseUserDirectoryParams({ q: "x".repeat(500), acreditado: "quizá", orden: "folio", dir: "up", page: "-2" }),
    { q: "", accredited: "todos", sort: "alta", direction: "desc", page: 1 },
  );
  assert.equal(parseUserDirectoryParams({ page: ["2", "9"] }).page, 2);
  assert.equal(parseUserDirectoryParams({ page: "1e9" }).page, 1);
});

test("the query string carries only what differs from the defaults", () => {
  assert.equal(userDirectoryQuery({ q: "", accredited: "todos", sort: "alta", direction: "desc", page: 1 }), "");
  assert.equal(userDirectoryQuery({ q: "ana", accredited: "no", sort: "acceso", direction: "asc", page: 2 }), "q=ana&acreditado=no&orden=acceso&dir=asc&page=2");
  assert.deepEqual(searchTerms("  a b  c d e f g h "), ["a", "b", "c", "d", "e", "f"]);
});

const entry: UserDirectoryEntry = {
  publicId: "00000000-0000-4000-8000-000000000001",
  name: "Persona Inventada Uno",
  email: "persona@example.test",
  emailVerified: true,
  phone: "33 0000 0000",
  active: true,
  memberships: [
    { organization: "Despacho Ficticio", kind: "TEAM", role: "Valuador" },
    { organization: "Personal de Persona", kind: "PERSONAL", role: "Administrador" },
  ],
  accreditation: "ACREDITADO",
  accreditationLevel: "Maestría",
  accreditationProgram: "Maestría en Valuación Inmobiliaria",
  signedUpAt: new Date("2026-10-01T18:00:00Z"),
  lastAccessAt: null,
  valuationsCreated: 7,
  valuationsConcluded: 3,
};

test("the export carries who the person is and two counts, nothing else", async () => {
  const buffer = await buildUserDirectoryWorkbook({ items: [entry], truncatedFrom: 1 });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Usuarios");
  assert.ok(sheet);
  const header = (sheet.getRow(1).values as unknown[]).slice(1);
  assert.deepEqual(header, [
    "Nombre", "Correo", "Correo verificado", "Teléfono (sin verificar)", "Cuenta", "Despachos y rol",
    "Tipo de usuario", "Acreditación", "Especialidad (grado)", "Alta", "Último acceso", "Avalúos creados", "Avalúos concluidos",
  ]);
  const row = (sheet.getRow(2).values as unknown[]).slice(1);
  assert.equal(row[0], "Persona Inventada Uno");
  assert.equal(row[2], "Sí");
  assert.equal(row[5], "Despacho Ficticio (Valuador); Personal de Persona (Administrador)");
  assert.equal(row[6], "Acreditado");
  assert.equal(row[7], "Acreditado");
  assert.equal(row[8], "Maestría · Maestría en Valuación Inmobiliaria");
  assert.ok(row[9] instanceof Date);
  assert.equal(row[10], undefined);
  assert.equal(row[11], 7);
  assert.equal(row[12], 3);
  // No address of any kind: the platform keeps no municipality or state.
  assert.ok(!header.some((name) => /direcci|municipio|estado|c[oó]digo postal/i.test(String(name))));
  assert.equal(sheet.rowCount, 2, "no truncation note when everything fits");

  const truncated = new ExcelJS.Workbook();
  await truncated.xlsx.load((await buildUserDirectoryWorkbook({ items: [entry], truncatedFrom: 12 })) as unknown as ArrayBuffer);
  assert.match(String(truncated.getWorksheet("Usuarios")?.getRow(3).getCell(1).value), /Se exportaron 1 de 12 usuarios/);
});

test("two kinds of user: «Acreditado» with the cédula verified, «No acreditado» everyone else (25 Nov 2026)", () => {
  assert.equal(userKindLabel("ACREDITADO"), "Acreditado");
  for (const state of ["NO_ACREDITADO", "EN_REVISION", "RECHAZADO"]) assert.equal(userKindLabel(state), "No acreditado", state);
  assert.equal(specialtyText({ accreditationLevel: "Especialidad", accreditationProgram: null }), "Especialidad");
  assert.equal(specialtyText({ accreditationLevel: null, accreditationProgram: null }), null);
});

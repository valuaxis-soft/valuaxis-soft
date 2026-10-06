import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CaratulaSignaturesModule } from "../src/features/valuations/components/caratula-preview-modules";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import type { CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import { hasCaratulaValidationErrors, validateCaratula } from "../src/features/valuations/services/caratula-validation";
import {
  formatValidityMonths,
  isValidityMonths,
  MAX_SIGNATURES,
  parseSignatures,
  resolveSignatures,
  signatureErrors,
  signatureListError,
  validityMonthsBetween,
  validUntilDate,
} from "../src/features/valuations/services/valuation-signatures";
import { saveFullValuationSchema } from "../src/features/valuations/validations/valuation-api.schemas";

const ana = { name: "Arq. Ana Ruiz", cedula: "7654321", role: "Perito valuador" };
const beto = { name: "Ing. Beto Díaz", cedula: "1234567", role: "" };

const caratula: CaratulaFormData = {
  tituloInmueble: "Casa",
  numeroAvaluo: "VLO-0001",
  folio: "VLO-0001",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  firmas: [ana, beto],
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "2026-09-28",
  mesesVigencia: 6,
  fechaVigencia: "",
};

const meta = { folio: "VLO-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;
const letterhead: Letterhead = { name: "Despacho", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

/* ------------------------------------------------------------------ */
/*  Validity                                                           */
/* ------------------------------------------------------------------ */

test("the validity is a whole number of months from 1 to 12", () => {
  for (const months of [1, 6, 8, 12]) assert.equal(isValidityMonths(months), true);
  for (const value of [0, 13, 24, 6.5, -1, "6", null, undefined, Number.NaN]) assert.equal(isValidityMonths(value), false);
});

test("months print in singular and plural", () => {
  assert.equal(formatValidityMonths(1), "1 mes");
  assert.equal(formatValidityMonths(6), "6 meses");
  assert.equal(formatValidityMonths(12), "12 meses");
});

test("the validity date is the valuation date plus the months, clamped to the month's end", () => {
  assert.equal(validUntilDate("2026-09-28", 6), "2027-03-28");
  assert.equal(validUntilDate("2026-08-31", 6), "2027-02-28");
  assert.equal(validUntilDate("2026-09-28T06:00:00.000Z", 12), "2027-09-28");
  assert.equal(validUntilDate("", 6), null);
  assert.equal(validUntilDate("28/09/2026", 6), null);
  assert.equal(validUntilDate("2026-09-28", null), null);
});

test("an old validity date becomes months only when it is 1 to 12 whole months away", () => {
  assert.equal(validityMonthsBetween("2026-09-28", "2027-03-28"), 6);
  assert.equal(validityMonthsBetween("2026-08-31", "2027-02-28"), 6);
  assert.equal(validityMonthsBetween("2026-09-28", "2027-09-28"), 12);
  assert.equal(validityMonthsBetween("2026-09-28", "2027-03-15"), null);
  assert.equal(validityMonthsBetween("2026-09-28", "2028-03-28"), null, "18 months is over the limit");
  assert.equal(validityMonthsBetween("2026-09-28", ""), null);
});

test("the page header prints only the date the validity reaches, never the months", () => {
  const header = (data: CaratulaFormData) => renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula: data, letterhead }));
  assert.match(header(caratula), /Vigencia del Avalúo:<\/strong> 28 de Marzo de 2027<\/p>/);
  assert.match(header({ ...caratula, mesesVigencia: 1 }), /<\/strong> 28 de Octubre de 2026<\/p>/);
  assert.doesNotMatch(header(caratula), /meses|hasta/);
  // Months without a valuation date reach no date yet.
  assert.match(header({ ...caratula, mesesVigencia: 8, fechaAvaluo: "" }), /Vigencia del Avalúo:<\/strong> —<\/p>/);
  // Saved before the validity was in months, at a date that is not whole months away.
  assert.match(header({ ...caratula, mesesVigencia: null, fechaVigencia: "2027-03-15" }), /<\/strong> 15 de Marzo de 2027/);
});

/* ------------------------------------------------------------------ */
/*  Signatures                                                         */
/* ------------------------------------------------------------------ */

test("a signature needs a name and a cédula; the title is optional", () => {
  assert.deepEqual(signatureErrors(beto), {});
  assert.deepEqual(signatureErrors({ name: " ", cedula: "", role: "" }), {
    name: "Escribe el nombre de quien firma.",
    cedula: "Escribe la cédula profesional de quien firma.",
  });
  assert.equal(signatureErrors({ name: "N".repeat(181), cedula: "1", role: "" }).name, "Máximo 180 caracteres.");
  assert.equal(signatureErrors({ name: "Ana", cedula: "1".repeat(61), role: "" }).cedula, "Máximo 60 caracteres.");
  assert.equal(signatureErrors({ name: "Ana", cedula: "1", role: "R".repeat(121) }).role, "Máximo 120 caracteres.");
});

test("a list accepts from none to twenty signatures and names the first incomplete one", () => {
  assert.equal(signatureListError([]), null);
  assert.equal(signatureListError([ana]), null);
  assert.equal(signatureListError(Array.from({ length: 10 }, () => ana)), null);
  assert.equal(signatureListError(Array.from({ length: MAX_SIGNATURES }, () => ana)), null);
  assert.equal(signatureListError(Array.from({ length: MAX_SIGNATURES + 1 }, () => ana)), "Un avalúo admite máximo 20 firmas.");
  assert.equal(signatureListError([ana, { ...beto, cedula: "" }]), "Firma 2: Escribe la cédula profesional de quien firma.");
  // A valuation in progress is saved with the cédula still missing; the name is always needed.
  assert.equal(signatureListError([ana, { ...beto, cedula: "" }], { draft: true }), null);
  assert.equal(signatureListError([{ name: "", cedula: "", role: "" }], { draft: true }), "Firma 1: Escribe el nombre de quien firma.");
  assert.equal(signatureListError([{ ...beto, cedula: "1".repeat(61) }], { draft: true }), "Firma 1: Máximo 60 caracteres.");
});

test("what a client sends is trimmed, keeps its order and is rejected when it is not a list of signatures", () => {
  assert.deepEqual(parseSignatures([{ name: "  Ing. Beto Díaz ", cedula: " 1234567 " }, ana]), { ok: true, value: [beto, ana] });
  assert.deepEqual(parseSignatures("Ana"), { ok: false, error: "Las firmas no son válidas." });
  assert.deepEqual(parseSignatures([null]), { ok: false, error: "Firma 1: Escribe el nombre de quien firma." });
  assert.deepEqual(parseSignatures([{ name: 7, cedula: "1" }]), { ok: false, error: "Firma 1: Escribe el nombre de quien firma." });
});

test("a row without a stored list shows its single old signer first; a stored list wins, even empty", () => {
  assert.deepEqual(resolveSignatures(null, { name: "Ing. Álvaro Gutiérrez", registration: "CED-1" }), [{ name: "Ing. Álvaro Gutiérrez", cedula: "CED-1", role: "" }]);
  assert.deepEqual(resolveSignatures(null, { name: "Ing. Álvaro Gutiérrez", registration: null }), [{ name: "Ing. Álvaro Gutiérrez", cedula: "", role: "" }]);
  assert.deepEqual(resolveSignatures(null, { name: " ", registration: "CED-1" }), []);
  assert.deepEqual(resolveSignatures([], { name: "Ing. Álvaro Gutiérrez", registration: "CED-1" }), []);
  assert.deepEqual(resolveSignatures([ana, { name: "Ing. Beto Díaz", cedula: "1234567" }], { name: "Otro" }), [ana, beto]);
});

test("the editor does not save a carátula with an incomplete signature", () => {
  assert.equal(hasCaratulaValidationErrors(validateCaratula(caratula, meta)), false);
  assert.equal(hasCaratulaValidationErrors(validateCaratula({ ...caratula, firmas: [] }, meta)), false);
  assert.equal(validateCaratula({ ...caratula, firmas: [{ name: "Ana", cedula: "", role: "" }] }, meta).firmas, undefined, "se guarda sin cédula; se exige al concluir");
  assert.equal(validateCaratula({ ...caratula, firmas: [{ name: "", cedula: "1", role: "" }] }, meta).firmas, "Firma 1: Escribe el nombre de quien firma.");
});

test("the full save accepts the signature list next to the carátula's texts", () => {
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { folio: "VLO-1", mesesVigencia: 8, fechaVigencia: null, firmas: [ana, beto] } }).success, true);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { folio: ["VLO-1"] } }).success, false);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { firmas: Array.from({ length: 101 }, () => ana) } }).success, false);
});

test("the dictamen prints every signature, one or ten, with its cédula and title", () => {
  const render = (firmas: CaratulaFormData["firmas"]) => renderToStaticMarkup(createElement(CaratulaSignaturesModule, { caratula: { ...caratula, firmas } }));
  const two = render([ana, beto]);
  assert.match(two, /Arq\. Ana Ruiz[\s\S]*Cédula profesional 7654321[\s\S]*Perito valuador[\s\S]*Ing\. Beto Díaz[\s\S]*Cédula profesional 1234567/);
  assert.equal(two.match(/border-t/g)?.length, 2);
  assert.match(two, /flex-wrap/);

  const ten = render(Array.from({ length: 10 }, (_, index) => ({ name: `Perito ${index + 1}`, cedula: `C-${index + 1}`, role: "" })));
  assert.equal(ten.match(/border-t/g)?.length, 10);
  assert.match(ten, /Perito 10/);

  const none = render([]);
  assert.match(none, /Firma pendiente/);
  assert.match(none, /Cédula profesional pendiente/);
});

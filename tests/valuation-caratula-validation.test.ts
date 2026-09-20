import assert from "node:assert/strict";
import test from "node:test";
import type { CaratulaFormData, ValuationMeta } from "../src/features/valuations/model";
import {
  formatMexicanPhone,
  hasCaratulaValidationErrors,
  sanitizePostalCode,
  validateCaratula,
} from "../src/features/valuations/services/caratula-validation";

const caratula: CaratulaFormData = {
  tituloInmueble: "CASA HABITACIÓN",
  numeroAvaluo: "VLO-0001",
  folio: "FOLIO-1",
  direccionEmpresa: "Dirección",
  telefonoEmpresa: "+52 (294) 137 9380",
  correoEmpresa: "contacto@valuadora.mx",
  solicitante: "Cliente",
  propietario: "Propietario",
  objeto: "Venta",
  proposito: "Conocer el valor",
  valuador: "Valuador",
  registroValuador: "REG-1",
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "2026-06-21",
  fechaVigencia: "2026-12-21",
};

const meta: ValuationMeta = {
  folio: "VLO-0001",
  client: "Cliente",
  postalCode: "95830",
  location: "Ubicación",
  valuationKind: "venta",
  propertyKind: "casa",
};

test("acepta los valores ligeros válidos de Caratula", () => {
  assert.deepEqual(validateCaratula(caratula, meta), {});
});

test("reporta límites, teléfono y correo inválidos", () => {
  const errors = validateCaratula(
    {
      ...caratula,
      folio: "1".repeat(16),
      tituloInmueble: "T".repeat(121),
      telefonoEmpresa: "294137938",
      correoEmpresa: "correo-invalido",
    },
    { ...meta, location: "U".repeat(181), postalCode: "12A45" },
  );

  assert.equal(errors.folio, "Máximo 15 caracteres.");
  assert.equal(errors.tituloInmueble, "Máximo 120 caracteres.");
  assert.equal(errors.location, "Máximo 180 caracteres.");
  assert.equal(errors.postalCode, "Usa solo 5 dígitos.");
  assert.equal(errors.telefonoEmpresa, "Ingresa 10 dígitos para teléfono mexicano.");
  assert.equal(errors.correoEmpresa, "Ingresa un correo válido.");
  assert.equal(hasCaratulaValidationErrors(errors), true);
});

test("normaliza código postal y teléfono mexicano", () => {
  assert.equal(sanitizePostalCode("95A8-301"), "95830");
  assert.equal(formatMexicanPhone("2941379380"), "+52 (294) 137 9380");
  assert.equal(formatMexicanPhone("+52 (294) 137 9380"), "+52 (294) 137 9380");
});

import assert from "node:assert/strict";
import test from "node:test";

import type { CaratulaFormData } from "../src/features/valuations/model";
import {
  applyMetaPatchToCaratula,
  initializeCaratulaState,
} from "../src/features/valuations/components/workspace/valuation-caratula-state";

const caratula: CaratulaFormData = {
  tituloInmueble: "Casa",
  numeroAvaluo: "VLO-OLD",
  folio: "VLO-OLD",
  direccionEmpresa: "Company address",
  telefonoEmpresa: "5555555555",
  correoEmpresa: "company@example.com",
  solicitante: "Old applicant",
  propietario: "Old owner",
  objeto: "Independent appraisal object",
  proposito: "Old purpose",
  valuador: "Valuator",
  registroValuador: "REG-1",
  valorTotal: "100",
  valorConLetra: "One hundred",
  fechaAvaluo: "2026-08-12",
  fechaVigencia: "2027-02-12",
};

test("Objeto initialization uses only the existing Carátula value", () => {
  assert.deepEqual(initializeCaratulaState({ objeto: "Sale appraisal" }), {
    objeto: "Sale appraisal",
  });
  assert.deepEqual(
    initializeCaratulaState({ objeto: undefined, location: "Property location" } as never),
    { objeto: "" },
  );
});

test("a location patch leaves Objeto unchanged", () => {
  const updated = applyMetaPatchToCaratula(caratula, { location: "New property location" });

  assert.equal(updated.objeto, "Independent appraisal object");
  assert.deepEqual(updated, caratula);
});

test("only intentional meta mappings synchronize into Carátula", () => {
  const updated = applyMetaPatchToCaratula(caratula, {
    folio: "VLO-NEW",
    client: "New client",
    valuationKind: "renta",
  });

  assert.equal(updated.numeroAvaluo, "VLO-NEW");
  assert.equal(updated.folio, "VLO-NEW");
  assert.equal(updated.solicitante, "New client");
  assert.equal(updated.propietario, "New client");
  assert.equal(updated.proposito, "renta");
  assert.equal(updated.objeto, "Independent appraisal object");
});

test("postal code, property type, and unrelated location patches do not affect Carátula", () => {
  const updated = applyMetaPatchToCaratula(caratula, {
    postalCode: "01234",
    propertyKind: "terreno",
    location: "Another location",
  });

  assert.deepEqual(updated, caratula);
});

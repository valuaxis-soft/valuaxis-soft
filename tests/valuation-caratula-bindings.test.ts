import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CaratulaFormData } from "../src/features/valuations/model";
import {
  applyMetaPatchToCaratula,
  initializeCaratulaState,
} from "../src/features/valuations/components/workspace/valuation-caratula-state";

const editor = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-editor-panel.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-workspace.tsx", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("../src/features/valuations/repositories/valuation.repository.ts", import.meta.url),
  "utf8",
);

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

test("Ubicación remains fixed while removed legacy fields stay payload-compatible", () => {
  assert.match(
    editor,
    /label="Ubicación del inmueble"[\s\S]*?value=\{meta\.location\}[\s\S]*?onUpdateMeta\(\{ location \}\)/,
  );
  assert.doesNotMatch(editor, /label="Solicitante"/);
  assert.doesNotMatch(editor, /label="Propietario"/);
  assert.doesNotMatch(editor, /label="Objeto"/);
  assert.doesNotMatch(editor, /label="Propósito"/);
  assert.match(workspace, /location:\s*meta\.location[\s\S]*?caratula:\s*caratulaForSave/);
  assert.match(repository, /solicitante:\s*caratula\.SNombreSolicitante\s*\?\?\s*""/);
  assert.match(repository, /propietario:\s*caratula\.SNombrePropietario\s*\?\?\s*""/);
  assert.match(repository, /objeto:\s*caratula\.SObjetoAvaluo\s*\?\?\s*""/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistoryEvents, describeAudit, describeStateChange, type StateRow } from "../src/features/valuations/services/valuation-history";
import {
  columnsParam,
  defaultValuationColumns,
  moveValuationColumn,
  parseColumnsParam,
  resolveValuationColumns,
  toggleValuationColumn,
  valuationColumnNeighbor,
  visibleValuationColumns,
} from "../src/features/dashboard/valuation-columns";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 13, 15, minute));
const state = (overrides: Partial<StateRow>): StateRow => ({
  id: "1", at: at(0), actor: "Valuadora Inventada", from: "EN_EDICION", fromName: "En edicion", to: "EN_REVISION", toName: "En revision", reason: null, version: 1,
  ...overrides,
});

test("each status change reads as what it means for the work, with its reason", () => {
  assert.equal(describeStateChange(state({ from: "NUEVO", to: "EN_EDICION", reason: "Primera edicion" })).title, "Empezó la captura: pasó a «En edición»");
  assert.equal(describeStateChange(state({ from: "NUEVO", to: "EN_EDICION", reason: "Primera edicion" })).detail, null, "the automatic reason is not repeated");

  const submitted = describeStateChange(state({ reason: "Revisar la homologación" }));
  assert.deepEqual([submitted.kind, submitted.title, submitted.detail], ["submit", "Lo envió a revisión", "Nota: Revisar la homologación"]);

  const approved = describeStateChange(state({ from: "EN_REVISION", to: "EN_REVISION" }));
  assert.deepEqual([approved.kind, approved.title], ["approve", "Aprobó la revisión: listo para concluir"]);

  const returned = describeStateChange(state({ from: "EN_REVISION", to: "EN_EDICION", reason: "Falta la firma" }));
  assert.deepEqual([returned.kind, returned.detail], ["return", "Motivo: Falta la firma"]);

  const concluded = describeStateChange(state({ from: "EN_REVISION", to: "TERMINADO", reason: "Conclusion de avaluo", version: 1 }));
  assert.deepEqual([concluded.kind, concluded.title, concluded.detail], ["conclude", "Concluyó el avalúo (V1)", null]);

  const reopened = describeStateChange(state({ from: "TERMINADO", to: "REABIERTO", reason: "El cliente corrigió la superficie", version: 2 }));
  assert.deepEqual([reopened.kind, reopened.title, reopened.detail], ["reopen", "Lo reabrió: empieza la versión V2", "Motivo: El cliente corrigió la superficie"]);

  const corrected = describeStateChange(state({ from: "NUEVO", to: "EN_EDICION", reason: "Correccion automatica: ya tenia captura y seguia en Nuevo" }));
  assert.match(corrected.title, /corrección/);
});

test("the audit of each action reads in Spanish; the ones the status history tells are left out", () => {
  const audit = (action: string, metadata: Record<string, unknown> | null = null) => describeAudit({ id: "9", at: at(1), actor: "Ana", action, metadata });
  assert.equal(audit("VALUATION_CREATE")?.title, "Creó el avalúo");
  assert.equal(audit("VALUATION_SAVE")?.title, "Guardó cambios");
  assert.equal(audit("VALUATION_EXPORT", { format: "pdf", final: true })?.title, "Descargó el dictamen en PDF (versión final)");
  assert.equal(audit("VALUATION_EXPORT", { format: "pdf", channel: "email", recipients: "cliente@example.test" })?.detail, "A: cliente@example.test");
  assert.equal(audit("VALUATION_EXPORT", { format: "dictamen", version: 1 })?.title, "Abrió la versión V1 en solo lectura");
  assert.equal(audit("VALUATION_EXPORT", { format: "entregables-zip" })?.title, "Descargó los entregables (.zip)");
  assert.equal(audit("VALUATION_ARCHIVE", { archived: true })?.title, "Lo archivó");
  assert.equal(audit("VALUATION_ARCHIVE", { archived: false })?.title, "Lo devolvió a la lista principal (desarchivó)");
  assert.equal(audit("VALUATION_DELETE")?.title, "Lo mandó a la papelera");
  assert.equal(audit("VALUATION_RESTORE")?.title, "Lo restauró de la papelera");
  assert.equal(
    audit("VALUATION_UPDATE_DATA", { campo0: "Cliente", antes0: "", despues0: "Cliente Inventado", campo1: "Tipo de bien", antes1: "Terreno", despues1: "Casa habitacion" })?.detail,
    "Cliente: «vacío» → «Cliente Inventado» · Tipo de bien: «Terreno» → «Casa habitacion»",
  );
  for (const action of ["VALUATION_CONCLUDE", "VALUATION_REOPEN", "VALUATION_REVIEW_SUBMIT", "VALUATION_DUPLICATE", "API_PERMISSION_DENIED"]) {
    assert.equal(audit(action), null, `${action} is not repeated`);
  }
});

test("the events go most recent first, and a copy says which valuation it came from", () => {
  const events = buildHistoryEvents({
    states: [state({ id: "1", at: at(5) })],
    audits: [{ id: "2", at: at(1), actor: "Ana", action: "VALUATION_SAVE", metadata: null }],
    copiedFrom: { folio: "VLO-0001", at: at(0), actor: "Ana" },
    copies: [{ id: "3", folio: "VLO-0009", at: at(9), actor: "Luis" }],
  });
  assert.deepEqual(events.map((event) => event.title), ["Lo duplicó como VLO-0009", "Lo envió a revisión", "Guardó cambios", "Se creó como copia de VLO-0001"]);
});

test("the column layout is repaired from anything stored and never goes blank", () => {
  assert.deepEqual(resolveValuationColumns(null), defaultValuationColumns());
  assert.deepEqual(resolveValuationColumns({ columns: "nada" }), defaultValuationColumns());
  const allHidden = { columns: defaultValuationColumns().map((column) => ({ ...column, visible: false })) };
  assert.deepEqual(resolveValuationColumns(allHidden), defaultValuationColumns(), "a layout with no visible column is the default");

  let layout = defaultValuationColumns();
  for (const column of visibleValuationColumns(layout).slice(1)) layout = toggleValuationColumn(layout, column.key);
  assert.equal(visibleValuationColumns(toggleValuationColumn(layout, "folio")).length, 1, "the last visible column stays");

  const moved = moveValuationColumn(defaultValuationColumns(), "estado", "folio");
  assert.equal(moved[0].key, "estado");
  assert.equal(valuationColumnNeighbor(moved, "estado", -1), null, "the first one has nowhere to go left");
  assert.equal(valuationColumnNeighbor(moved, "estado", 1), "folio");
  assert.equal(columnsParam(moved), "estado,folio,titulo,cliente,ubicacion,tipo,valuador,modificacion");
  assert.deepEqual(parseColumnsParam("estado,nada,estado,folio"), ["estado", "folio"], "unknown and repeated columns are dropped");
  assert.deepEqual(parseColumnsParam(""), visibleValuationColumns(defaultValuationColumns()).map((column) => column.key));
});

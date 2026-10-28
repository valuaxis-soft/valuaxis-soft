import assert from "node:assert/strict";
import { test } from "node:test";

import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import {
  CONSERVATION_STATE_TABLE,
  DEFAULT_COST_COLUMNS,
  constructionCostOf,
  conservationCriterionOf,
  conservationCriterionOfColumns,
  conservationOfState,
  costColumnsOf,
  emptyConstructionCost,
  typesToAdd,
  type ConstructionDto,
} from "../src/features/valuations/calculation/cost-types";

test("the table of states of conservation starts with the suggested factors, to adjust", () => {
  assert.deepEqual(CONSERVATION_STATE_TABLE.map((option) => [option.label, option.factor]), [
    ["Bueno", 1], ["Normal", 0.9], ["Reparaciones sencillas", 0.75], ["Reparaciones mayores", 0.6], ["Ruinoso", 0.3],
  ]);
  const table = conservationCriterionOf("TABLA_ESTADO");
  assert.equal(table.options.length, 5);
  table.options[1].factor = 0.92;
  assert.equal(CONSERVATION_STATE_TABLE[1].factor, 0.9, "adjusting a table does not touch the suggested values");
  assert.deepEqual(conservationCriterionOf("ROSS_HEIDECKE"), { kind: "ROSS_HEIDECKE", name: "", options: [] });
  assert.deepEqual(conservationCriterionOf("PROPIO").options, [{ label: "", factor: 1 }], "an own criterion starts with one state to name");
  assert.equal(conservationCriterionOf("TABLA_ESTADO", table), table, "picking the same criterion keeps what was adjusted");
});

test("a state gives its factor by its name, without case or accents; one that is not of the criterion gives none", () => {
  const criterion = conservationCriterionOf("TABLA_ESTADO");
  assert.equal(conservationOfState(criterion, "reparaciones SENCILLAS"), 0.75);
  assert.equal(conservationOfState(criterion, "Excelente"), null);
  assert.equal(conservationOfState(criterion, ""), null);
});

test("the columns keep the criterion of each table and the types taken out; Ross-Heidecke is not written", () => {
  const stored = costColumnsOf({
    constructions: { other: "Obsolescencia", extra: [], conservation: { kind: "PROPIO", name: "Despacho", options: [{ label: "Óptimo", factor: 1 }, { label: "", factor: 2 }, { label: "Malo", factor: 50 }] } },
    installations: { other: "", extra: [], conservation: { kind: "ROSS_HEIDECKE", name: "", options: [] } },
    showMaintenance: true,
    excludedTypes: ["T-2", " T-2 ", "", 7],
  });
  assert.deepEqual(stored.constructions.conservation, { kind: "PROPIO", name: "Despacho", options: [{ label: "Óptimo", factor: 1 }] }, "states without a name or out of range are left out");
  assert.equal(stored.installations.conservation, undefined);
  assert.equal(conservationCriterionOfColumns(stored.installations).kind, "ROSS_HEIDECKE");
  assert.deepEqual(stored.excludedTypes, ["T-2"]);
  assert.deepEqual(costColumnsOf(null), DEFAULT_COST_COLUMNS, "a capture of before reads as before");
  assert.equal(costColumnsOf({ constructions: { conservation: { kind: "OTRO" } } }).constructions.conservation, undefined);
});

test("every type of the construction section enters the cost approach, except the ones taken out", () => {
  const types = [{ ref: "T-1" }, { ref: "T-2" }, { ref: "t-3" }, { ref: " " }];
  assert.deepEqual(typesToAdd(types, [{ ref: "T-1" }]).map((type) => type.ref), ["T-2", "t-3"]);
  assert.deepEqual(typesToAdd(types, [{ ref: "t-1" }], ["T-3"]).map((type) => type.ref), ["T-2"], "references compare without case");
  assert.deepEqual(typesToAdd([], []), []);
});

test("a row keeps the state picked; the schema takes it and the criterion, and refuses a factor out of range", () => {
  const row: ConstructionDto = {
    ...emptyConstructionCost("T-1"), conservation: 0.9, conservationState: "Normal",
    id: 1, description: "Casa", classification: "Habitacional", quality: "Media", area: 100, age: 10, usefulLife: 60,
  };
  assert.equal(constructionCostOf(row).conservationState, "Normal");
  assert.equal("conservationState" in constructionCostOf({ ...row, conservationState: null }), false);
  const payload = {
    land: { subjectArea: null, referenceArea: null, unitValue: null, surfacePower: 3, factors: { negotiation: 1, location: 1, services: 1, classification: 1, topography: 1 }, surfaceFactor: null, resultantFactor: null },
    constructions: [{ ...emptyConstructionCost("T-1"), conservation: 0.9, conservationState: "Normal" }],
    installations: [],
    indirects: [],
    columns: { ...DEFAULT_COST_COLUMNS, constructions: { other: "Otro", extra: [], conservation: conservationCriterionOf("TABLA_ESTADO") }, excludedTypes: ["T-2"] },
  };
  const parsed = costInputSchema.parse(payload);
  assert.equal(parsed.constructions[0].conservationState, "Normal");
  assert.equal(parsed.columns?.constructions.conservation?.kind, "TABLA_ESTADO");
  assert.deepEqual(parsed.columns?.excludedTypes, ["T-2"]);
  const outOfRange = { ...payload.columns, constructions: { other: "Otro", extra: [], conservation: { kind: "PROPIO", name: "", options: [{ label: "x", factor: 11 }] } } };
  assert.equal(costInputSchema.safeParse({ ...payload, columns: outOfRange }).success, false);
});

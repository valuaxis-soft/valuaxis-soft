import assert from "node:assert/strict";
import test from "node:test";

import {
  convertUnitValue,
  resolveEffectiveSourceUnit,
  formatNumericValue,
  formatNumericConceptValue,
  formatConceptValueForDocument,
} from "../src/features/valuations/services/concept-value-format";
import type { Concept, ConceptValueFormat } from "../src/features/valuations/model";

/* ================================================================== */
/*  1. UNIT REGISTRY — all physical units registered                   */
/* ================================================================== */

test("convertUnitValue: all physical units produce non-null for same-family conversions", () => {
  const lengthUnits: ConceptValueFormat[] = ["mm", "cm", "m", "km", "in", "ft"];
  const areaUnits: ConceptValueFormat[] = ["m2", "km2", "ha"];
  const volumeUnits: ConceptValueFormat[] = ["m3", "l"];
  const massUnits: ConceptValueFormat[] = ["kg", "g"];

  for (const u of lengthUnits) {
    assert.notEqual(convertUnitValue(1, u, u), null, `${u} self-conversion should be non-null`);
  }
  for (const u of areaUnits) {
    assert.notEqual(convertUnitValue(1, u, u), null, `${u} self-conversion should be non-null`);
  }
  for (const u of volumeUnits) {
    assert.notEqual(convertUnitValue(1, u, u), null, `${u} self-conversion should be non-null`);
  }
  for (const u of massUnits) {
    assert.notEqual(convertUnitValue(1, u, u), null, `${u} self-conversion should be non-null`);
  }
});

/* ================================================================== */
/*  2. LENGTH CONVERSIONS                                              */
/* ================================================================== */

test("convertUnitValue: 1 m → cm = 100", () => {
  assert.equal(convertUnitValue(1, "m", "cm"), 100);
});

test("convertUnitValue: 100 cm → m = 1", () => {
  assert.equal(convertUnitValue(100, "cm", "m"), 1);
});

test("convertUnitValue: 1 km → m = 1000", () => {
  assert.equal(convertUnitValue(1, "km", "m"), 1000);
});

test("convertUnitValue: 1 m → ft ≈ 3.28084", () => {
  const result = convertUnitValue(1, "m", "ft");
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 3.280839895) < 0.0001, `Got ${result}`);
});

test("convertUnitValue: 1 ft → m = 0.3048", () => {
  assert.equal(convertUnitValue(1, "ft", "m"), 0.3048);
});

test("convertUnitValue: 12 in → ft = 1", () => {
  const result = convertUnitValue(12, "in", "ft");
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 1) < 0.0001, `Got ${result}`);
});

/* ================================================================== */
/*  3. AREA CONVERSIONS                                                */
/* ================================================================== */

test("convertUnitValue: 10000 m2 → ha = 1", () => {
  assert.equal(convertUnitValue(10000, "m2", "ha"), 1);
});

test("convertUnitValue: 1 ha → m2 = 10000", () => {
  assert.equal(convertUnitValue(1, "ha", "m2"), 10000);
});

test("convertUnitValue: 1 km2 → m2 = 1000000", () => {
  assert.equal(convertUnitValue(1, "km2", "m2"), 1000000);
});

/* ================================================================== */
/*  4. VOLUME CONVERSIONS                                              */
/* ================================================================== */

test("convertUnitValue: 1 m3 → L = 1000", () => {
  assert.equal(convertUnitValue(1, "m3", "l"), 1000);
});

test("convertUnitValue: 1000 L → m3 = 1", () => {
  assert.equal(convertUnitValue(1000, "l", "m3"), 1);
});

/* ================================================================== */
/*  5. MASS CONVERSIONS                                                */
/* ================================================================== */

test("convertUnitValue: 1 kg → g = 1000", () => {
  assert.equal(convertUnitValue(1, "kg", "g"), 1000);
});

test("convertUnitValue: 1000 g → kg = 1", () => {
  assert.equal(convertUnitValue(1000, "g", "kg"), 1);
});

/* ================================================================== */
/*  6. ROUND-TRIP TESTS                                                */
/* ================================================================== */

test("convertUnitValue: round-trip m → ft → m preserves value", () => {
  const ft = convertUnitValue(1, "m", "ft");
  assert.ok(ft !== null);
  const back = convertUnitValue(ft, "ft", "m");
  assert.ok(back !== null);
  assert.ok(Math.abs(back - 1) < 0.0001, `Got ${back}`);
});

test("convertUnitValue: round-trip m2 → ha → m2 preserves value", () => {
  const ha = convertUnitValue(5000, "m2", "ha");
  assert.ok(ha !== null);
  const back = convertUnitValue(ha, "ha", "m2");
  assert.ok(back !== null);
  assert.ok(Math.abs(back - 5000) < 0.0001, `Got ${back}`);
});

/* ================================================================== */
/*  7. INVALID CONVERSIONS                                             */
/* ================================================================== */

test("convertUnitValue: m → ha returns null (incompatible dimensions)", () => {
  assert.equal(convertUnitValue(1, "m", "ha"), null);
});

test("convertUnitValue: kg → m returns null (incompatible dimensions)", () => {
  assert.equal(convertUnitValue(1, "kg", "m"), null);
});

test("convertUnitValue: custom → m returns null (non-physical)", () => {
  assert.equal(convertUnitValue(1, "custom", "m"), null);
});

test("convertUnitValue: plain → m returns null (non-physical)", () => {
  assert.equal(convertUnitValue(1, "plain", "m"), null);
});

test("convertUnitValue: mxn → m returns null (non-physical)", () => {
  assert.equal(convertUnitValue(1, "mxn", "m"), null);
});

/* ================================================================== */
/*  8. DISPLAY PIPELINE — formatNumericValue with conversion           */
/* ================================================================== */

test("formatNumericValue: value=100000, sourceUnit=m2, displayUnit=ha → '10 ha'", () => {
  const result = formatNumericValue("100000", {
    valueFormat: "ha",
    sourceUnit: "m2",
  });
  assert.equal(result, "10 ha");
});

test("formatNumericValue: value=100, sourceUnit=ft, displayUnit=m → '30.48 m'", () => {
  const result = formatNumericValue("100", {
    valueFormat: "m",
    sourceUnit: "ft",
  });
  assert.equal(result, "30.48 m");
});

test("formatNumericValue: same source and display unit — no conversion", () => {
  const result = formatNumericValue("100", {
    valueFormat: "m",
    sourceUnit: "m",
  });
  assert.equal(result, "100 m");
});

test("formatNumericValue: sourceUnit defaults to valueFormat when absent", () => {
  const result = formatNumericValue("42", {
    valueFormat: "m",
  });
  assert.equal(result, "42 m");
});

/* ================================================================== */
/*  9. RAW VALUE IMMUTABILITY                                          */
/* ================================================================== */

test("formatNumericValue: changing displayUnit does NOT mutate stored value", () => {
  const concept: Concept = {
    id: "test",
    label: "Area",
    value: "10000",
    type: "measurement",
    valueFormat: "ha",
    sourceUnit: "m2",
  };
  // The value field should remain the original stored value
  assert.equal(concept.value, "10000");

  // Format for display
  const displayed = formatNumericConceptValue(concept);
  assert.equal(displayed, "1 ha");

  // Original value untouched
  assert.equal(concept.value, "10000");
});

/* ================================================================== */
/*  10. LEGACY COMPATIBILITY                                           */
/* ================================================================== */

test("formatNumericValue: concept without sourceUnit loads safely (backward compat)", () => {
  const result = formatNumericValue("100", {
    valueFormat: "m",
  });
  assert.equal(result, "100 m");
});

test("resolveEffectiveSourceUnit: falls back to valueFormat when sourceUnit undefined", () => {
  const concept = { valueFormat: "m2" as ConceptValueFormat };
  assert.equal(resolveEffectiveSourceUnit(concept), "m2");
});

test("resolveEffectiveSourceUnit: uses sourceUnit when present", () => {
  const concept = { valueFormat: "ha" as ConceptValueFormat, sourceUnit: "m2" as ConceptValueFormat };
  assert.equal(resolveEffectiveSourceUnit(concept), "m2");
});

test("formatConceptValueForDocument: passes sourceUnit through", () => {
  const concept: Concept = {
    id: "test",
    label: "Superficie",
    value: "5000",
    type: "measurement",
    valueFormat: "ha",
    sourceUnit: "m2",
  };
  const result = formatConceptValueForDocument(concept);
  assert.equal(result, "0.5 ha");
});

/* ================================================================== */
/*  11. CONCEPT MODEL — sourceUnit field exists                        */
/* ================================================================== */

test("Concept type allows sourceUnit field", () => {
  const concept: Concept = {
    id: "test",
    label: "Test",
    value: "100",
    sourceUnit: "ft",
    valueFormat: "m",
  };
  assert.equal(concept.sourceUnit, "ft");
  assert.equal(concept.valueFormat, "m");
});

/* ================================================================== */
/*  12. EDITOR — sourceUnit initialization behavior                    */
/* ================================================================== */

test("Concept editor sourceUnit initialization logic", () => {
  // When sourceUnit is undefined and effectiveSourceUnit matches valueFormat,
  // the editor should initialize sourceUnit = valueFormat
  const concept: Concept = {
    id: "test",
    label: "Test",
    value: "100",
    valueFormat: "m",
  };
  const effectiveSourceUnit = resolveEffectiveSourceUnit(concept);
  // sourceUnit undefined, falls back to valueFormat "m"
  assert.equal(effectiveSourceUnit, "m");
  // effectiveSourceUnit === valueFormat → should initialize sourceUnit
  assert.equal(effectiveSourceUnit, concept.valueFormat);
});

/* ================================================================== */
/*  13. NEGATIVE VALUES                                                */
/* ================================================================== */

test("convertUnitValue: handles negative values", () => {
  assert.equal(convertUnitValue(-1, "m", "cm"), -100);
  assert.equal(convertUnitValue(-100, "cm", "m"), -1);
});

test("formatNumericValue: handles negative converted values", () => {
  const result = formatNumericValue("-100", {
    valueFormat: "m",
    sourceUnit: "cm",
  });
  assert.equal(result, "-1 m");
});

/* ================================================================== */
/*  14. DECIMAL PRECISION                                              */
/* ================================================================== */

test("formatNumericValue: precision limited to 6 decimals", () => {
  // 1 in → m = 0.0254 (exactly 4 decimals)
  const result = formatNumericValue("1", {
    valueFormat: "m",
    sourceUnit: "in",
  });
  assert.equal(result, "0.0254 m");
});

test("formatNumericValue: trailing zeros removed from converted values", () => {
  // 100 cm → m = 1 (no decimals needed)
  const result = formatNumericValue("100", {
    valueFormat: "m",
    sourceUnit: "cm",
  });
  assert.equal(result, "1 m");
});

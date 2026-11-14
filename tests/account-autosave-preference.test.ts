import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOSAVE_INTERVAL_OPTIONS,
  autosaveDelayMs,
  describeAutosave,
  resolveUserPreferences,
  userPreferencesPatchSchema,
} from "../src/features/account/user-preferences";

test("Mi cuenta offers Desactivado, 10 s, 15 s (the default), 30 s, 1 min and 5 min (NP-01)", () => {
  assert.deepEqual(AUTOSAVE_INTERVAL_OPTIONS.map((option) => option.seconds), [0, 10, 15, 30, 60, 300]);
  assert.deepEqual(AUTOSAVE_INTERVAL_OPTIONS.map((option) => option.label), [
    "Desactivado",
    "10 segundos",
    "15 segundos (predeterminado)",
    "30 segundos",
    "1 minuto",
    "5 minutos",
  ]);
});

test("nothing stored, or something not offered, is the 15 s it always was", () => {
  assert.equal(resolveUserPreferences(null).autosaveSeconds, 15);
  assert.equal(resolveUserPreferences({}).autosaveSeconds, 15);
  assert.equal(resolveUserPreferences({ autosaveSeconds: 7 }).autosaveSeconds, 15);
  assert.equal(resolveUserPreferences({ autosaveSeconds: "30" }).autosaveSeconds, 15);
  assert.equal(resolveUserPreferences({ autosaveSeconds: 300 }).autosaveSeconds, 300);
  assert.equal(resolveUserPreferences({ autosaveSeconds: 0 }).autosaveSeconds, 0);
});

test("the editor waits the chosen seconds, and «Desactivado» does not save on its own", () => {
  assert.equal(autosaveDelayMs(10), 10_000);
  assert.equal(autosaveDelayMs(300), 300_000);
  assert.equal(autosaveDelayMs(0), null);
  assert.equal(describeAutosave(15), "15 s después del último cambio");
  assert.equal(describeAutosave(60), "1 min después del último cambio");
  assert.equal(describeAutosave(0), "desactivado");
});

test("the route accepts only the offered intervals", () => {
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: 30 }).success, true);
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: 0 }).success, true);
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: 5 }).success, false);
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: "15" }).success, false);
  assert.equal(userPreferencesPatchSchema.safeParse({}).success, false);
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: 15, theme: "dark" }).success, false, "nothing else is written");
});

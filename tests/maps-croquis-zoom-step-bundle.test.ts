import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { comparablesFitFrame } from "../src/features/maps/croquis";

// QA 27 nov 2026: Turbopack left the imported ZOOM_STEP unresolved inside the fit loop's update
// expression, so opening the croquis generator with comparables threw in the browser while Node passed.
test("the comparables fit loop steps with a local copy of ZOOM_STEP, not the import in its update expression", () => {
  const source = readFileSync(new URL("../src/features/maps/croquis.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /zoom\s*-=\s*ZOOM_STEP/);
  assert.match(source, /const step = ZOOM_STEP;/);
});

test("the fit still finds a quarter-step zoom that shows the subject and its comparables", () => {
  const frame = comparablesFitFrame([20.706, -102.348], [{ number: 1, point: [20.708, -102.344] } as never]);
  assert.ok(frame.zoom <= 17 && frame.zoom >= 3);
  assert.equal(Math.round(frame.zoom * 4), frame.zoom * 4, "quarter steps");
});

test("the out-of-frame notice names each comparable with its market, since every market numbers from C-1", async () => {
  const { pinsByMarketText, COMPARABLE_MARKETS } = await import("../src/features/maps/croquis");
  const land = COMPARABLE_MARKETS.find((market) => market.type === "TERRENO_VENTA")!.title;
  const rent = COMPARABLE_MARKETS.find((market) => market.type === "INMUEBLE_RENTA")!.title;
  const text = pinsByMarketText([
    { type: "INMUEBLE_RENTA", reference: 2 },
    { type: "TERRENO_VENTA", reference: 2 },
    { type: "TERRENO_VENTA", reference: 3 },
  ]);
  assert.equal(text, `${land}: C-2, C-3; ${rent}: C-2`);
});

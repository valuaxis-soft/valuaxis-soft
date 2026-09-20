import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("workspace new action renders creation form before workspace editor", () => {
  const page = readFileSync(join(root, "src/app/(private)/workspace/page.tsx"), "utf8");

  assert.match(page, /action === "new"/);
  assert.match(page, /<CreateValuationForm catalogs=\{catalogs\} \/>/);
  assert.match(page, /if \(!valuationId\) redirect\("\/dashboard"\)/);
});

test("productive valuation code does not contain demo valuation strings", () => {
  const files = [
    "src/features/valuations/services/valuation-constants.ts",
    "src/features/valuations/sections/caratula/index.ts",
    "src/features/valuations/sections/datos/index.ts",
    "src/features/valuations/components/workspace/valuation-workspace.tsx",
  ];
  const forbidden = [
    "TRC-001-04-2026",
    "TRC-001-04-2028",
    "Jorge Perez",
    "Camino a los Sauces 340",
    "Valuadores de los Altos",
    "Arandas, Jalisco",
  ];

  for (const file of files) {
    const contents = readFileSync(join(root, file), "utf8");
    for (const value of forbidden) {
      assert.equal(contents.includes(value), false, `${file} contains demo value ${value}`);
    }
  }
});

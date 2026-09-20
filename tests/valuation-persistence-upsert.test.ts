import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const workflowPath = join(root, "src/features/valuations/services/valuation-workflow.service.ts");
const migrationPath = join(root, "prisma/migrations/20260609000700_007_documentos_dinamicos/migration.sql");

const workflow = readFileSync(workflowPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

// Extract the upsertDocumentNode function body (from async function to closing brace before normalizeNodeTitle)
const fnMatch = workflow.match(
  /async function upsertDocumentNode\(input:\s*\{[\s\S]*?\n\}\s*\)\s*\{([\s\S]*?)(?=\nfunction normalizeNodeTitle)/,
);
assert.ok(fnMatch, "upsertDocumentNode function not found");
const fnBody = fnMatch[1];

// Extract just the findFirst block for precise assertions
const findFirstMatch = fnBody.match(
  /const existing = await input\.tx\.nodoDocumento\.findFirst\(\{([\s\S]*?)\}\);/,
);
assert.ok(findFirstMatch, "findFirst call not found inside upsertDocumentNode");
const findFirstBlock = findFirstMatch[1];

// Extract the data object assigned before the update path
const dataMatch = fnBody.match(
  /const data = \{([\s\S]*?)\};/,
);
assert.ok(dataMatch, "data object not found inside upsertDocumentNode");
const dataBlock = dataMatch[1];

// --- Test 1: Lookup does NOT include IdNodoPadre ---
test("findFirst does not include IdNodoPadre in WHERE clause", () => {
  assert.doesNotMatch(
    findFirstBlock,
    /IdNodoPadre/,
    "P2002 fix violation: findFirst still references IdNodoPadre",
  );
});

// --- Test 2: UPDATE still writes IdNodoPadre ---
test("UPDATE path still writes IdNodoPadre for reparenting", () => {
  assert.match(
    dataBlock,
    /IdNodoPadre:\s*input\.parentId/,
    "UPDATE data must include IdNodoPadre to allow reparenting",
  );
});

// --- Test 3: sourceKey/safeKey compatibility preserved ---
test("OR clause includes SClave matching for safeKey and sourceKey fallback", () => {
  assert.match(
    findFirstBlock,
    /OR:\s*\[\s*\{\s*SClave:\s*safeKey\s*\}/,
    "Lookup must match on safeKey",
  );
  assert.match(
    findFirstBlock,
    /sourceKey && sourceKey !== safeKey && sourceKey\.length <= DOCUMENT_NODE_KEY_MAX_LENGTH/,
    "Lookup must include sourceKey fallback when different from safeKey",
  );
});

// --- Test 4: DFechaEliminacion: null preserved ---
test("active-node filter DFechaEliminacion: null is present", () => {
  assert.match(
    findFirstBlock,
    /DFechaEliminacion:\s*null/,
    "Soft-delete filter must remain in lookup",
  );
});

// --- Test 5: No kind-specific patches in lookup ---
test("no kind-specific special cases in findFirst lookup", () => {
  const findFirstOnly = findFirstBlock;
  assert.doesNotMatch(
    findFirstOnly,
    /input\.kind\s*===/,
    "Lookup must not branch on node kind",
  );
  assert.doesNotMatch(
    findFirstOnly,
    /kind.*concept|kind.*block|kind.*subBlock|kind.*image/,
    "Lookup must not contain kind-specific logic",
  );
});

// --- Test 6: Unique constraint is (IdSeccionDocumento, SClave) ---
test("DB unique index is on (IdSeccionDocumento, SClave) — not parent-sensitive", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "devpware_nodos_documentos_IdSeccionDocumento_SClave_key"\s+ON "devpware_nodos_documentos"\s*\("IdSeccionDocumento",\s*"SClave"\)/,
    "Unique index must be (IdSeccionDocumento, SClave)",
  );
  assert.match(
    migration,
    /WHERE "DFechaEliminacion" IS NULL/,
    "Partial index must filter out soft-deleted nodes",
  );
});

// --- Test 7: upsertDocumentNode accepts all node kinds ---
test("function signature accepts block, subBlock, concept, and image kinds", () => {
  const sigStart = workflow.indexOf("async function upsertDocumentNode(input:");
  assert.ok(sigStart !== -1, "upsertDocumentNode signature not found");

  const sigEnd = workflow.indexOf("})", sigStart + 40);
  const sigBlock = workflow.slice(sigStart, sigEnd + 2);

  for (const kind of ["block", "subBlock", "concept", "image"]) {
    assert.ok(
      sigBlock.includes(`"${kind}"`),
      `Signature must include kind "${kind}"`,
    );
  }
});

/**
 * 24 Nov 2026: on a new valuation the carátula printed «Firma pendiente /
 * Cédula profesional pendiente» alone on a second page. The heights are the
 * ones the dictamen measured on a Letter page (843 px for the items) for a
 * valuation started from the template, empty and filled.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  onePageScale,
  splitMeasuredDocumentFlowItems,
  type DocumentFlowItem,
} from "../src/features/valuations/components/document-preview-page";

const AVAILABLE = 843;

/** The carátula's items: cover, notice, four data titles, assumptions, conclusion and the signatures. */
const EMPTY = [334, 90, 33, 33, 33, 33, 65, 138, 90];
/** The same carátula with every datum, the assumptions, the value and its signer captured. */
const FILLED = [334, 90, 33, 30, 15, 15, 33, 16, 15, 33, 30, 15, 33, 16, 15, 29, 66, 138, 105];

test("the template's carátula overflowed the page by a few pixels: the signatures went alone to a second page", () => {
  assert.ok(EMPTY.reduce((sum, height) => sum + height, 0) > AVAILABLE);
});

test("a carátula that overflows the page by a little prints reduced on it, empty or filled", () => {
  const empty = onePageScale(EMPTY, AVAILABLE, 0.75);
  assert.ok(empty !== null && empty < 1 && empty > 0.95, `barely reduced (${empty})`);
  const filled = onePageScale(FILLED, AVAILABLE, 0.75);
  assert.ok(filled !== null && filled >= 0.75 && filled < 0.8, `reduced to fit (${filled})`);
  // The reduced content is no taller than the page.
  for (const [heights, scale] of [[EMPTY, empty!], [FILLED, filled!]] as const) {
    assert.ok(heights.reduce((sum, height) => sum + height, 0) * scale <= AVAILABLE);
  }
});

test("a carátula that fits prints at its size; one too long for the smallest scale continues on the next page", () => {
  assert.equal(onePageScale([300, 200, 100], AVAILABLE, 0.75), 1);
  assert.equal(onePageScale([AVAILABLE * 2], AVAILABLE, 0.75), null);
  assert.equal(onePageScale([10], 0, 0.75), null);
});

test("when the carátula does continue, the signatures take what prints before them along: never alone", () => {
  const ids = ["cover", "notice", "assumptions", "conclusion", "signatures"];
  const heights = [334, 90, 300, 138, 90];
  const items: DocumentFlowItem[] = ids.map((id) => ({ id, node: null, ...(id === "conclusion" ? { keepWithNext: true } : {}) }));
  const pages = splitMeasuredDocumentFlowItems(items.map((item, index) => ({ item, height: heights[index] })), AVAILABLE)
    .map((page) => page.map((placed) => placed.id));
  assert.deepEqual(pages, [["cover", "notice", "assumptions"], ["conclusion", "signatures"]]);
});

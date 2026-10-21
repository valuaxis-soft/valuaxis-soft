/**
 * The server PDF prints what the preview paginates: the pages are measured on
 * screen, the page says when they are, and the renderer prints only then.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AutoPaginatedDocumentFlow } from "../src/features/valuations/components/document-preview-page";
import { canMeasure, PAGINATION_PENDING_SELECTOR, PAGINATION_STATE_ATTRIBUTE } from "../src/features/valuations/services/pagination-state";
import { PdfRenderError, waitForPagination } from "../src/infrastructure/pdf/chromium-pdf";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const rects = (count: number) => ({ getClientRects: () => ({ length: count }) as DOMRectList });

test("the measuring copy is measured only while it has boxes, never while printing hides it", () => {
  assert.equal(canMeasure(rects(1)), true, "on screen");
  assert.equal(canMeasure(rects(0)), false, "display: none in print media: every height would read 0");
});

test("a flow is pending until a measurement of its content placed its pages", () => {
  const markup = renderToStaticMarkup(
    <AutoPaginatedDocumentFlow
      contentClassName="p-4"
      header={<header data-document-preview-header>Encabezado</header>}
      items={[{ id: "uno", node: <p>Uno</p> }, { id: "dos", node: <p>Dos</p> }]}
      pageKeyPrefix="prueba"
    />,
  );
  assert.match(markup, new RegExp(`${PAGINATION_STATE_ATTRIBUTE}="pending"`), "rendered before any measurement: not ready");
  assert.doesNotMatch(markup, /data-document-pagination="ready"/);
  assert.equal(PAGINATION_PENDING_SELECTOR, '[data-document-pagination]:not([data-document-pagination="ready"])');
});

/** A page whose counts follow a script, one value per poll; the last value repeats. */
function scriptedPage(script: Record<string, number[]>) {
  const polls: Record<string, number> = {};
  return {
    waits: 0,
    locator(selector: string) {
      return {
        count: async () => {
          const values = script[selector] ?? [0];
          const index = polls[selector] ?? 0;
          polls[selector] = index + 1;
          return values[Math.min(index, values.length - 1)];
        },
      };
    },
    async waitForTimeout() {
      this.waits += 1;
    },
  };
}

test("the PDF waits while any flow is pending, even if the page count already holds", async () => {
  const page = scriptedPage({ article: [13, 13, 13, 15, 15], pending: [2, 2, 1, 0, 0] });
  await waitForPagination(page, { settleSelector: "article", pendingSelector: "pending", deadline: Date.now() + 5_000, settleMs: 0 });
  assert.equal(page.waits, 4, "printed after the last measurement, with its 15 pages");
});

test("pagination that never finishes refuses the PDF instead of printing cut pages", async () => {
  const page = scriptedPage({ article: [13], pending: [1] });
  await assert.rejects(
    waitForPagination(page, { settleSelector: "article", pendingSelector: "pending", deadline: Date.now() + 50, settleMs: 0 }),
    (error) => error instanceof PdfRenderError && /paginación/.test(error.message),
  );
});

test("without flows to wait for, the page count holding is enough", async () => {
  const page = scriptedPage({ item: [3, 5, 5] });
  await waitForPagination(page, { settleSelector: "item", deadline: Date.now() + 5_000, settleMs: 0 });
  assert.equal(page.waits, 2);
  await assert.rejects(
    waitForPagination(scriptedPage({ item: [0] }), { settleSelector: "item", deadline: Date.now() + 20, settleMs: 0 }),
    (error) => error instanceof PdfRenderError && /no tiene páginas/.test(error.message),
  );
});

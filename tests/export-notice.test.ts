/**
 * The lawyer's notice before every export of a concluded valuation (Álvaro,
 * 25 Nov 2026): the exact words, «Exportar» / «Cancelar», every time, and
 * every way out of the app goes through it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  EXPORT_NOTICE_CANCEL,
  EXPORT_NOTICE_CONFIRM,
  EXPORT_NOTICE_TEXT,
} from "../src/features/valuations/components/dictamen/export-notice";

const source = (path: string) => readFileSync(path, "utf8");

test("the export notice reads exactly as the lawyer wrote it", () => {
  assert.equal(
    EXPORT_NOTICE_TEXT,
    "El reporte es suyo. Usted responde de sus datos, criterios, conclusiones y firma, y de conservarlo por el plazo que le exijan sus obligaciones profesionales.",
  );
  assert.equal(EXPORT_NOTICE_CONFIRM, "Exportar");
  assert.equal(EXPORT_NOTICE_CANCEL, "Cancelar");
});

test("the notice is the app's dialog, shown every time, with no «no volver a mostrar»", () => {
  const notice = source("src/features/valuations/components/dictamen/export-notice.tsx");
  assert.match(notice, /AlertDialog/);
  assert.doesNotMatch(notice, /window\.confirm|localStorage|sessionStorage|<Checkbox/);
});

test("every export of a concluded valuation asks first", () => {
  // PDF, memoria and .zip: the one download button of the app.
  const button = source("src/features/valuations/components/dictamen/download-dictamen-pdf-button.tsx");
  assert.match(button, /onClick=\{\(\) => notice\.ask\(\(\) => void download\(\)\)\}/);
  // Sending by email opens its form only after «Exportar».
  assert.match(source("src/features/valuations/components/dictamen/send-dictamen-email-dialog.tsx"), /notice\.ask\(\(\) => setOpen\(true\)\)/);
  // The .zip that downloads by itself after concluding.
  assert.match(source("src/features/valuations/components/workspace/hooks/use-valuation-lifecycle.ts"), /ask\(\(\) => void downloadValuationDocument\(valuationId, "entregables"\)\)/);
  assert.match(source("src/features/valuations/components/workspace/valuation-workspace.tsx"), /\{deliverablesNotice\}/);
  // Printing and the PDFs saved in the history.
  for (const path of ["src/features/valuations/components/dictamen/valuation-dictamen.tsx", "src/features/valuations/components/memory/calculation-memory-toolbar.tsx"]) {
    const text = source(path);
    assert.match(text, /<ExportPrintButton \/>/, path);
    assert.doesNotMatch(text, /onClick=\{\(\) => window\.print\(\)\}/, path);
  }
  assert.match(source("src/features/valuations/components/history/valuation-history-dialog.tsx"), /notice\.ask\(\(\) => window\.open\(href/);
});

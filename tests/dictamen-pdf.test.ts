import assert from "node:assert/strict";
import { test } from "node:test";
import { dictamenPdfFilename } from "../src/features/valuations/services/dictamen-pdf.service";
import { internalAppUrl } from "../src/infrastructure/pdf/chromium-pdf";

test("the PDF is named after the folio, safe for any browser", () => {
  assert.equal(dictamenPdfFilename("VDA-0001"), "Dictamen-VDA-0001.pdf");
  assert.equal(dictamenPdfFilename("TCH 004/05 2026"), "Dictamen-TCH-004-05-2026.pdf");
  assert.equal(dictamenPdfFilename("Avalúo \"Ñ\""), "Dictamen-Avaluo-N.pdf");
  assert.equal(dictamenPdfFilename("///"), "Dictamen-avaluo.pdf");
});

test("Chromium reaches the app on this machine unless told otherwise", () => {
  const saved = { internal: process.env.INTERNAL_APP_URL, port: process.env.PORT };
  try {
    delete process.env.INTERNAL_APP_URL;
    process.env.PORT = "3000";
    assert.equal(internalAppUrl(), "http://127.0.0.1:3000");
    process.env.INTERNAL_APP_URL = "http://localhost:3100/";
    assert.equal(internalAppUrl(), "http://localhost:3100");
  } finally {
    if (saved.internal === undefined) delete process.env.INTERNAL_APP_URL; else process.env.INTERNAL_APP_URL = saved.internal;
    if (saved.port === undefined) delete process.env.PORT; else process.env.PORT = saved.port;
  }
});

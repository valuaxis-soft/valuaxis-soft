/**
 * The server PDF prints the pages the dictamen paginates: a table longer than
 * a page splits by rows and every row, and what follows it, prints. Opens the
 * dictamen in Chromium (CHROMIUM_PATH; skipped without it) and asks the
 * server for its PDF. The server needs CHROMIUM_PATH and INTERNAL_APP_URL too.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright-core";
import { figureColumn, generatedTable, textColumn } from "../../src/features/valuations/calculation/generated-content";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { PAGINATION_PENDING_SELECTOR } from "../../src/features/valuations/services/pagination-state";
import { serializeTableForSave } from "../../src/features/valuations/services/table-persistence";
import { BASE_URL, call, createValuation, createWorld, describeCall, prisma, waitForServer, type World } from "./support";

const ROWS = 45;
const LAST_TEXT = "Concepto después de la tabla";

let world: World;
let browser: Browser | null = null;

before(async () => {
  await waitForServer();
  world = await createWorld();
});
after(async () => {
  await browser?.close();
  await prisma.$disconnect();
});

/** A section with a table of ROWS rows and a block after it. */
const longSection = () => ({
  id: "costos",
  label: "ENF. COSTOS",
  title: "ENF. COSTOS",
  blocks: [
    {
      id: "bloque-tabla-larga",
      title: "Tabla larga",
      tables: [serializeTableForSave(generatedTable("tabla-larga", "Comparables",
        [figureColumn("REF."), textColumn("UBICACIÓN")],
        Array.from({ length: ROWS }, (_, index) => [String(index + 1), `Fila ${index + 1} de la tabla`])))],
    },
    {
      id: "bloque-posterior",
      title: "Bloque posterior",
      concepts: [{ id: "concepto-posterior", label: LAST_TEXT, value: "Presente", enabled: true }],
    },
  ],
});

test("the server PDF prints every row of a table that splits across pages, and the blocks after it", { skip: !process.env.CHROMIUM_PATH }, async () => {
  const actor = world.a.admin;
  const id = await createValuation(actor, "Paginación E2E");
  const saved = await call(actor, "PUT", `/api/avaluos/${id}/full`, { json: { sections: [longSection()] } });
  assert.equal(saved.status, 200, describeCall("PUT full", saved));

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const context = await browser.newContext();
  await context.addCookies([{ name: AUTH_SESSION_COOKIE, value: actor.token, url: BASE_URL }]);
  const page = await context.newPage();
  // tsx names the functions passed to evaluate with a helper the page does not have.
  await page.addInitScript("globalThis.__name = (target) => target");
  await page.goto(`${BASE_URL}/avaluos/${id}/dictamen`, { waitUntil: "networkidle" });
  // The page says when its pages follow a measurement of the content.
  await page.waitForFunction((pending) => !document.querySelector(pending), PAGINATION_PENDING_SELECTOR, { timeout: 30_000 });

  const screen = await page.evaluate(({ rows, lastText }) => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>("main[data-print-document] article"));
    // Shown means inside the page's box: a page cuts what overflows it.
    const shown = (text: string) => pages.some((article) => {
      const box = article.getBoundingClientRect();
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.includes(text)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom) return true;
      }
      return false;
    });
    const missing = Array.from({ length: rows }, (_, index) => `Fila ${index + 1} de la tabla`).filter((text) => !shown(text));
    if (!shown(lastText)) missing.push(lastText);
    const tablePages = pages.filter((article) => article.textContent?.includes("de la tabla")).length;
    return { pages: pages.length, missing, tablePages };
  }, { rows: ROWS, lastText: LAST_TEXT });
  assert.deepEqual(screen.missing, [], "every row and the block after the table are on a page");
  assert.ok(screen.tablePages >= 2, `the table splits across pages (${screen.tablePages})`);

  const pdf = await call(actor, "POST", `/api/avaluos/${id}/dictamen/pdf`);
  assert.equal(pdf.status, 200, describeCall("POST dictamen/pdf", pdf));
  const printedPages = (Buffer.from(pdf.body as ArrayBuffer).toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  assert.equal(printedPages, screen.pages, "one PDF page per page of the dictamen");
});

/**
 * Prints one of our own pages to PDF with a headless Chromium: the same
 * output as the browser's print dialog, from the server. The page is opened
 * with the caller's session, so it only shows what that user may see.
 *
 * Chromium comes from CHROMIUM_PATH (the image installs /usr/bin/chromium;
 * locally, point it at Chrome). At most two renders run at a time.
 */
import { chromium, type Browser } from "playwright-core";

const MAX_CONCURRENT = 2;
const RENDER_TIMEOUT_MS = 90_000;
/** How long the page's layout must stay unchanged before printing. */
const SETTLE_MS = 800;

export class PdfRenderError extends Error {}

let running = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

export function internalAppUrl() {
  return (process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

export async function renderPageToPdf(input: {
  /** Path on this app, such as /avaluos/<id>/dictamen. */
  path: string;
  cookies: Array<{ name: string; value: string }>;
  /** Printing waits until the number of these elements stops changing. */
  settleSelector: string;
}): Promise<Buffer> {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) throw new PdfRenderError("CHROMIUM_PATH no está configurado.");
  const base = internalAppUrl();

  await acquire();
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath,
      // The container runs Chromium as a non-root user without user namespaces.
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      timeout: RENDER_TIMEOUT_MS,
    });
    const context = await browser.newContext();
    await context.addCookies(input.cookies.map((cookie) => ({ ...cookie, url: base })));
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    const response = await page.goto(`${base}${input.path}`, { waitUntil: "networkidle" });
    if (!response?.ok() || new URL(page.url()).pathname !== input.path) {
      throw new PdfRenderError(`La página no se pudo abrir (${response?.status() ?? "sin respuesta"}).`);
    }
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) =>
        image.complete ? null : new Promise((resolve) => { image.onload = image.onerror = resolve; })));
    });
    // Pagination measures the content after images load: wait until the page count holds.
    let last = -1;
    let stableSince = Date.now();
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const count = await page.locator(input.settleSelector).count();
      if (count !== last) {
        last = count;
        stableSince = Date.now();
      } else if (count > 0 && Date.now() - stableSince >= SETTLE_MS) {
        break;
      }
      await page.waitForTimeout(150);
    }

    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError("No se pudo generar el PDF.", { cause: error });
  } finally {
    await browser?.close().catch(() => undefined);
    release();
  }
}

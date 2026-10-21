/**
 * Prints one of our own pages to PDF with a headless Chromium: the same
 * output as the browser's print dialog, from the server. The page is opened
 * with the caller's session, so it only shows what that user may see.
 *
 * Chromium comes from CHROMIUM_PATH (the image installs /usr/bin/chromium;
 * locally, point it at Chrome). At most two renders run at a time.
 */
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { INTERNAL_RENDER_HEADER, INTERNAL_RENDER_TOKEN } from "./internal-render";

const MAX_CONCURRENT = 2;
const RENDER_TIMEOUT_MS = 90_000;
/** Longest wait for images once the page loaded; a stalled one prints without it. */
const IMAGE_WAIT_MS = 15_000;
/** How long the page's layout must stay unchanged before printing. */
const SETTLE_MS = 800;
/** Longest wait for the document's pagination; past it the PDF is refused rather than printed cut. */
const PAGINATION_WAIT_MS = 30_000;

export class PdfRenderError extends Error {}

const PAGE_NUMBER_FOOTER = {
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;padding:0 12mm;font-family:Arial,sans-serif;font-size:8px;color:#475569;text-align:right">' +
    'Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
};

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

type CountingPage = Pick<Page, "waitForTimeout"> & { locator: (selector: string) => Pick<Locator, "count"> };

/**
 * Resolves once no element matches the pending selector and the number of
 * settle elements has held for a while. Pending past the deadline is an
 * error: the pages would print as they were before their measurement.
 */
export async function waitForPagination(
  page: CountingPage,
  options: { settleSelector: string; pendingSelector?: string; deadline: number; settleMs?: number },
) {
  const settleMs = options.settleMs ?? SETTLE_MS;
  let last = -1;
  let stableSince = Date.now();
  for (;;) {
    const [count, pending] = await Promise.all([
      page.locator(options.settleSelector).count(),
      options.pendingSelector ? page.locator(options.pendingSelector).count() : 0,
    ]);
    if (count !== last || pending > 0) {
      last = count;
      stableSince = Date.now();
    } else if (count > 0 && Date.now() - stableSince >= settleMs) {
      return;
    }
    if (Date.now() >= options.deadline) {
      if (pending > 0) throw new PdfRenderError("La paginación del documento no terminó.");
      break;
    }
    await page.waitForTimeout(150);
  }
  if (last <= 0) throw new PdfRenderError("El documento no tiene páginas para imprimir.");
}

export async function renderPageToPdf(input: {
  /** Path on this app, such as /avaluos/<id>/dictamen. */
  path: string;
  cookies: Array<{ name: string; value: string }>;
  /** Printing waits until the number of these elements stops changing. */
  settleSelector: string;
  /**
   * Elements whose pagination is still due: printing waits until none
   * matches, on screen media, where the page measures its content.
   */
  pendingSelector?: string;
  /** "Página n de m" at the foot of every page, in the page's bottom margin. */
  pageNumbers?: boolean;
}): Promise<Buffer> {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) throw new PdfRenderError("CHROMIUM_PATH no está configurado.");
  const base = internalAppUrl();

  await acquire();
  let browser: Browser | null = null;
  // One deadline for the whole render; past it the browser is closed, which
  // makes any pending step fail, so the slot is always released.
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  const remaining = () => Math.max(1_000, deadline - Date.now());
  const watchdog = setTimeout(() => void browser?.close().catch(() => undefined), RENDER_TIMEOUT_MS + 2_000);
  try {
    browser = await chromium.launch({
      executablePath,
      // The container runs Chromium as a non-root user without user namespaces.
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      timeout: remaining(),
    });
    const context = await browser.newContext();
    await context.addCookies(input.cookies.map((cookie) => ({ ...cookie, url: base })));
    // Only requests to this app carry the internal-render mark, never S3 or anything else.
    await context.route(`${base}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), [INTERNAL_RENDER_HEADER]: INTERNAL_RENDER_TOKEN } }));
    const page = await context.newPage();
    page.setDefaultTimeout(remaining());

    const response = await page.goto(`${base}${input.path}`, { waitUntil: "networkidle", timeout: remaining() });
    if (!response?.ok() || new URL(page.url()).pathname !== input.path) {
      throw new PdfRenderError(`La página no se pudo abrir (${response?.status() ?? "sin respuesta"}).`);
    }
    // Fonts and images, but an image that never finishes does not hold the render.
    await page.evaluate(async (maxWaitMs) => {
      const loaded = Promise.all([
        document.fonts.ready,
        ...Array.from(document.images, (image) =>
          image.complete ? null : new Promise((resolve) => { image.onload = image.onerror = resolve; })),
      ]);
      await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, maxWaitMs))]);
    }, Math.min(IMAGE_WAIT_MS, remaining()));
    // Pagination measures the content on screen (its measuring copy is hidden in
    // print media), so it finishes before print is emulated.
    await waitForPagination(page, { ...input, deadline: Math.min(deadline, Date.now() + PAGINATION_WAIT_MS) });
    await page.emulateMedia({ media: "print" });

    page.setDefaultTimeout(remaining());
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, ...(input.pageNumbers ? PAGE_NUMBER_FOOTER : {}) });
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError("No se pudo generar el PDF.", { cause: error });
  } finally {
    clearTimeout(watchdog);
    await browser?.close().catch(() => undefined);
    release();
  }
}

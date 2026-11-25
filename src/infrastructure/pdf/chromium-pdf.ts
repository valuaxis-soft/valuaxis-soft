/**
 * Prints one of our own pages to PDF with a headless Chromium: the same
 * output as the browser's print dialog, from the server. The page is opened
 * with the caller's session, so it only shows what that user may see.
 *
 * Chromium comes from CHROMIUM_PATH (the image installs /usr/bin/chromium;
 * locally, point it at Chrome). At most two renders run at a time.
 */
import { chromium, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { INTERNAL_RENDER_HEADER, INTERNAL_RENDER_TOKEN } from "./internal-render";
import { getStorageConfig, type StorageConfig } from "@/infrastructure/storage/storage";
import { MAX_PRINT_COPY_BYTES, needsPrintCopy, printCopies, printPixelWidth, readableForPrintCopy } from "./print-images";

const MAX_CONCURRENT = 2;
const RENDER_TIMEOUT_MS = 90_000;
/** Longest wait for images once the page loaded; a stalled one prints without it. */
const IMAGE_WAIT_MS = 15_000;
/** How long the page's layout must stay unchanged before printing. */
const SETTLE_MS = 800;
/** Longest wait for the document's pagination; past it the PDF is refused rather than printed cut. */
const PAGINATION_WAIT_MS = 30_000;
/** Longest wait to read a photo again for its print copy; past it the photo prints as stored. */
const PRINT_COPY_FETCH_MS = 10_000;

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

/**
 * One photo read again for its print copy (S-2): it follows at most one
 * redirect, and only to an address readableForPrintCopy allows; null for a
 * response without a declared size, or one heavier than MAX_PRINT_COPY_BYTES.
 */
export async function readPrintCopy(request: Pick<APIRequestContext, "get">, src: string, base: string, s3: StorageConfig["s3"], timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  let url = src;
  for (let hop = 0; hop < 2; hop += 1) {
    const response = await request.get(url, { timeout: Math.max(1, until - Date.now()), maxRedirects: 0 });
    try {
      // The image route redirects to the bucket: where it lands must be one of ours too.
      const location = response.status() >= 300 && response.status() < 400 ? response.headers().location : undefined;
      if (location) {
        url = new URL(location, url).href;
        if (!readableForPrintCopy(url, base, s3)) return null;
        continue;
      }
      // shortcut: Playwright has already buffered the body here, so the size only keeps a heavy file from being decoded;
      // what bounds the download is the allowlist and the timeout. Stream it if another source is ever allowed.
      const declared = Number(response.headers()["content-length"]);
      return response.ok() && declared > 0 && declared <= MAX_PRINT_COPY_BYTES ? await response.body() : null;
    } finally {
      await response.dispose().catch(() => undefined);
    }
  }
  return null;
}

/**
 * B-16: a copy at print resolution (print-images.ts) of every photo the page
 * shows larger than it prints, served in place of the stored file from then
 * on. False when no photo needs one, so the page need not open again, and
 * when they cannot be made: the PDF then prints its photos as stored.
 */
export async function servePrintCopies(context: BrowserContext, page: Page, base: string): Promise<boolean> {
  try {
    return await placePrintCopies(context, page, base);
  } catch (error) {
    console.warn("PDF print copies failed; printing the photos as stored", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function placePrintCopies(context: BrowserContext, page: Page, base: string): Promise<boolean> {
  const placed = await page.evaluate(() => Array.from(document.images, (image) => ({
    src: image.currentSrc, boxWidth: image.offsetWidth, boxHeight: image.offsetHeight, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    cropped: getComputedStyle(image).objectFit === "cover",
    // The framing's zoom (a scale transform) prints the photo larger than its box; a quarter turn keeps the area.
    zoom: image.offsetWidth && image.offsetHeight
      ? Math.sqrt((image.getBoundingClientRect().width * image.getBoundingClientRect().height) / (image.offsetWidth * image.offsetHeight))
      : 1,
  })));
  // A photo printed twice takes the larger of its places.
  const widths = new Map<string, { width: number; naturalWidth: number }>();
  for (const image of placed) {
    if (!/^https?:/.test(image.src) || !image.boxWidth || !image.naturalWidth) continue;
    const zoom = Math.max(1, image.zoom);
    const width = Math.max(printPixelWidth({ ...image, boxWidth: image.boxWidth * zoom, boxHeight: image.boxHeight * zoom }), widths.get(image.src)?.width ?? 0);
    widths.set(image.src, { width, naturalWidth: image.naturalWidth });
  }
  const s3 = getStorageConfig().s3;
  const wanted = [...widths]
    .filter(([src, { width, naturalWidth }]) => needsPrintCopy(naturalWidth, width) && readableForPrintCopy(src, base, s3))
    .map(([src, { width }]) => [src, width] as const);
  // With the session's cookies, as the page loaded it; a photo that cannot be read again prints as it was.
  const copies = await printCopies(wanted, (src, timeoutMs) => readPrintCopy(context.request, src, base, s3, timeoutMs), PRINT_COPY_FETCH_MS);
  if (!copies.size) return false;
  await context.route((url) => copies.has(url.href), (route) =>
    route.fulfill({ body: copies.get(route.request().url()), contentType: "image/jpeg" }));
  return true;
}

/**
 * The page the second opening gives, or `first`, already valid, when that
 * opening fails or runs out of time (S-1): the PDF prints its photos as stored,
 * and the second page, if it was made, is closed.
 */
export async function secondPassOrFirst<T extends { close(): Promise<unknown> }>(
  first: T,
  newPage: () => Promise<T>,
  open: (page: T) => Promise<void>,
  path: string,
): Promise<T> {
  let second: T | undefined;
  try {
    second = await newPage();
    await open(second);
    return second;
  } catch (error) {
    console.warn("PDF second pass failed; printing the first one", { path, error: error instanceof Error ? error.message : String(error) });
    await second?.close().catch(() => undefined);
    return first;
  }
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

    const url = `${base}${input.path}`;
    const open = async (target: Page, until: number) => {
      // Never below a second: Playwright reads a timeout of 0 as no timeout at all.
      const left = () => Math.max(1_000, until - Date.now());
      target.setDefaultTimeout(left());
      const response = await target.goto(url, { waitUntil: "networkidle", timeout: left() });
      if (!response?.ok() || new URL(target.url()).pathname !== input.path) {
        throw new PdfRenderError(`La página no se pudo abrir (${response?.status() ?? "sin respuesta"}).`);
      }
      // Fonts and images, but an image that never finishes does not hold the render.
      await target.evaluate(async (maxWaitMs) => {
        const loaded = Promise.all([
          document.fonts.ready,
          ...Array.from(document.images, (image) =>
            image.complete ? null : new Promise((resolve) => { image.onload = image.onerror = resolve; })),
        ]);
        await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, maxWaitMs))]);
      }, Math.min(IMAGE_WAIT_MS, left()));
      // Pagination measures the content on screen (its measuring copy is hidden in
      // print media), so it finishes before print is emulated.
      await waitForPagination(target, { ...input, deadline: Math.min(until, Date.now() + PAGINATION_WAIT_MS) });
    };
    const started = Date.now();
    await open(page, deadline);
    const firstPassMs = Date.now() - started;
    // The second opening only when it fits in the time left: a slow document prints as before rather than failing.
    const secondPassFits = remaining() > 2 * firstPassMs + PRINT_COPY_FETCH_MS;
    let printed = page;
    // Laid out, each photo's printed size is known: the page opens again, in a page of its own, with copies at
    // print resolution, leaving the time the first took to print the first should the second fail (S-1).
    if (secondPassFits && await servePrintCopies(context, page, base)) {
      printed = await secondPassOrFirst(page, () => context.newPage(), (second) => open(second, deadline - firstPassMs), input.path);
      if (printed !== page) await page.close().catch(() => undefined);
    }
    await printed.emulateMedia({ media: "print" });

    printed.setDefaultTimeout(remaining());
    return await printed.pdf({ preferCSSPageSize: true, printBackground: true, ...(input.pageNumbers ? PAGE_NUMBER_FOOTER : {}) });
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError("No se pudo generar el PDF.", { cause: error });
  } finally {
    clearTimeout(watchdog);
    await browser?.close().catch(() => undefined);
    release();
  }
}

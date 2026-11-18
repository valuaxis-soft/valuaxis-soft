/**
 * V7.3-08 in a browser, against the production build (whose CSP allows
 * `<style>` only with the document's nonce): opening /comparables and
 * switching to «Mapa» inside the app, the first `<style nonce>` of the
 * document, the one Google copies onto its own styles, must carry the
 * document's nonce, and no style may be blocked. Before the fix the page
 * rendered one with its navigation request's nonce and Google's styles were
 * blocked (the card of a pin transparent, without its close button).
 *
 * Needs a Chrome or Chromium (E2E_BROWSER, or CHROMIUM_PATH) and a server
 * with GOOGLE_MAPS_API_KEY; without them it is skipped. The key may reject
 * the local address: Google still injects its styles, which is what this checks.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { BASE_URL, createWorld, prisma, waitForServer, type World } from "./support";

const browserPath = process.env.E2E_BROWSER || process.env.CHROMIUM_PATH;
let world: World;

before(async () => {
  if (!browserPath) return;
  await waitForServer();
  world = await createWorld();
});
after(() => prisma.$disconnect());

test("after «Lista → Mapa» inside the app, Google's styles get the document's nonce", { skip: browserPath ? false : "Sin E2E_BROWSER ni CHROMIUM_PATH" }, async (t) => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: AUTH_SESSION_COOKIE, value: world.a.admin.token, domain: new URL(BASE_URL).hostname, path: "/" }]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      const blocked: string[] = [];
      (window as unknown as { __blockedStyles: string[] }).__blockedStyles = blocked;
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.violatedDirective.startsWith("style-src")) blocked.push(event.violatedDirective);
      });
    });
    const response = await page.goto(`${BASE_URL}/comparables`, { waitUntil: "networkidle" });
    const documentNonce = response?.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(documentNonce, "the production build sends a CSP with a nonce");

    await page.getByRole("link", { name: "Mapa" }).click();
    await page.waitForURL(/vista=mapa/);
    if (await page.getByText("Los mapas no están configurados").count()) {
      t.skip("El servidor no tiene GOOGLE_MAPS_API_KEY");
      return;
    }
    // Google's script loads and injects its styles, even with a key that rejects this address.
    await page.waitForFunction(() => document.querySelectorAll("style").length > 0 && typeof (window as unknown as { google?: unknown }).google !== "undefined", null, { timeout: 20_000 });
    await page.waitForTimeout(1500);

    const firstStyleNonce = await page.evaluate(() => (document.querySelector("style[nonce]") as HTMLStyleElement | null)?.nonce ?? null);
    assert.equal(firstStyleNonce, documentNonce, "Google copies the nonce of the first <style nonce>");
    const blocked = await page.evaluate(() => (window as unknown as { __blockedStyles: string[] }).__blockedStyles);
    assert.deepEqual(blocked, [], "no style of the map may be blocked by the CSP");
  } finally {
    await browser.close();
  }
});

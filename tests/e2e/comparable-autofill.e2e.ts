/**
 * V7.1-11 and V7.2-05 in a real Chrome: with an address saved in its autofill
 * (an invented one, in a temporary profile), Chrome read «Superficie de
 * terreno (m²)» as the country and wrote «México» there, and filled the C.P.
 * and the streets. Opens «Nuevo comparable» and reads, in
 * chrome://autofill-internals, how Chrome typed each field: none may be
 * autofilled. Needs CHROME_PATH (Chrome or Chromium) and the sqlite3 command; skipped without CHROME_PATH;
 * Chrome launches with a window, since autofill does not run headless.
 *
 * Also checks the suggestions of the form over HTTP: the firm's own values,
 * never another firm's.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright-core";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { BASE_URL, call, createWorld, describeCall, prisma, waitForServer, type World } from "./support";

const CHROME = process.env.CHROME_PATH;
const PORT = 9400 + Math.floor(Math.random() * 400);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let world: World;
let profile: string | null = null;
let chrome: ChildProcess | null = null;
let browser: Browser | null = null;

before(async () => {
  await waitForServer();
  world = await createWorld();
});
after(async () => {
  await browser?.close().catch(() => undefined);
  chrome?.kill();
  if (profile) await rm(profile, { recursive: true, force: true });
  await prisma.$disconnect();
});

const launch = (args: string[]) => spawn(CHROME as string, [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", ...args], { stdio: "ignore" });

/** A temporary profile with one invented address saved in Chrome's autofill (FieldType numbers of Chromium). */
async function profileWithAddress() {
  profile = await mkdtemp(join(tmpdir(), "valuaxis-autofill-"));
  const first = launch(["about:blank"]);
  await wait(5000);
  first.kill();
  await wait(1500);
  const guid = "9f0c2d1e-1111-4a2b-9c3d-123456789abc";
  const now = Math.floor(Date.now() / 1000);
  // Invented values, without quotes, so they go in the SQL as they are.
  const tokens: Array<[number, string]> = [
    [7, "Persona Inventada Prueba"], [77, "Calle Ficticia 123"], [82, "Calle Ficticia"], [83, "123"], [81, "Fracc. Villa Imaginaria"],
    [33, "Arandas"], [34, "Jalisco"], [35, "47180"], [36, "MX"], [14, "+52 33 0000 0000"],
  ];
  const sql = [
    `INSERT INTO addresses(guid, use_count, use_date, date_modified, language_code, label, initial_creator_id, record_type) VALUES ('${guid}', 5, ${now}, ${now}, 'es', '', 0, 0);`,
    ...tokens.map(([type, value]) => `INSERT INTO address_type_tokens(guid, type, value, verification_status) VALUES ('${guid}', ${type}, '${value}', 5);`),
  ].join("\n");
  execFileSync("sqlite3", [join(profile, "Default", "Web Data"), sql]);
}

/** The last type Chrome gave each field of the app's pages, by its id: «Name:» and «Type:» of each «Field n:». */
function fieldTypes(internals: string) {
  const fields = new Map<string, { label: string; type: string }>();
  let url = "";
  for (const block of internals.split(/\n(?=Field \d+:|Target URL:)/)) {
    const target = /^Target URL:\t(.*)$/m.exec(block);
    if (target) { url = target[1]; continue; }
    if (!url.startsWith(BASE_URL.replace("127.0.0.1", "localhost")) && !url.startsWith(BASE_URL)) continue;
    const name = /^Name:\t(.*)$/m.exec(block)?.[1];
    const type = /^Type:\t(.*)$/m.exec(block)?.[1];
    if (name && type) fields.set(name, { label: /^Label:\t(.*)$/m.exec(block)?.[1] ?? "", type });
  }
  return fields;
}

test("Chrome autofills none of the fields of «Nuevo comparable», with an address saved", { skip: !CHROME, timeout: 240_000 }, async () => {
  await profileWithAddress();
  chrome = launch([`--remote-debugging-port=${PORT}`, "--window-size=1400,1000", "about:blank"]);
  await wait(3500);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const context = browser.contexts()[0];
  const internals = context.pages()[0] ?? await context.newPage();
  await internals.goto("chrome://autofill-internals");
  await context.addCookies([{ name: AUTH_SESSION_COOKIE, value: world.a.valuador.token, url: BASE_URL }]);
  const page = await context.newPage();
  await page.bringToFront();
  await page.goto(`${BASE_URL}/comparables`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Nuevo comparable" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Superficie de terreno (m²)", { exact: true }).waitFor();
  // A click is what makes Chrome look for what to fill.
  for (const input of await dialog.locator("input:not([type=file]):not([type=date])").all()) {
    if (await input.isVisible()) await input.click({ timeout: 2000 }).catch(() => undefined);
  }
  await wait(2500);
  // Only the fields of the form: the page has its own search, which is not the comparable's.
  const formIds = new Set(await dialog.locator("input[id]").evaluateAll((inputs) => inputs.map((input) => input.id)));
  const fields = new Map([...fieldTypes(await internals.evaluate(() => document.body.innerText))].filter(([id]) => formIds.has(id)));
  const land = [...fields.values()].find((field) => field.label === "Superficie de terreno (m²)");
  assert.ok(land, `Chrome parsed the land area (fields: ${[...fields.keys()].join(", ")})`);
  assert.ok(fields.size >= 15, "Chrome parsed the form");
  for (const [id, field] of fields) {
    const filled = !/^UNKNOWN_TYPE/.test(field.type) && !field.type.includes("(disabling autofill)");
    assert.ok(!filled, `${id} «${field.label}» would be autofilled: ${field.type}`);
  }
  // What the form typed stays empty: nothing came from the saved address.
  const values = await dialog.locator("input:not([type=file]):not([type=date])").evaluateAll((inputs) =>
    (inputs as HTMLInputElement[]).map((input) => input.value).filter(Boolean));
  assert.ok(!values.some((value) => /México|Arandas|47180|Ficticia/.test(value)), values.join(" | "));
});

test("the form's suggestions are the firm's own, and need a session", async () => {
  const created = await call(world.a.valuador, "POST", "/api/comparables?tipo=INMUEBLE_VENTA", {
    json: {
      location: "Inventada 10, Zapopan", area: 150, price: 2_000_000, factors: [], landUse: null, shape: null, zone: "Zona inventada E2E",
      frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null,
      url: null, offerDate: null, address: { municipality: "Municipio Inventado E2E", street: "Inventada", number: "10" },
    },
  });
  assert.equal(created.status, 201, describeCall("POST comparable", created));
  const mine = await call(world.a.consulta, "GET", "/api/comparables/sugerencias?tipo=INMUEBLE_VENTA");
  assert.equal(mine.status, 200, describeCall("GET sugerencias", mine));
  assert.ok(mine.data.address.municipality.includes("Municipio Inventado E2E"));
  assert.ok(mine.data.characteristics.zone.includes("Zona inventada E2E"));
  const theirs = await call(world.b.admin, "GET", "/api/comparables/sugerencias?tipo=INMUEBLE_VENTA");
  assert.equal(theirs.status, 200);
  assert.ok(!JSON.stringify(theirs.data).includes("Inventado E2E"), "another firm sees nothing of it");
  assert.equal((await call(world.a.consulta, "GET", "/api/comparables/sugerencias?tipo=OTRO")).status, 400);
  assert.equal((await call(null, "GET", "/api/comparables/sugerencias?tipo=INMUEBLE_VENTA")).status, 401);
});

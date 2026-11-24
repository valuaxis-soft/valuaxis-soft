/**
 * The web search of the real gateway against a local stand-in for the
 * Messages API (tests/support/fake-anthropic-server.ts): what it asks the
 * provider for, how it reads the stream and how it fails. No request leaves
 * the machine.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AiGatewayError } from "../src/features/ai/ai-gateway";
import { webListingSearchSchema } from "../src/features/valuations/comparable-search/web-listings";
import { createAnthropicGateway, DEFAULT_EXTRACTION_MODEL, DEFAULT_LISTING_SEARCH_MODEL } from "../src/infrastructure/ai/anthropic-gateway";
import { startFakeAnthropicServer, type FakeTurn } from "./support/fake-anthropic-server";

const PROMPT = { system: "Reglas de la búsqueda.", user: "Terrenos en venta en Villa Ejemplo." };
const LISTING = {
  title: "Terreno en Las Lomas", propertyType: "terreno", operation: "venta" as const, landArea: 6000, builtArea: null, price: 3_000_000,
  currency: "MXN" as const, neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", addressOrReference: "",
  portal: "Portal Ejemplo", url: "https://portal.example/anuncio/1", urlKind: "anuncio" as const, pageStatus: "vigente" as const, listingDate: "", notes: "",
  street: "", streetNumber: "", subdivision: "", postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "",
  age: null, frontage: 40, depth: null, frontCount: null, landUse: "Habitacional", topography: "", services: "", shape: "", conservation: "", amenities: "",
  contactName: "", agency: "", contactPhone: "", publicationId: "",
};
const REPORT = { candidates: [LISTING], marketNote: "" };

/** The gateway pointed at the stand-in. The SDK reads ANTHROPIC_BASE_URL when the client is built. */
async function withServer<T>(turns: FakeTurn[], run: (gateway: ReturnType<typeof createAnthropicGateway>, server: Awaited<ReturnType<typeof startFakeAnthropicServer>>) => Promise<T>) {
  const server = await startFakeAnthropicServer(turns);
  const before = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = server.url;
  try {
    return await run(createAnthropicGateway({ apiKey: "llave-de-prueba" }), server);
  } finally {
    if (before === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = before;
    await server.close();
  }
}

const expectFailure = (kind: string) => (error: unknown) => error instanceof AiGatewayError && error.kind === kind;

test("the search model is its own constant, apart from the extraction model", () => {
  assert.equal(DEFAULT_LISTING_SEARCH_MODEL, "claude-opus-5-5");
  assert.notEqual(DEFAULT_LISTING_SEARCH_MODEL, DEFAULT_EXTRACTION_MODEL);
});

test("a search asks for the provider's web search with a cap, and answers through a strict tool", async () => {
  await withServer([{
    searches: [
      { query: "terrenos en venta Villa Ejemplo", results: [{ url: "https://portal.example/anuncio/1", title: "Terreno" }, { url: "https://otro.example/lista", title: "Lista" }] },
      { query: "terrenos Villa Ejemplo inmobiliaria", errorCode: "too_many_requests" },
    ],
    report: REPORT,
    stopReason: "tool_use",
    usage: { input_tokens: 30_000, output_tokens: 2_000 },
  }], async (gateway, server) => {
    const progress: Array<{ searches: number; query: string | null }> = [];
    const result = await gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000, onProgress: (step) => progress.push(step) });

    assert.deepEqual(result.data, REPORT);
    assert.deepEqual(result.resultUrls, ["https://portal.example/anuncio/1", "https://otro.example/lista"]);
    assert.deepEqual(result.usage, { model: "claude-opus-5-5", inputTokens: 30_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 2 });
    assert.deepEqual(progress, [
      { searches: 1, query: "terrenos en venta Villa Ejemplo", fetches: 0, phase: "searching" },
      { searches: 2, query: "terrenos Villa Ejemplo inmobiliaria", fetches: 0, phase: "searching" },
      { searches: 2, query: "terrenos Villa Ejemplo inmobiliaria", fetches: 0, phase: "reporting" },
    ]);
    // A ceiling of cost that fits five listings with all their data.
    assert.equal(server.requests[0].body.max_tokens, 20_000);

    assert.equal(server.requests.length, 1);
    const { body, headers } = server.requests[0];
    assert.equal(body.model, "claude-opus-5-5");
    assert.equal(body.stream, true);
    const tools = body.tools as Array<Record<string, unknown>>;
    assert.equal(tools[0].type, "web_search_20260209");
    assert.equal(tools[0].name, "web_search");
    assert.equal(tools[0].max_uses, 8);
    assert.equal((tools[0].user_location as { country: string }).country, "MX");
    assert.equal(tools[1].name, "report_results");
    assert.equal(tools[1].strict, true);
    // Without a number of pages to open, the provider only searches.
    assert.equal(tools.length, 2);
    const schema = tools[1].input_schema as { type: string; additionalProperties: boolean; required: string[] };
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["candidates", "marketNote"]);
    // This model family rejects forced tool use and an explicit thinking configuration.
    assert.deepEqual(body.tool_choice, { type: "auto" });
    assert.equal("thinking" in body, false);
    assert.equal(body.fallbacks, "default");
    assert.match(String(headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
    assert.match((body.system as Array<{ text: string }>)[0].text, /^Reglas de la búsqueda\.[\s\S]*report_results/);
    // No standalone code execution next to the web search: the tool brings its own.
    assert.equal(tools.length, 2);
  });
});

test("a turn the provider paused is sent back as it came, and the searches left are what the cap allows", async () => {
  await withServer([
    { searches: [{ query: "uno", results: [{ url: "https://portal.example/a", title: "A" }] }, { query: "dos", results: [] }], stopReason: "pause_turn" },
    { searches: [{ query: "tres", results: [{ url: "https://portal.example/b", title: "B" }] }], report: REPORT, stopReason: "tool_use" },
  ], async (gateway, server) => {
    const result = await gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 });
    assert.equal(result.usage.webSearches, 3);
    assert.equal(result.usage.inputTokens, 42_000);
    assert.deepEqual(result.resultUrls, ["https://portal.example/a", "https://portal.example/b"]);
    assert.equal(server.requests.length, 2);
    const second = server.requests[1].body;
    const messages = second.messages as Array<{ role: string; content: unknown }>;
    // Resumed with the paused turn last: no "continue" message added.
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
    // The two searches run from the provider's code execution are not counted by it on the resumed turn: the cap is lowered here.
    assert.equal((second.tools as Array<{ max_uses: number }>)[0].max_uses, 6);
  });
  // Direct searches of the paused turn are counted by the provider itself: the cap travels as it was.
  await withServer([
    { searches: [{ query: "uno", direct: true, results: [] }], stopReason: "pause_turn" },
    { report: REPORT, stopReason: "tool_use" },
  ], async (gateway, server) => {
    await gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 });
    assert.equal((server.requests[1].body.tools as Array<{ max_uses: number }>)[0].max_uses, 8);
  });
  // With pages to open, the provider's reader is offered after the report tool, with its own cap.
  await withServer([{ report: REPORT, stopReason: "tool_use" }], async (gateway, server) => {
    await gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, maxFetches: 6, timeoutMs: 5_000 });
    const tools = server.requests[0].body.tools as Array<Record<string, unknown>>;
    assert.deepEqual([tools[2].type, tools[2].name, tools[2].max_uses], ["web_fetch_20260209", "web_fetch", 6]);
  });
});

test("a model that ends without its answer is asked for it once; twice is an unreadable answer", async () => {
  await withServer([{ text: "Encontré varios terrenos.", stopReason: "end_turn" }, { report: REPORT, stopReason: "tool_use" }], async (gateway, server) => {
    const result = await gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 });
    assert.deepEqual(result.data, REPORT);
    const messages = server.requests[1].body.messages as Array<{ role: string; content: unknown }>;
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant", "user"]);
    assert.match(String(messages[2].content), /report_results/);
  });
  await withServer([{ text: "Encontré varios terrenos.", stopReason: "end_turn" }], async (gateway, server) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("invalid_output"));
    assert.equal(server.requests.length, 2);
  });
});

test("an answer outside the schema, a refusal and a cut-off answer are failures, never a half result", async () => {
  await withServer([{ report: { candidates: [{ ...LISTING, price: "tres millones" }], marketNote: "" }, stopReason: "tool_use" }], async (gateway) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("invalid_output"));
  });
  await withServer([{ stopReason: "refusal" }], async (gateway) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("refused"));
  });
  await withServer([{ report: REPORT, stopReason: "max_tokens" }], async (gateway) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("invalid_output"));
  });
});

test("web search turned off in the provider's console is a configuration failure, said in words", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });
  await withServer([{ status: 400, error: { type: "invalid_request_error", message: "Web search is not enabled for this organization." } }], async (gateway) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("configuration"));
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Web search is not enabled/);
});

test("a rejected key is a configuration failure and a search past its time is a timeout", async () => {
  await withServer([{ status: 401, error: { type: "authentication_error", message: "invalid x-api-key" } }], async (gateway) => {
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 5_000 }), expectFailure("configuration"));
  });
  await withServer([{ report: REPORT, stopReason: "tool_use", delayMs: 2_000 }], async (gateway) => {
    const started = Date.now();
    await assert.rejects(gateway.searchWeb(PROMPT, webListingSearchSchema, { maxSearches: 8, timeoutMs: 150 }), expectFailure("timeout"));
    assert.ok(Date.now() - started < 1_500, "the search ended at its time limit, not when the provider answered");
  });
});

test("V8.2: the pages the provider opened come back as text, each as soon as it arrives, and the times of the search are measured", async () => {
  await withServer([{
    searches: [{ query: "terrenos en venta Villa Ejemplo", results: [{ url: "https://portal.example/anuncio/1", title: "Terreno" }] }],
    fetches: [
      { url: "https://portal.example/anuncio/1", text: "Terreno en venta\n$3,000,000\nInformación del anunciante: Manuel Flores" },
      { url: "https://portal.example/anuncio/2", errorCode: "url_not_accessible" },
    ],
    report: REPORT,
    stopReason: "tool_use",
  }], async (gateway) => {
    const arrived: string[] = [];
    const phases: string[] = [];
    const result = await gateway.searchWeb(PROMPT, webListingSearchSchema, {
      maxSearches: 9, maxFetches: 8, timeoutMs: 5_000,
      onPage: (page) => arrived.push(page.url),
      onProgress: (progress) => phases.push(`${progress.phase}:${progress.fetches}`),
    });
    assert.deepEqual(result.pages, [{ url: "https://portal.example/anuncio/1", text: "Terreno en venta\n$3,000,000\nInformación del anunciante: Manuel Flores" }]);
    assert.deepEqual(arrived, ["https://portal.example/anuncio/1"]);
    // Searching, opening the two pages, then writing the answer.
    assert.deepEqual(phases, ["searching:0", "fetching:1", "fetching:2", "reporting:2"]);
    // A page that failed to open is neither a page nor an address that was found.
    assert.deepEqual(result.resultUrls, ["https://portal.example/anuncio/1"]);
    assert.equal(result.timings?.turns, 1);
    assert.ok((result.timings?.firstSearchMs ?? -1) >= 0);
    assert.ok((result.timings?.reportStartMs ?? -1) >= (result.timings?.firstSearchMs ?? 0));
    assert.ok((result.timings?.totalMs ?? -1) >= (result.timings?.reportStartMs ?? 0));
  });
});

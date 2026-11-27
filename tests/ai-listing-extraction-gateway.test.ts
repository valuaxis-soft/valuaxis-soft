/**
 * V8.12 (07:24): pasting the same listing again answered «No se pudieron leer
 * los datos del anuncio. Código: G-…». The extraction used `messages.parse`,
 * which parses the answer before its stop reason can be read: an answer cut
 * at the token limit (or one outside the schema) threw a bare SDK error that
 * the route reported as an unknown failure with a code. Now the real gateway,
 * against a local stand-in of the Messages API, reads the stop reason first
 * and turns any unreadable answer into `invalid_output`, and «Pegar anuncio»
 * asks once more before telling the appraiser, in words, what to do.
 */
import "./support/no-ai-key";

import assert from "node:assert/strict";
import { test } from "node:test";

import { LISTING_UNREADABLE } from "../src/features/ai/ai-assist.service";
import { AiGatewayError } from "../src/features/ai/ai-gateway";
import { extractListing, listingExtractionSchema } from "../src/features/ai/listing-extraction";
import { createAnthropicGateway } from "../src/infrastructure/ai/anthropic-gateway";
import { EMPTY_EXTRACTION } from "./support/fake-ai-gateway";
import { startFakeAnthropicServer, type FakeTurn } from "./support/fake-anthropic-server";

const LISTING = "Casa en venta en Bugambilias, Zapopan, Jalisco. Precio $8,500,000. Terreno 360 m2, construcción 239 m2. ID del anuncio EB-WZ4385.";

async function withServer<T>(turns: FakeTurn[], run: (gateway: ReturnType<typeof createAnthropicGateway>) => Promise<T>) {
  const server = await startFakeAnthropicServer(turns);
  const before = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = server.url;
  try {
    const result = await run(createAnthropicGateway({ apiKey: "llave-de-prueba" }));
    return { result, requests: server.requests };
  } finally {
    if (before === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = before;
    await server.close();
  }
}

const answer = JSON.stringify({ ...EMPTY_EXTRACTION, price: "$8,500,000", landArea: "360 m2", publicationId: "ID del anuncio EB-WZ4385" });

test("an extraction is read after its stop reason, with the schema, and asks for room enough", async () => {
  const { result, requests } = await withServer([{ text: answer, stopReason: "end_turn" }], (gateway) =>
    gateway.extract({ system: "Reglas.", user: LISTING }, listingExtractionSchema));
  assert.equal(result.data.price, "$8,500,000");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.stream, undefined);
  assert.equal(requests[0].body.max_tokens, 4096);
  const format = (requests[0].body.output_config as { format: { type: string; schema: { type: string } } }).format;
  assert.equal(format.type, "json_schema");
  assert.equal(format.schema.type, "object");
});

test("an answer cut at the token limit, unreadable or outside the schema is `invalid_output`, never a bare error", async () => {
  const cut = answer.slice(0, 60);
  for (const turn of [
    { text: cut, stopReason: "max_tokens" as const },
    { text: cut, stopReason: "end_turn" as const },
    { text: JSON.stringify({ price: 5 }), stopReason: "end_turn" as const },
  ]) {
    await withServer([turn], async (gateway) => {
      await assert.rejects(
        gateway.extract({ system: "Reglas.", user: LISTING }, listingExtractionSchema),
        (error: unknown) => error instanceof AiGatewayError && error.kind === "invalid_output" && error.status === 502,
      );
    });
  }
});

test("«Pegar anuncio» reads the same listing whatever the first answer was: once cut, the second is used", async () => {
  // The service retries in `proposeComparableFromListing`; here the pure part, through the real gateway.
  const { result } = await withServer([{ text: answer.slice(0, 60), stopReason: "max_tokens" }, { text: answer, stopReason: "end_turn" }], async (gateway) => {
    await assert.rejects(extractListing(gateway, { text: LISTING, url: null }), (error: unknown) => error instanceof AiGatewayError && error.kind === "invalid_output");
    return extractListing(gateway, { text: LISTING, url: null });
  });
  assert.equal(result.proposal.price?.amount, 8_500_000);
  assert.equal(result.proposal.publicationId?.value, "EB-WZ4385");
});

test("what the appraiser reads when the answer cannot be read twice says what to do, without a code", () => {
  assert.match(LISTING_UNREADABLE, /Vuelve a intentarlo/);
  assert.match(LISTING_UNREADABLE, /captúralos a mano/);
  assert.doesNotMatch(LISTING_UNREADABLE, /Código/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityKeys,
  provenanceNote,
  rankAndDeduplicate,
  relevance,
  searchText,
  searchTokens,
  withinRanges,
  withProvenance,
} from "../src/features/valuations/comparable-search/normalize";
import { runComparableSearch } from "../src/features/valuations/comparable-search/orchestrator";
import { addFoundComparablesSchema, parseComparableSearchQuery } from "../src/features/valuations/comparable-search/schemas";
import type {
  ComparableSearchHit,
  ComparableSearchQuery,
  ComparableSearchResult,
  ComparableSearchSource,
  FoundComparable,
} from "../src/features/valuations/comparable-search/types";

function found(location: string, area: number | null = 140, price: number | null = 1_260_000, extra: Partial<FoundComparable> = {}): FoundComparable {
  return {
    location, area, price,
    landUse: null, landUseKey: null, shape: null, zone: null, frontCount: null, frontage: null, depth: null,
    topography: null, services: null, conservation: null, quality: null, notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
    ...extra,
  };
}

const result = (id: string, comparable: FoundComparable, capturedOn: string | null = "2026-09-01"): ComparableSearchResult =>
  ({ id, origin: null, capturedOn, photoCount: 0, comparable });
const hit = (sourceId: string, id: string, comparable: FoundComparable, capturedOn: string | null = "2026-09-01"): ComparableSearchHit =>
  ({ ...result(id, comparable, capturedOn), key: `${sourceId}:${id}`, sourceId, sourceLabel: sourceId });
const source = (id: string, search: ComparableSearchSource["search"], available = true): ComparableSearchSource =>
  ({ id, label: `Fuente ${id}`, isAvailable: () => available, search });

const query = (overrides: Partial<ComparableSearchQuery> = {}): ComparableSearchQuery =>
  ({ text: "arandas", type: "TERRENO_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20, ...overrides });
const context = { organizationId: 1, valuationId: 1 };
const params = (values: Record<string, string>) => new URLSearchParams(values);

test("text is compared without accents, case or punctuation", () => {
  assert.equal(searchText("  Av. JUÁREZ #12, Arandas (Centro) "), "av juarez 12 arandas centro");
  assert.equal(searchText("Peñón Güero"), "penon guero");
  assert.deepEqual(searchTokens("Juárez, juarez  ARANDAS"), ["juarez", "arandas"]);
  assert.equal(searchTokens("uno dos tres cuatro cinco seis siete ocho nueve diez").length, 8);
});

test("the location weighs more than the other texts, and the whole phrase more than loose words", () => {
  const inLocation = relevance("juarez arandas", found("Calle Juárez, Arandas"));
  const scattered = relevance("juarez arandas", found("Arandas, calle Benito Juárez"));
  const inNotes = relevance("juarez arandas", found("Lote 4", 140, 1, { notes: "Sobre Juárez, en Arandas" }));
  assert.ok(inLocation > scattered && scattered > inNotes && inNotes > 0);
  assert.equal(relevance("tepatitlan", found("Calle Juárez 12, Arandas")), 0);
});

test("two results are the same offer by URL, or by location, area and price", () => {
  const base = found("Calle Juárez 12, Arandas", 140, 1_260_000);
  const sameContent = identityKeys(found("calle juarez 12 ARANDAS", 140.001, 1_260_000));
  assert.ok(identityKeys(base).some((key) => sameContent.includes(key)));
  assert.ok(!identityKeys(base).some((key) => identityKeys(found("Calle Juárez 12, Arandas", 141, 1_260_000)).includes(key)));
  const a = identityKeys(found("Lote A", 100, 1, { url: "https://www.Portal.mx/anuncio/7/#fotos" }));
  const b = identityKeys(found("Terreno en venta", 200, 2, { url: "http://portal.mx/anuncio/7" }));
  assert.ok(a.some((key) => b.includes(key)), "the same listing under another title");
  assert.equal(identityKeys(found("Lote A")).length, 1, "no URL, no URL key");
});

test("ranking puts relevance first, then recency, keeps one per offer and leaves out what the valuation has", () => {
  const hits = [
    hit("a", "old", found("Calle Juárez 12, Arandas"), "2026-01-10"),
    hit("b", "new", found("Calle Juárez 12, Arandas"), "2026-09-20"),
    hit("a", "notes", found("Lote 9", 300, 900_000, { notes: "Cerca de Arandas" }), "2026-10-01"),
    hit("a", "mine", found("Virreyes, Arandas", 140, 1_220_000), "2026-10-02"),
    hit("a", "other", found("Mixtecos, Arandas", 140, 1_330_000), "2026-03-01"),
  ];
  const ranked = rankAndDeduplicate("arandas", hits, [found("VIRREYES, arandas", 140, 1_220_000)]);
  assert.deepEqual(ranked.map((item) => item.key), ["b:new", "a:other", "a:notes"]);
});

test("ranges leave out what falls outside, and what has no value on a bounded side", () => {
  const ranges = { areaMin: 100, areaMax: 200, priceMin: null, priceMax: 1_500_000 };
  assert.equal(withinRanges(ranges, { area: 100, price: 1_500_000 }), true);
  assert.equal(withinRanges(ranges, { area: 99.99, price: 1 }), false);
  assert.equal(withinRanges(ranges, { area: 150, price: 1_500_001 }), false);
  assert.equal(withinRanges(ranges, { area: null, price: 1 }), false);
  assert.equal(withinRanges({ areaMin: null, areaMax: null, priceMin: null, priceMax: null }, { area: null, price: null }), true);
});

test("an added comparable says where it was found, once, within the notes limit", () => {
  assert.equal(provenanceNote("Comparables del despacho", "avalúo AV-12"), "Encontrado en Comparables del despacho (avalúo AV-12).");
  assert.equal(withProvenance(found("Lote"), "Portal", null).notes, "Encontrado en Portal.");
  const first = withProvenance(found("Lote", 1, 1, { notes: "Esquina, con barda." }), "Comparables del despacho", "avalúo AV-12");
  assert.equal(first.notes, "Esquina, con barda.\nEncontrado en Comparables del despacho (avalúo AV-12).");
  // Found again from the valuation it was added to: the earlier note is replaced.
  const second = withProvenance(first, "Comparables del despacho", "avalúo AV-30");
  assert.equal(second.notes, "Esquina, con barda.\nEncontrado en Comparables del despacho (avalúo AV-30).");
  const long = withProvenance(found("Lote", 1, 1, { notes: "x".repeat(1000) }), "Portal", "anuncio 5");
  assert.equal(long.notes?.length, 1000);
  assert.ok(long.notes?.endsWith("Encontrado en Portal (anuncio 5)."));
});

test("the query needs a type and three letters; ranges are optional, positive and ordered; the limit is capped", () => {
  const ok = parseComparableSearchQuery(params({ tipo: "TERRENO_VENTA", q: "  Arandas ", supMin: "100", precioMax: "2000000.5", supMax: "" }));
  assert.deepEqual(ok, { ok: true, query: { text: "Arandas", type: "TERRENO_VENTA", areaMin: 100, areaMax: null, priceMin: null, priceMax: 2000000.5, limit: 20 } });
  const limited = parseComparableSearchQuery(params({ tipo: "INMUEBLE_RENTA", q: "centro", limite: "50" }));
  assert.ok(limited.ok && limited.query.limit === 50);

  const rejected: [Record<string, string>, RegExp][] = [
    [{ q: "arandas" }, /Tipo de comparable/],
    [{ tipo: "CASA", q: "arandas" }, /Tipo de comparable/],
    [{ tipo: "TERRENO_VENTA" }, /zona, colonia, municipio o calle/],
    [{ tipo: "TERRENO_VENTA", q: "ab" }, /al menos 3 letras/],
    [{ tipo: "TERRENO_VENTA", q: ".,;-- a" }, /al menos 3 letras/],
    [{ tipo: "TERRENO_VENTA", q: "x".repeat(121) }, /demasiado larga/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", supMin: "cien" }, /número/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", precioMin: "-5" }, /mayor que cero/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", supMin: "200", supMax: "100" }, /superficie máxima/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", precioMin: "2", precioMax: "1" }, /precio máximo/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", limite: "51" }, /hasta 50/],
    [{ tipo: "TERRENO_VENTA", q: "arandas", limite: "0" }, /./],
    [{ tipo: "TERRENO_VENTA", q: "arandas", limite: "2.5" }, /entero/],
  ];
  for (const [values, message] of rejected) {
    const parsed = parseComparableSearchQuery(params(values));
    assert.ok(!parsed.ok, JSON.stringify(values));
    assert.match(parsed.error, message);
  }
});

test("the results sent back to be added go through the capture form's rules", () => {
  const item = { sourceId: "despacho", origin: "avalúo AV-1", comparable: found("Calle Juárez 12") };
  assert.ok(addFoundComparablesSchema.safeParse({ results: [item] }).success);
  assert.ok(!addFoundComparablesSchema.safeParse({ results: [] }).success);
  assert.ok(!addFoundComparablesSchema.safeParse({ results: [{ ...item, comparable: found("") }] }).success);
  assert.ok(!addFoundComparablesSchema.safeParse({ results: [{ ...item, comparable: found("Lote", 1, 1, { url: "javascript:alert(1)" }) }] }).success);
  assert.ok(!addFoundComparablesSchema.safeParse({ results: Array.from({ length: 51 }, () => item) }).success);
});

test("a failing source and a slow one are reported next to the results of the others", async () => {
  const logged: string[] = [];
  let aborted = false;
  const response = await runComparableSearch([
    source("ok", async () => [result("1", found("Calle Juárez 12, Arandas"))]),
    source("rota", async () => { throw new Error("connection refused: secret-host"); }),
    source("lenta", (_query, { signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => { aborted = true; });
      setTimeout(() => resolve([result("9", found("Tardío, Arandas", 500, 5))]), 300).unref();
    })),
    source("apagada", async () => { throw new Error("must not be asked"); }, false),
  ], query(), context, { timeoutMs: 40, onError: (id) => logged.push(id) });

  assert.deepEqual(response.results.map((item) => [item.key, item.sourceId, item.sourceLabel]), [["ok:1", "ok", "Fuente ok"]]);
  assert.deepEqual(response.sources, [
    { id: "ok", label: "Fuente ok", count: 1, error: null },
    { id: "rota", label: "Fuente rota", count: 0, error: "No se pudo consultar." },
    { id: "lenta", label: "Fuente lenta", count: 0, error: "No respondió a tiempo." },
  ], "an unavailable source is not listed, and the real error stays on the server");
  assert.deepEqual(logged, ["rota"]);
  assert.equal(aborted, true, "the slow source is told to stop");
});

test("a source whose availability check breaks fails alone", async () => {
  const broken: ComparableSearchSource = { id: "x", label: "X", isAvailable: () => { throw new Error("no config"); }, search: async () => [] };
  const response = await runComparableSearch(
    [broken, source("ok", async () => [result("1", found("Arandas centro"))])], query(), context, { onError: () => undefined });
  assert.equal(response.results.length, 1);
  assert.equal(response.sources[0].error, "No se pudo consultar.");
});

test("results of several sources are merged: one per offer, invalid and out-of-range ones dropped, cut at the limit", async () => {
  const shared = found("Calle Juárez 12, Arandas", 140, 1_260_000);
  const response = await runComparableSearch([
    source("despacho", async () => [
      result("1", shared, "2026-05-01"),
      result("2", found("Virreyes, Arandas", 140, 1_220_000), "2026-05-02"),
      result("3", found("Ya capturado, Arandas", 150, 1_000_000), "2026-05-03"),
    ]),
    source("portal", async () => [
      result("a", { ...shared, url: "https://portal.mx/1" }, "2026-08-01"),
      result("b", found("Grande, Arandas", 900, 9_000_000), "2026-08-02"),
      result("c", found("Sin protocolo, Arandas", 140, 1_000_000, { url: "portal.mx/2" }), "2026-08-03"),
      result("d", found("Mixtecos, Arandas", 140, 1_330_000), "2026-08-04"),
    ]),
  ], query({ areaMax: 500 }), context, { existing: [found("ya capturado, arandas", 150, 1_000_000)] });

  // Equally relevant, newest first. The newer copy of the shared offer wins; "b" is out of range, "c" would not pass the capture form.
  assert.deepEqual(response.results.map((item) => item.key), ["portal:d", "portal:a", "despacho:2"]);
  assert.deepEqual(response.sources.map((item) => [item.id, item.count]), [["despacho", 1], ["portal", 2]]);

  const limited = await runComparableSearch(
    [source("s", async () => Array.from({ length: 30 }, (_, index) => result(String(index), found(`Lote ${index}, Arandas`, 100 + index, 1000))))],
    query({ limit: 5 }), context);
  assert.equal(limited.results.length, 5);
});

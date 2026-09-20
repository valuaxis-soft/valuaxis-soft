import assert from "node:assert/strict";
import test from "node:test";

import {
  sectionMetadataFromContent,
  hydrateSectionMetadata,
  blockMetadataFromContent,
  hydrateBlockMetadata,
  apartadoMetadataFromContent,
  hydrateApartadoMetadata,
  resolveFlowSpacingBeforePx,
} from "../src/features/valuations/metadata";

/* ================================================================== */
/*  SECTION METADATA                                                   */
/* ================================================================== */

test("section: legacy metadata without flowSpacingBeforePx → undefined", () => {
  const result = hydrateSectionMetadata({});
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("section: explicit zero preserved", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: 0 });
  assert.equal(result.flowSpacingBeforePx, 0);
});

test("section: positive value preserved", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: 17 });
  assert.equal(result.flowSpacingBeforePx, 17);
});

test("section: negative value rejected → undefined", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: -5 });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("section: string value rejected → undefined", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: "12" });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("section: NaN rejected → undefined", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: NaN });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("section: Infinity rejected → undefined", () => {
  const result = hydrateSectionMetadata({ flowSpacingBeforePx: Infinity });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("section: roundtrip — serialize then hydrate preserves value", () => {
  const content = { enabled: true, flowSpacingBeforePx: 12 };
  const serialized = sectionMetadataFromContent(content);
  assert.equal(serialized.flowSpacingBeforePx, 12);
  const hydrated = hydrateSectionMetadata(serialized);
  assert.equal(hydrated.flowSpacingBeforePx, 12);
});

test("section: roundtrip — undefined stays undefined", () => {
  const content = { enabled: true };
  const serialized = sectionMetadataFromContent(content);
  assert.equal(serialized.flowSpacingBeforePx, undefined);
  const hydrated = hydrateSectionMetadata(serialized);
  assert.equal(hydrated.flowSpacingBeforePx, undefined);
});

test("section: no other fields lost", () => {
  const result = hydrateSectionMetadata({ startOnNewPage: true, flowSpacingBeforePx: 8 });
  assert.equal(result.enabled, true);
  assert.equal(result.startOnNewPage, true);
  assert.equal(result.flowSpacingBeforePx, 8);
});

/* ================================================================== */
/*  BLOCK METADATA                                                     */
/* ================================================================== */

test("block: legacy metadata without flowSpacingBeforePx → undefined", () => {
  const result = hydrateBlockMetadata({});
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("block: explicit zero preserved", () => {
  const result = hydrateBlockMetadata({ flowSpacingBeforePx: 0 });
  assert.equal(result.flowSpacingBeforePx, 0);
});

test("block: positive value preserved", () => {
  const result = hydrateBlockMetadata({ flowSpacingBeforePx: 24 });
  assert.equal(result.flowSpacingBeforePx, 24);
});

test("block: negative value rejected → undefined", () => {
  const result = hydrateBlockMetadata({ flowSpacingBeforePx: -3 });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("block: roundtrip — serialize then hydrate preserves value", () => {
  const content = { enabled: true, flowSpacingBeforePx: 10 };
  const serialized = blockMetadataFromContent(content);
  assert.equal(serialized.flowSpacingBeforePx, 10);
  const hydrated = hydrateBlockMetadata(serialized);
  assert.equal(hydrated.flowSpacingBeforePx, 10);
});

test("block: no other fields lost", () => {
  const result = hydrateBlockMetadata({ startOnNewPage: true, flowSpacingBeforePx: 5 });
  assert.equal(result.enabled, true);
  assert.equal(result.startOnNewPage, true);
  assert.equal(result.flowSpacingBeforePx, 5);
  assert.equal(result.contentLayout, undefined);
  assert.equal(result.blockFlow, undefined);
});

/* ================================================================== */
/*  SUBBLOCK METADATA                                                  */
/* ================================================================== */

test("subblock: legacy metadata without flowSpacingBeforePx → undefined", () => {
  const result = hydrateApartadoMetadata({});
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("subblock: explicit zero preserved", () => {
  const result = hydrateApartadoMetadata({ flowSpacingBeforePx: 0 });
  assert.equal(result.flowSpacingBeforePx, 0);
});

test("subblock: positive value preserved", () => {
  const result = hydrateApartadoMetadata({ flowSpacingBeforePx: 15 });
  assert.equal(result.flowSpacingBeforePx, 15);
});

test("subblock: negative value rejected → undefined", () => {
  const result = hydrateApartadoMetadata({ flowSpacingBeforePx: -10 });
  assert.equal(result.flowSpacingBeforePx, undefined);
});

test("subblock: roundtrip — serialize then hydrate preserves value", () => {
  const content = { enabled: true, flowSpacingBeforePx: 7 };
  const serialized = apartadoMetadataFromContent(content);
  assert.equal(serialized.flowSpacingBeforePx, 7);
  const hydrated = hydrateApartadoMetadata(serialized);
  assert.equal(hydrated.flowSpacingBeforePx, 7);
});

test("subblock: no other fields lost", () => {
  const result = hydrateApartadoMetadata({ startOnNewPage: true, presentationMode: "technical-list", flowSpacingBeforePx: 3 });
  assert.equal(result.enabled, true);
  assert.equal(result.startOnNewPage, true);
  assert.equal(result.presentationMode, "technical-list");
  assert.equal(result.flowSpacingBeforePx, 3);
});

/* ================================================================== */
/*  PAYLOAD WRAPPING (readConfigMetadata path)                         */
/* ================================================================== */

test("section: payload wrapper path works", () => {
  const config = { payload: { flowSpacingBeforePx: 20 } };
  const result = hydrateSectionMetadata(config);
  assert.equal(result.flowSpacingBeforePx, 20);
});

test("block: payload wrapper path works", () => {
  const config = { payload: { flowSpacingBeforePx: 14 } };
  const result = hydrateBlockMetadata(config);
  assert.equal(result.flowSpacingBeforePx, 14);
});

test("subblock: payload wrapper path works", () => {
  const config = { payload: { flowSpacingBeforePx: 9 } };
  const result = hydrateApartadoMetadata(config);
  assert.equal(result.flowSpacingBeforePx, 9);
});

/* ================================================================== */
/*  RESOLVE FLOW SPACING BEFORE PX                                     */
/* ================================================================== */

test("resolve: undefined + default → default", () => {
  assert.equal(resolveFlowSpacingBeforePx(undefined, 4), 4);
});

test("resolve: 0 + default → 0 (explicit zero is valid)", () => {
  assert.equal(resolveFlowSpacingBeforePx(0, 4), 0);
});

test("resolve: positive value → same value", () => {
  assert.equal(resolveFlowSpacingBeforePx(12, 4), 12);
});

test("resolve: negative value → default", () => {
  assert.equal(resolveFlowSpacingBeforePx(-5, 4), 4);
});

test("resolve: NaN → default", () => {
  assert.equal(resolveFlowSpacingBeforePx(NaN, 4), 4);
});

test("resolve: Infinity → default", () => {
  assert.equal(resolveFlowSpacingBeforePx(Infinity, 4), 4);
});

test("resolve: -Infinity → default", () => {
  assert.equal(resolveFlowSpacingBeforePx(-Infinity, 4), 4);
});

test("resolve: string (wrong type) → default", () => {
  // @ts-expect-error — testing runtime guard
  assert.equal(resolveFlowSpacingBeforePx("12", 4), 4);
});

test("resolve: null (wrong type) → default", () => {
  // @ts-expect-error — testing runtime guard
  assert.equal(resolveFlowSpacingBeforePx(null, 4), 4);
});

test("resolve: default 0 — explicit 0 still yields 0", () => {
  assert.equal(resolveFlowSpacingBeforePx(0, 0), 0);
});

test("resolve: default 0 — undefined yields 0", () => {
  assert.equal(resolveFlowSpacingBeforePx(undefined, 0), 0);
});

test("resolve: large value preserved", () => {
  assert.equal(resolveFlowSpacingBeforePx(200, 4), 200);
});

test("resolve: fractional value preserved", () => {
  assert.equal(resolveFlowSpacingBeforePx(7.5, 4), 7.5);
});

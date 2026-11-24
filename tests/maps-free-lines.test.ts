/**
 * «Trazo libre» of the croquis (23 nov 2026): a line drawn by hand vertex by
 * vertex, several per croquis, each with its color and width, saved with the
 * croquis settings and drawn on the image where it was drawn.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CROQUIS_SETTINGS, croquisSettingsSchema, readCroquisSettings } from "../src/features/maps/croquis";
import {
  DEFAULT_FREE_LINE_STYLE,
  MAX_FREE_LINES,
  MAX_LINE_POINTS,
  addDraftPoint,
  dedupePoints,
  finishFreeLine,
  freeLineInFrame,
  freeLinePixels,
  freeLineSchema,
  freeLinesOverlaySvg,
  newFreeLineId,
  readFreeLines,
  undoDraftPoint,
  withLinePoints,
  withLineStyle,
  withoutLine,
  type FreeLine,
} from "../src/features/maps/free-lines";
import { STATIC_MAP_SIZE, imagePixel } from "../src/features/maps/static-map";
import type { LatLon } from "../src/features/maps/types";

const CENTER: LatLon = [20.63442, -103.40239];
const A: LatLon = [20.6348, -103.4031];
const B: LatLon = [20.6341, -103.4022];
const C: LatLon = [20.6347, -103.4012];

test("each click adds a vertex; a second click on the same spot (a double click) adds none; «Deshacer punto» takes the last back", () => {
  let draft: LatLon[] = [];
  draft = addDraftPoint(draft, A, 2);
  draft = addDraftPoint(draft, B, 2);
  draft = addDraftPoint(draft, [B[0] + 0.000005, B[1]], 2);
  assert.deepEqual(draft, [A, B], "half a meter away is the same vertex");
  draft = addDraftPoint(draft, C, 2);
  assert.deepEqual(draft, [A, B, C], "the line turns at each vertex");
  assert.deepEqual(undoDraftPoint(draft), [A, B]);
  assert.deepEqual(undoDraftPoint([]), []);
  const full = Array.from({ length: MAX_LINE_POINTS }, (_, i): LatLon => [20.6 + i / 1e4, -103.4]);
  assert.equal(addDraftPoint(full, [21, -103]).length, MAX_LINE_POINTS);
});

test("«Terminar trazo» adds the line with its style; with fewer than two different vertices nothing is added", () => {
  const lines = finishFreeLine([], [A, B, B, C], { color: "#0055aa", weight: 6 }, "trazo-1", 1);
  assert.deepEqual(lines, [{ id: "trazo-1", color: "#0055aa", weight: 6, points: [A, B, C] }]);
  assert.equal(finishFreeLine([], [A], DEFAULT_FREE_LINE_STYLE, "x"), null);
  assert.equal(finishFreeLine([], [A, [A[0], A[1]]], DEFAULT_FREE_LINE_STYLE, "x"), null);
  // Several lines per croquis, in the order they were drawn.
  const two = finishFreeLine(lines!, [C, A], DEFAULT_FREE_LINE_STYLE, "trazo-2")!;
  assert.deepEqual(two.map((line) => line.id), ["trazo-1", "trazo-2"]);
  const many = Array.from({ length: MAX_FREE_LINES }, (_, i): FreeLine => ({ id: `t${i}`, ...DEFAULT_FREE_LINE_STYLE, points: [A, B] }));
  assert.equal(finishFreeLine(many, [A, B], DEFAULT_FREE_LINE_STYLE, "otro"), null);
  assert.deepEqual(dedupePoints([A, A, B, A]), [A, B, A], "returning to an earlier vertex is a turn, not a duplicate");
});

test("a selected line changes color and width, its vertices move, and it can be removed", () => {
  const lines: FreeLine[] = [
    { id: "a", color: "#d35400", weight: 5, points: [A, B] },
    { id: "b", color: "#d35400", weight: 5, points: [B, C] },
  ];
  assert.deepEqual(withLineStyle(lines, "b", { color: "#1f7ac2", weight: 9 })[1], { id: "b", color: "#1f7ac2", weight: 9, points: [B, C] });
  assert.deepEqual(withLineStyle(lines, "b", { color: "#1f7ac2" })[0], lines[0], "the others stay");
  assert.deepEqual(withLinePoints(lines, "a", [A, C, B])[0].points, [A, C, B], "a vertex added in the middle of a segment");
  assert.deepEqual(withLinePoints(lines, "a", [A]), lines, "a line never drops below two vertices");
  assert.deepEqual(withoutLine(lines, "a").map((line) => line.id), ["b"]);
});

test("ids are new among the croquis' lines", () => {
  const values = [0.1, 0.1, 0.2];
  const random = () => values.shift() ?? 0.3;
  const first = newFreeLineId([], () => 0.1);
  assert.match(first, /^trazo-[0-9a-z]{6}$/);
  assert.notEqual(newFreeLineId([{ id: first }], random), first);
});

test("the lines save with the croquis settings; old settings have none and a damaged line does not lose the others", () => {
  assert.deepEqual(DEFAULT_CROQUIS_SETTINGS.lines, []);
  const { lines: _lines, ...before } = DEFAULT_CROQUIS_SETTINGS;
  assert.deepEqual(croquisSettingsSchema.parse(before).lines, [], "settings stored before 23 nov 2026");
  const good: FreeLine = { id: "trazo-1", color: "#d35400", weight: 5, points: [A, B, C] };
  const stored = { ...DEFAULT_CROQUIS_SETTINGS, lines: [good, { id: "mala", color: "rojo", weight: 5, points: [A, B] }] };
  assert.equal(croquisSettingsSchema.safeParse(stored).success, false);
  const read = readCroquisSettings(stored);
  assert.deepEqual(read.lines, [good]);
  assert.equal(read.clean, DEFAULT_CROQUIS_SETTINGS.clean, "the other settings stay");
  assert.deepEqual(readFreeLines("x"), []);
  assert.equal(freeLineSchema.safeParse({ ...good, weight: 40 }).success, false);
  assert.equal(freeLineSchema.safeParse({ ...good, points: [A] }).success, false);
  assert.equal(freeLineSchema.safeParse({ ...good, points: [[95, -103], B] }).success, false);
  // What JSON gives back is the same line.
  assert.deepEqual(readFreeLines(JSON.parse(JSON.stringify([good]))), [good]);
});

test("the image draws each line through its vertices where they fall, with its color and width at the image's scale", () => {
  const line: FreeLine = { id: "t", color: "#0055aa", weight: 6, points: [A, B, C] };
  const svg = freeLinesOverlaySvg(CENTER, 17, [line], 2);
  assert.match(svg, new RegExp(`width="${STATIC_MAP_SIZE.width * 2}" height="${STATIC_MAP_SIZE.height * 2}"`));
  const expected = [A, B, C].map((point) => imagePixel(CENTER, 17, point)).map(({ x, y }) => `${(x * 2).toFixed(1)},${(y * 2).toFixed(1)}`).join(" ");
  assert.ok(svg.includes(`points="${expected}"`), "every vertex, in order");
  assert.equal(freeLinePixels(CENTER, 17, [A, B, C], 2), expected);
  assert.match(svg, /stroke="#0055aa"/);
  assert.match(svg, /stroke-width="12\.0"/);
  assert.match(svg, /stroke-linejoin="round"/);
  // On a macro framing the same line falls closer to the center, smaller, but at the same place on the map.
  const macro = freeLinesOverlaySvg(CENTER, 14, [line], 2);
  const at = imagePixel(CENTER, 14, A);
  assert.ok(macro.includes(`${(at.x * 2).toFixed(1)},${(at.y * 2).toFixed(1)}`));
});

test("a line outside the frame is left out of the image; one that crosses it stays", () => {
  const far: FreeLine = { id: "lejos", color: "#d35400", weight: 5, points: [[20.7, -103.5], [20.71, -103.51]] };
  const crossing: FreeLine = { id: "cruza", color: "#d35400", weight: 5, points: [[20.62, -103.40239], [20.65, -103.40239]] };
  assert.equal(freeLineInFrame(CENTER, 17, far), false);
  assert.equal(freeLineInFrame(CENTER, 17, crossing), true, "both ends outside, the middle inside");
  assert.equal((freeLinesOverlaySvg(CENTER, 17, [far, crossing]).match(/<polyline/g) ?? []).length, 1);
  assert.equal(freeLinesOverlaySvg(CENTER, 17, []).includes("<polyline"), false);
});

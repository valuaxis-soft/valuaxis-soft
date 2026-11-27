/**
 * The areas of the croquis' base map from our own copy of OpenStreetMap
 * (`devpware_areas_osm`, migration 067): a park with a hole, a building, a
 * stream and a tiny pitch loaded as the import loads them come back for a
 * frame, cut to it, without what a pixel would not show; loading again
 * replaces, and a full import removes what it did not write.
 *
 * They are drawn in the open Pacific, far from any real area, so the test
 * gives the same result with the table empty (CI) or with Mexico loaded.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { polygonAreaM2, type AreaPolygon } from "../../src/features/maps/osm-areas";
import { areasInBox, deleteAreasLoadedBefore, hasStoredAreas, saveAreas } from "../../src/features/maps/server/areas-db";
import type { OsmArea } from "../../src/features/maps/server/osm-pbf-areas";
import type { LatLon } from "../../src/features/maps/types";
import { assertLocalDatabase, prisma } from "./support";

assertLocalDatabase();

const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PIN: LatLon = [6.1 + Math.floor(Math.random() * 500) / 1000, -121.3];
const METER = 1 / 111_195;
const at = (north: number, east: number): LatLon => [PIN[0] + north * METER, PIN[1] + east * METER];
const square = (north: number, east: number, half: number): LatLon[] => [at(north - half, east - half), at(north - half, east + half), at(north + half, east + half), at(north + half, east - half), at(north - half, east - half)];
const polygonArea = (id: string, kind: OsmArea["kind"], polygon: AreaPolygon): OsmArea => ({ id: `w${RUN}${id}`, kind, polygons: [polygon], lines: [], areaM2: polygonAreaM2(polygon) });

const AREAS: OsmArea[] = [
  polygonArea("1", "park", [square(0, 0, 100), square(0, 0, 20)]),
  polygonArea("2", "building", [square(200, 200, 8)]),
  polygonArea("3", "pitch", [square(-200, 0, 1)]),
  { id: `w${RUN}4`, kind: "stream", polygons: [], lines: [[at(-300, -300), at(300, 300)]], areaM2: 0 },
];
const ids = () => [...AREAS.map((area) => area.id), `w${RUN}9`];

after(async () => {
  await prisma.areaOsm.deleteMany({ where: { IdElementoOsm: { in: ids() } } });
  await prisma.$disconnect();
});

const frame: [LatLon, LatLon] = [at(-400, -400), at(400, 400)];

test("the areas of a frame come back cut to it, with their holes, without what is too small for the zoom", async () => {
  // Stamps in the past: a full import deletes everything older than its start, and the real areas of a loaded table are newer.
  const firstLoad = new Date("2001-01-01T00:00:00.000Z");
  const secondLoad = new Date("2001-06-01T00:00:00.000Z");
  const gone = polygonArea("9", "water", [square(100, -250, 30)]);
  // A ring of three points is dropped instead of refusing the batch.
  const broken: OsmArea = { ...polygonArea("8", "park", [square(0, 0, 5)]), polygons: [[[at(0, 0), at(1, 1), at(0, 0)]]] };
  assert.equal(await saveAreas([...AREAS, gone, broken], firstLoad), 5);
  assert.equal(await hasStoredAreas(), true);

  const all = await areasInBox(frame, ["park", "building", "pitch", "stream", "water"], 0.000001, 1);
  const kinds = all.map((area) => area.kind).sort();
  assert.deepEqual(kinds, ["building", "park", "pitch", "stream", "water"]);
  const park = all.find((area) => area.kind === "park")!;
  assert.equal(park.polygons[0].length, 2, "the park keeps its hole");
  assert.ok(Math.abs(park.areaM2 - 38_400) < 600, `200 × 200 m minus 40 × 40 (${park.areaM2})`);
  // Largest first, buildings last.
  assert.equal(all[all.length - 1].kind, "building");
  // At a wide zoom the tiny pitch is not even asked for, nor are buildings.
  const wide = await areasInBox(frame, ["park", "pitch", "stream", "water"], 0.00001, 20);
  assert.deepEqual(wide.map((area) => area.kind).sort(), ["park", "stream", "water"]);
  // A frame that cuts the park: only the piece inside comes.
  const half = await areasInBox([at(-400, 0), at(400, 400)], ["park"], 0.000001, 1);
  assert.ok(half[0].polygons.flat(2).every(([, lon]) => lon >= PIN[1] - 1e-6), "cut to the frame");

  await saveAreas(AREAS, secondLoad);
  assert.equal(await deleteAreasLoadedBefore(secondLoad), 1);
  assert.equal(await prisma.areaOsm.count({ where: { IdElementoOsm: { in: ids() } } }), 4);
});

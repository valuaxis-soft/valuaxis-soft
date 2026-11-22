/**
 * The streets of the croquis from our own copy of OpenStreetMap
 * (`devpware_calles_osm`, migration 061): a handful of made-up streets
 * loaded as the import loads them come back around a pin without a single
 * request to Overpass; a zone the copy has nothing for still asks Overpass;
 * loading again replaces instead of duplicating, and a full import removes
 * what it did not write.
 *
 * The streets are drawn in the open Pacific, far from any real street, so the
 * test gives the same result with the table empty (CI) or with Mexico loaded.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { OsmStreet } from "../../src/features/maps/server/osm-pbf";
import { deleteStreetsLoadedBefore, hasStoredStreets, saveStreets, streetsFromDatabase } from "../../src/features/maps/server/streets-db";
import { getStreetsAround } from "../../src/features/maps/server/streets.service";
import { distanceMeters } from "../../src/features/maps/streets";
import { assertLocalDatabase, prisma } from "./support";

assertLocalDatabase();

/** Way ids no real way has (OpenStreetMap is near 1.5e9), different on every run. */
const BASE_ID = 8_000_000_000_000 + Math.floor(Math.random() * 1_000_000) * 1000;
/** A pin in the middle of the ocean, moved a little on every run so the service's cache never answers for another run. */
const PIN: [number, number] = [5.2 + Math.floor(Math.random() * 500) / 1000, -120.3];
/** Degrees per meter at the pin, near enough. */
const METER = 1 / 111_195;

/** A street running east–west at `north` meters from the pin, from `west` to `east` meters. */
function street(offset: number, name: string, highway: string, north: number, west = -200, east = 200): OsmStreet {
  const lat = PIN[0] + north * METER;
  return { id: BASE_ID + offset, name, highway, line: [[PIN[1] + west * METER, lat], [PIN[1], lat + 2 * METER], [PIN[1] + east * METER, lat]] };
}

const STREETS = [
  street(1, "Calle Inventada", "residential", 20),
  street(2, "Avenida de la Prueba", "secondary", 300),
  street(3, "Calzada Ficticia", "trunk_link", 800),
  street(4, "Camino Lejano", "tertiary", 5000),
];
const OWN_IDS = STREETS.map((s) => BigInt(s.id)).concat(BigInt(BASE_ID + 9));

after(async () => {
  await prisma.calleOsm.deleteMany({ where: { IdViaOsm: { in: OWN_IDS } } });
  await prisma.$disconnect();
});

const noFetch = (async () => assert.fail("Overpass must not be asked: the streets are in the database")) as unknown as typeof fetch;

async function quietly<T>(run: () => Promise<T>) {
  const { warn, error, info } = console;
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.info = info;
  }
}

test("the streets loaded in the database answer around the pin, closest first, with the DTO Overpass gave, and fetch is never called", async () => {
  assert.equal(await saveStreets(STREETS, new Date()), 4);
  assert.equal(await hasStoredStreets(), true);

  const lines: string[] = [];
  const { info } = console;
  console.info = (line: string) => void lines.push(line);
  let answer;
  try {
    answer = await getStreetsAround(PIN, 1000, noFetch);
  } finally {
    console.info = info;
  }
  // 5 km away is outside the radius; the rest come closest first with the ranks of their classes.
  assert.deepEqual(answer.ways.map((way) => [way.id, way.n, way.r]), [
    [BASE_ID + 1, "Calle Inventada", 4],
    [BASE_ID + 2, "Avenida de la Prueba", 2],
    [BASE_ID + 3, "Calzada Ficticia", 1],
  ]);
  assert.equal(answer.radius, 1000);
  assert.equal(answer.attribution, "Calles: © colaboradores de OpenStreetMap (ODbL)");
  // Points as [lat, lon], where they were drawn (the copy keeps 7 decimals: about a centimeter).
  const [first] = answer.ways;
  assert.equal(first.g.length, 3);
  first.g.forEach((point, index) => assert.ok(distanceMeters(point, [STREETS[0].line[index][1], STREETS[0].line[index][0]]) < 0.05));
  assert.match(lines.join("\n"), /^\[STREETS\] source=db n=3 zone=/);

  // The radius asked is the radius searched: at 250 m only the front street, at 2 km still not the far one.
  assert.deepEqual((await streetsFromDatabase(PIN, 250)).map((way) => way.n), ["Calle Inventada"]);
  assert.equal((await streetsFromDatabase(PIN, 2000)).length, 3);
});

test("a zone the database has nothing for asks Overpass as before", async () => {
  // 30 km from the made-up streets.
  const elsewhere: [number, number] = [PIN[0] + 30_000 * METER, PIN[1] + 0.4];
  assert.deepEqual(await streetsFromDatabase(elsewhere, 1000), []);
  let asked = 0;
  const overpass = (async () => {
    asked += 1;
    return Response.json({ elements: [{ type: "way", id: 77, tags: { highway: "residential", name: "Calle de Overpass" }, geometry: [{ lat: elsewhere[0], lon: elsewhere[1] }, { lat: elsewhere[0] + 0.001, lon: elsewhere[1] }] }] });
  }) as typeof fetch;
  const answer = await quietly(() => getStreetsAround(elsewhere, 1000, overpass));
  assert.equal(asked, 1);
  assert.deepEqual(answer.ways.map((way) => way.n), ["Calle de Overpass"]);
});

test("loading again replaces the streets instead of duplicating them, and a full import deletes only what it did not write", async () => {
  // Stamps in the past: a full import deletes everything older than its start, and the real streets of a loaded table are newer than these.
  const firstLoad = new Date("2001-01-01T00:00:00.000Z");
  const secondLoad = new Date("2001-06-01T00:00:00.000Z");
  const gone = street(9, "Calle que ya no existe", "residential", 60);
  await saveStreets([...STREETS, gone], firstLoad);
  assert.equal((await streetsFromDatabase(PIN, 1000)).length, 4);

  const renamed = { ...STREETS[0], name: "Calle Renombrada", highway: "tertiary" };
  await saveStreets([renamed, ...STREETS.slice(1)], secondLoad);
  assert.equal(await deleteStreetsLoadedBefore(secondLoad), 1);

  const ways = await streetsFromDatabase(PIN, 1000);
  assert.deepEqual(ways.map((way) => [way.id, way.n, way.r]), [
    [BASE_ID + 1, "Calle Renombrada", 3],
    [BASE_ID + 2, "Avenida de la Prueba", 2],
    [BASE_ID + 3, "Calzada Ficticia", 1],
  ]);
  assert.equal(await prisma.calleOsm.count({ where: { IdViaOsm: { in: OWN_IDS } } }), 4);
});

/**
 * Video 8.5, 4:01 and 8.7, 0:39 (25 nov 2026): the streets of what the
 * generator's map shows, the classes that read at its zoom, and every piece
 * of a highlighted street crossing a frame, whatever its class and however
 * OpenStreetMap spells it, from our copy (`devpware_calles_osm`).
 *
 * Made-up streets in the open Pacific, far from any real street and from the
 * other integration tests, so the result is the same with the table empty
 * (CI) or with Mexico loaded.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { OsmStreet } from "../../src/features/maps/server/osm-pbf";
import { saveStreets, streetsInView, streetsNamedInBox } from "../../src/features/maps/server/streets-db";
import { getStreetsInView } from "../../src/features/maps/server/streets.service";
import { spellingKey } from "../../src/features/maps/street-names";
import { viewStreetHighways, viewStreetsBox, type ViewBounds } from "../../src/features/maps/streets-osm";
import { assertLocalDatabase, prisma } from "./support";

assertLocalDatabase();

const BASE_ID = 8_500_000_000_000 + Math.floor(Math.random() * 1_000_000) * 1000;
/** Moved a little on every run so the service's cache never answers for another run. */
const PIN: [number, number] = [-7.4 - Math.floor(Math.random() * 500) / 1000, -128.6];
const METER = 1 / 111_195;

/** A street running east–west at `north` meters from the pin, from `west` to `east` meters. */
function street(offset: number, name: string, highway: string, north: number, west: number, east: number): OsmStreet {
  const lat = PIN[0] + north * METER;
  return { id: BASE_ID + offset, name, highway, line: [[PIN[1] + west * METER, lat], [PIN[1] + east * METER, lat]] };
}

const STREETS = [
  // One avenue in three pieces of three classes, the far one spelled without accents.
  street(1, "Prolongación Avenida Inventada", "tertiary", 300, -900, 900),
  street(2, "Prolongación Avenida Inventada", "secondary", 300, 900, 2500),
  street(3, "Prolongacion Avenida Inventada", "residential", 300, 2500, 4000),
  street(4, "Calle Residencial de Prueba", "residential", -200, -300, 300),
  street(5, "Lateral de Avenida Lejana Sur", "tertiary", -3000, 4000, 6000),
];
const OWN_IDS = STREETS.map((item) => BigInt(item.id));

after(async () => {
  await prisma.calleOsm.deleteMany({ where: { IdViaOsm: { in: OWN_IDS } } });
  await prisma.$disconnect();
});

const box = (south: number, west: number, north: number, east: number): ViewBounds => [
  [PIN[0] + south * METER, PIN[1] + west * METER],
  [PIN[0] + north * METER, PIN[1] + east * METER],
];
const ownWays = <T extends { id?: number }>(ways: readonly T[]) => ways.filter((way) => way.id !== undefined && way.id >= BASE_ID && way.id < BASE_ID + 1000);

test("the view loads the classes that read at its zoom, and a highlighted avenue comes whole, every class and spelling", async () => {
  await saveStreets(STREETS, new Date());
  const view = box(-4000, -2000, 2000, 7000);

  // Zoom 13–15: down to tertiary, no residential street.
  const macro = ownWays(await streetsInView(view, viewStreetHighways(14), 0));
  assert.deepEqual(macro.map((way) => way.id! - BASE_ID).sort(), [1, 2, 5]);
  // Zoom 16 and closer: every street.
  const close = ownWays(await streetsInView(view, viewStreetHighways(16), 0));
  assert.deepEqual(close.map((way) => way.id! - BASE_ID).sort(), [1, 2, 3, 4, 5]);

  // The highlighted avenue by the key of its spelling: its three pieces, the residential one too, under one spelling.
  const named = ownWays(await streetsNamedInBox(view, [spellingKey("Prolongación Avenida Inventada")]));
  assert.deepEqual(named.map((way) => way.id! - BASE_ID).sort(), [1, 2, 3]);
  // Outside the box, nothing.
  assert.deepEqual(ownWays(await streetsNamedInBox(box(5000, 5000, 6000, 6000), [spellingKey("Prolongación Avenida Inventada")])), []);

  // Through the service, as the generator asks: the classes of zoom 12 (main roads) plus the highlighted avenue whole.
  const answer = await getStreetsInView(viewStreetsBox(view), 12, ["Prolongación Avenida Inventada"]);
  const mine = ownWays(answer.ways);
  assert.deepEqual(mine.map((way) => way.id! - BASE_ID).sort(), [1, 2, 3]);
  assert.ok(mine.every((way) => way.n === "Prolongación Avenida Inventada"), "one spelling, the accented one");
});

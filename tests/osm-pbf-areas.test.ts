/**
 * The reader of the areas of an OpenStreetMap extract (.osm.pbf) behind
 * `pnpm areas:import`: a small file written here, block by block as the
 * format says, comes back as the parks, buildings, waterways and
 * multipolygons the croquis' base map paints. No network and no database.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { readOsmAreas, type OsmArea } from "../src/features/maps/server/osm-pbf-areas";

function varint(value: number) {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 128) {
    bytes.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}
const zigzag = (value: number) => varint(value >= 0 ? value * 2 : -value * 2 - 1);
const field = (number: number, wire: number) => varint(number * 8 + wire);
const bytesField = (number: number, content: Buffer) => Buffer.concat([field(number, 2), varint(content.length), content]);
const varintField = (number: number, value: number) => Buffer.concat([field(number, 0), varint(value)]);
const deltas = (values: number[]) => Buffer.concat(values.map((value, index) => zigzag(value - (index ? values[index - 1] : 0))));

function blob(type: string, data: Buffer) {
  const body = Buffer.concat([varintField(2, data.length), bytesField(3, deflateSync(data))]);
  const header = Buffer.concat([bytesField(1, Buffer.from(type)), varintField(3, body.length)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, body]);
}

function primitiveBlock(strings: string[], group: Buffer) {
  const table = Buffer.concat(["", ...strings].map((text) => bytesField(1, Buffer.from(text, "utf8"))));
  return blob("OSMData", Buffer.concat([bytesField(1, table), bytesField(2, group)]));
}

function nodesBlock(nodes: [number, number, number][]) {
  const dense = Buffer.concat([
    bytesField(1, deltas(nodes.map(([id]) => id))),
    bytesField(8, deltas(nodes.map(([, lat]) => Math.round(lat * 1e7)))),
    bytesField(9, deltas(nodes.map(([, , lon]) => Math.round(lon * 1e7)))),
  ]);
  return primitiveBlock([], bytesField(2, dense));
}

function waysBlock(ways: { id: number; tags: Record<string, string>; refs: number[] }[]) {
  const strings = [...new Set(ways.flatMap((way) => Object.entries(way.tags).flat()))];
  const at = (text: string) => varint(strings.indexOf(text) + 1);
  const group = Buffer.concat(
    ways.map((way) =>
      bytesField(
        3,
        Buffer.concat([
          varintField(1, way.id),
          bytesField(2, Buffer.concat(Object.keys(way.tags).map(at))),
          bytesField(3, Buffer.concat(Object.values(way.tags).map(at))),
          bytesField(8, deltas(way.refs)),
        ]),
      ),
    ),
  );
  return primitiveBlock(strings, group);
}

function relationsBlock(relations: { id: number; tags: Record<string, string>; members: { way: number; role: string }[] }[]) {
  const strings = [...new Set(relations.flatMap((relation) => [...Object.entries(relation.tags).flat(), ...relation.members.map((member) => member.role)]))];
  const at = (text: string) => varint(strings.indexOf(text) + 1);
  const group = Buffer.concat(
    relations.map((relation) =>
      bytesField(
        4,
        Buffer.concat([
          varintField(1, relation.id),
          bytesField(2, Buffer.concat(Object.keys(relation.tags).map(at))),
          bytesField(3, Buffer.concat(Object.values(relation.tags).map(at))),
          bytesField(8, Buffer.concat(relation.members.map((member) => at(member.role)))),
          bytesField(9, deltas(relation.members.map((member) => member.way))),
          // Every member is a way (type 1).
          bytesField(10, Buffer.concat(relation.members.map(() => varint(1)))),
        ]),
      ),
    ),
  );
  return primitiveBlock(strings, group);
}

/**
 * A made-up neighborhood: a square park (a closed way), a building, a
 * stream (a line), a lake as a multipolygon of two half outlines with an
 * island, a fence with no area tag, a multipolygon whose outline never
 * closes and a bus route.
 */
const FILE = Buffer.concat([
  blob("OSMHeader", bytesField(4, Buffer.from("OsmSchema-V0.6"))),
  nodesBlock([
    [1, 20.7, -102.35],
    [2, 20.7, -102.349],
    [3, 20.701, -102.349],
    [4, 20.701, -102.35],
    [11, 20.71, -102.36],
    [12, 20.71, -102.35],
    [13, 20.72, -102.35],
    [14, 20.72, -102.36],
    [21, 20.714, -102.356],
    [22, 20.714, -102.354],
    [23, 20.716, -102.354],
    [24, 20.716, -102.356],
    [31, 19.4, -99.15],
    [32, 19.401, -99.15],
  ]),
  waysBlock([
    { id: 7001, tags: { leisure: "park", name: "Parque Inventado" }, refs: [1, 2, 3, 4, 1] },
    { id: 7002, tags: { building: "yes" }, refs: [1, 2, 3, 1] },
    { id: 7003, tags: { waterway: "stream", name: "Arroyo Ficticio" }, refs: [4, 3, 13] },
    { id: 7004, tags: {}, refs: [11, 12, 13] },
    { id: 7005, tags: {}, refs: [13, 14, 11] },
    { id: 7006, tags: {}, refs: [21, 22, 23, 24, 21] },
    { id: 7007, tags: { barrier: "fence" }, refs: [1, 2, 3, 4, 1] },
    { id: 7008, tags: {}, refs: [31, 32] },
  ]),
  relationsBlock([
    {
      id: 8001,
      tags: { type: "multipolygon", natural: "water", name: "Lago Ficticio" },
      members: [
        { way: 7004, role: "outer" },
        { way: 7005, role: "outer" },
        { way: 7006, role: "inner" },
      ],
    },
    { id: 8002, tags: { type: "multipolygon", landuse: "forest" }, members: [{ way: 7008, role: "outer" }] },
    { id: 8003, tags: { type: "route", route: "bus" }, members: [{ way: 7004, role: "" }] },
  ]),
]);

async function areasOf(file: Buffer, options: Parameters<typeof readOsmAreas>[2] = {}) {
  const dir = await mkdtemp(join(tmpdir(), "osm-pbf-areas-test-"));
  try {
    const path = join(dir, "inventado.osm.pbf");
    await writeFile(path, file);
    const areas: OsmArea[] = [];
    const summary = await readOsmAreas(path, async (batch) => void areas.push(...batch), options);
    return { summary, areas };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("closed ways become areas by their tags, waterways lines, multipolygons rings with their holes; open outlines and other relations are left out", async () => {
  const { summary, areas } = await areasOf(FILE);
  assert.deepEqual(
    areas.map((area) => [area.id, area.kind]),
    [
      ["w7001", "park"],
      ["w7002", "building"],
      ["w7003", "stream"],
      ["r8001", "water"],
    ],
  );
  assert.deepEqual(areas[0].polygons, [
    [
      [
        [20.7, -102.35],
        [20.7, -102.349],
        [20.701, -102.349],
        [20.701, -102.35],
        [20.7, -102.35],
      ],
    ],
  ]);
  assert.ok(areas[0].areaM2 > 10_000 && areas[0].areaM2 < 12_500, `about 104 × 111 m (${areas[0].areaM2})`);
  assert.deepEqual(areas[2].lines, [
    [
      [20.701, -102.35],
      [20.701, -102.349],
      [20.72, -102.35],
    ],
  ]);
  // The lake: its two halves joined into one ring, the island as its hole.
  const lake = areas[3];
  assert.equal(lake.polygons.length, 1);
  assert.equal(lake.polygons[0].length, 2, "outer ring and one hole");
  assert.equal(lake.polygons[0][0].length, 5);
  assert.deepEqual(lake.polygons[0][1][0], [20.714, -102.356]);
  assert.ok(lake.areaM2 < areas[0].areaM2 * 200, "the hole is taken off");
  assert.deepEqual(summary, { ways: 3, relations: 2, nodes: 14, areas: 4 });
});

test("without buildings and inside a box, as the import's options ask", async () => {
  assert.deepEqual((await areasOf(FILE, { buildings: false })).areas.map((area) => area.id), ["w7001", "w7003", "r8001"]);
  assert.deepEqual((await areasOf(FILE, { bbox: [-102.355, 20.69, -102.34, 20.705] })).areas.map((area) => area.id), ["w7001", "w7002", "w7003"]);
});

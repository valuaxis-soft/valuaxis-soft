/**
 * The reader of OpenStreetMap extracts (.osm.pbf) behind `pnpm streets:import`:
 * a small file written here, block by block as the format says, comes back
 * as the named streets with their points. No network and no database.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { readOsmStreets, type OsmStreet } from "../src/features/maps/server/osm-pbf";

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
/** Delta-encoded signed numbers, as ids, coordinates and node references are stored. */
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

/** Nodes as [id, lat, lon] in a dense group; coordinates in units of 1e-7 degrees (granularity 100). */
function nodesBlock(nodes: [number, number, number][]) {
  const dense = Buffer.concat([
    bytesField(1, deltas(nodes.map(([id]) => id))),
    // The version of each node (DenseInfo): present in real files, never read.
    bytesField(5, bytesField(1, Buffer.concat(nodes.map(() => varint(1))))),
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
          // Info (version, timestamp): skipped by the reader.
          bytesField(4, Buffer.concat([varintField(1, 3), varintField(2, 1_700_000_000)])),
          bytesField(8, deltas(way.refs)),
        ]),
      ),
    ),
  );
  return primitiveBlock(strings, group);
}

/** A made-up corner: two streets that share node 9_000_000_002 (an id above 2^32, as today's are), a footpath, an unnamed street and a far avenue. */
const FILE = Buffer.concat([
  blob("OSMHeader", bytesField(4, Buffer.from("OsmSchema-V0.6"))),
  nodesBlock([
    [101, 20.7, -102.35],
    [102, 20.7005, -102.35],
    [9_000_000_001, 20.701, -102.351],
    [9_000_000_002, 20.701, -102.35],
    [9_000_000_003, 20.701, -102.349],
    [9_000_000_050, 19.4, -99.15],
    [9_000_000_051, 19.401, -99.15],
  ]),
  waysBlock([
    { id: 5001, tags: { highway: "residential", name: "Calle Inventada", surface: "paved" }, refs: [9_000_000_001, 9_000_000_002, 9_000_000_003] },
    { id: 5002, tags: { name: "Avenida Ñandú Ficticia", highway: "primary_link" }, refs: [101, 102, 9_000_000_002] },
    { id: 5003, tags: { highway: "footway", name: "Andador" }, refs: [101, 102] },
    { id: 5004, tags: { highway: "residential" }, refs: [101, 102] },
    { id: 5005, tags: { building: "yes", name: "Mercado" }, refs: [101, 102, 9_000_000_001, 101] },
    { id: 5006, tags: { highway: "trunk", name: "Calzada Lejana" }, refs: [9_000_000_050, 9_000_000_051] },
    // One of its nodes is not in the extract (the street leaves the country): it keeps the ones it has.
    { id: 5007, tags: { highway: "tertiary", name: "Camino Cortado" }, refs: [9_000_000_003, 9_000_000_999, 101] },
  ]),
]);

async function streetsOf(file: Buffer, options: Parameters<typeof readOsmStreets>[2] = {}) {
  const dir = await mkdtemp(join(tmpdir(), "osm-pbf-test-"));
  try {
    const path = join(dir, "inventado.osm.pbf");
    await writeFile(path, file);
    const batches: OsmStreet[][] = [];
    const summary = await readOsmStreets(path, async (batch) => void batches.push(batch), options);
    return { summary, batches, streets: batches.flat() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("an .osm.pbf extract becomes the named streets of the croquis classes, each with its points in order", async () => {
  const { summary, streets } = await streetsOf(FILE);
  assert.deepEqual(
    streets.map((street) => [street.id, street.name, street.highway]),
    [
      [5001, "Calle Inventada", "residential"],
      [5002, "Avenida Ñandú Ficticia", "primary_link"],
      [5006, "Calzada Lejana", "trunk"],
      [5007, "Camino Cortado", "tertiary"],
    ],
  );
  // [lon, lat], in the order of the way; the shared corner is the same point in both streets.
  assert.deepEqual(streets[0].line, [[-102.351, 20.701], [-102.35, 20.701], [-102.349, 20.701]]);
  assert.deepEqual(streets[1].line, [[-102.35, 20.7], [-102.35, 20.7005], [-102.35, 20.701]]);
  assert.deepEqual(streets[3].line, [[-102.349, 20.701], [-102.35, 20.7]]);
  assert.deepEqual(summary, { ways: 4, nodes: 8, streets: 4 });
});

test("--bbox keeps the streets with a point inside the box, and the batches are handed over at the size asked", async () => {
  const arandas = await streetsOf(FILE, { bbox: [-102.4, 20.65, -102.28, 20.76] });
  assert.deepEqual(arandas.streets.map((street) => street.id), [5001, 5002, 5007]);
  assert.equal(arandas.summary.streets, 3);
  const batched = await streetsOf(FILE, { batchSize: 3 });
  assert.deepEqual(batched.batches.map((batch) => batch.length), [3, 1]);
});

test("a file cut short (an interrupted download) is an error, not a partial load", async () => {
  await assert.rejects(streetsOf(FILE.subarray(0, FILE.length - 20)), /incomplete download/);
});

/**
 * The named streets of an OpenStreetMap extract in PBF format (the files
 * Geofabrik publishes), read with what Node already has: the format is
 * protocol buffers inside zlib blocks, and only the few fields the streets
 * need are decoded (https://wiki.openstreetmap.org/wiki/PBF_Format).
 *
 * The file is read three times, one block at a time, so memory does not grow
 * with the file: (1) the ways, to learn which nodes the streets use; (2) the
 * nodes, to keep the coordinates of those; (3) the ways again, now as lines.
 * What stays in memory is 16 bytes per node used by a street.
 */
import { open, type FileHandle } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { highwayRank } from "../streets-osm";

/** A named street as it goes into the table: the way's id, name, `highway` class and its points as [lon, lat]. */
export interface OsmStreet {
  id: number;
  name: string;
  highway: string;
  line: [number, number][];
}

/** west, south, east, north in degrees: the order Geofabrik and osmium use. */
export type OsmBbox = readonly [west: number, south: number, east: number, north: number];

export interface OsmStreetsProgress {
  /** "ways" (first reading), "nodes" (second) or "streets" (third). */
  phase: "ways" | "nodes" | "streets";
  /** Blocks read in this phase and how many it has. */
  done: number;
  total: number;
}

export interface ReadOsmStreetsOptions {
  /** Only the streets with a point inside the box. */
  bbox?: OsmBbox | null;
  /** Streets handed over at a time. */
  batchSize?: number;
  onProgress?: (progress: OsmStreetsProgress) => void;
}

export interface OsmStreetsSummary {
  /** Named streets of the accepted classes in the file. */
  ways: number;
  /** Nodes they use. */
  nodes: number;
  /** Streets handed over (after the box). */
  streets: number;
}

/** Coordinates are kept as integers of 1e-7 degrees, the precision of OpenStreetMap. */
export const DEGREE = 1e7;
const MAX_BLOB_HEADER = 64 * 1024;
const MAX_BLOB = 64 * 1024 * 1024;
export const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
export const WIRE_BYTES = 2;
const WIRE_FIXED32 = 5;

/** A cursor over protocol buffers bytes. Numbers stay exact up to 2^53, far above any OpenStreetMap id. */
export class ProtoReader {
  pos: number;
  readonly end: number;

  constructor(
    readonly buf: Buffer,
    start = 0,
    end = buf.length,
  ) {
    this.pos = start;
    this.end = end;
  }

  get more() {
    return this.pos < this.end;
  }

  varint() {
    let result = 0;
    let scale = 1;
    for (;;) {
      const byte = this.buf[this.pos++];
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
  }

  /** A zigzag-encoded signed number (sint32, sint64). */
  signed() {
    const value = this.varint();
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
  }

  /** The next field as [number, wire type]. */
  tag(): [number, number] {
    const key = this.varint();
    return [Math.floor(key / 8), key % 8];
  }

  /** A reader over the length-delimited field that starts here; the cursor moves past it. */
  sub() {
    const length = this.varint();
    const reader = new ProtoReader(this.buf, this.pos, this.pos + length);
    this.pos += length;
    return reader;
  }

  bytes() {
    const length = this.varint();
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  skip(wire: number) {
    if (wire === WIRE_VARINT) this.varint();
    else if (wire === WIRE_FIXED64) this.pos += 8;
    else if (wire === WIRE_BYTES) {
      // Not `this.pos += this.varint()`: the left side would be read before the length's own bytes are passed.
      const length = this.varint();
      this.pos += length;
    }
    else if (wire === WIRE_FIXED32) this.pos += 4;
    else throw new Error(`Unsupported protocol buffers wire type ${wire}`);
  }
}

export interface BlockEntry {
  /** Where the blob (after its header) starts in the file, and its size. */
  offset: number;
  size: number;
  hasNodes: boolean;
  hasWays: boolean;
}

export interface PrimitiveBlock {
  strings: Buffer[];
  groups: ProtoReader[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
}

async function readExactly(file: FileHandle, offset: number, length: number) {
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await file.read(buffer, 0, length, offset);
  if (bytesRead !== length) throw new Error("The .osm.pbf file ends in the middle of a block (incomplete download?).");
  return buffer;
}

/** The blobs of the file, in order: their type ("OSMHeader", "OSMData") and where their bytes are. */
export async function* blobs(file: FileHandle) {
  const { size } = await file.stat();
  let offset = 0;
  while (offset < size) {
    const headerLength = (await readExactly(file, offset, 4)).readUInt32BE(0);
    if (headerLength > MAX_BLOB_HEADER) throw new Error("This does not look like an .osm.pbf file.");
    const header = new ProtoReader(await readExactly(file, offset + 4, headerLength));
    let type = "";
    let dataSize = 0;
    while (header.more) {
      const [field, wire] = header.tag();
      if (field === 1 && wire === WIRE_BYTES) type = header.bytes().toString("utf8");
      else if (field === 3 && wire === WIRE_VARINT) dataSize = header.varint();
      else header.skip(wire);
    }
    if (dataSize > MAX_BLOB) throw new Error("This does not look like an .osm.pbf file.");
    const start = offset + 4 + headerLength;
    yield { type, offset: start, size: dataSize };
    offset = start + dataSize;
  }
}

/** The bytes of a blob, inflated. Geofabrik writes zlib; the other compressions of the format are not read. */
export async function blobData(file: FileHandle, entry: Pick<BlockEntry, "offset" | "size">) {
  const blob = new ProtoReader(await readExactly(file, entry.offset, entry.size));
  while (blob.more) {
    const [field, wire] = blob.tag();
    if (field === 1 && wire === WIRE_BYTES) return blob.bytes();
    if (field === 3 && wire === WIRE_BYTES) return inflateSync(blob.bytes());
    if (wire === WIRE_BYTES && field >= 4 && field <= 7) throw new Error("The .osm.pbf file uses a compression other than zlib; convert it with osmium first.");
    blob.skip(wire);
  }
  throw new Error("An .osm.pbf block has no data.");
}

export function primitiveBlock(data: Buffer): PrimitiveBlock {
  const block: PrimitiveBlock = { strings: [], groups: [], granularity: 100, latOffset: 0, lonOffset: 0 };
  const reader = new ProtoReader(data);
  while (reader.more) {
    const [field, wire] = reader.tag();
    if (field === 1 && wire === WIRE_BYTES) {
      const table = reader.sub();
      while (table.more) {
        const [tableField, tableWire] = table.tag();
        if (tableField === 1 && tableWire === WIRE_BYTES) block.strings.push(table.bytes());
        else table.skip(tableWire);
      }
    } else if (field === 2 && wire === WIRE_BYTES) block.groups.push(reader.sub());
    else if (field === 17 && wire === WIRE_VARINT) block.granularity = reader.varint();
    else if (field === 19 && wire === WIRE_VARINT) block.latOffset = reader.varint();
    else if (field === 20 && wire === WIRE_VARINT) block.lonOffset = reader.varint();
    else reader.skip(wire);
  }
  return block;
}

/** The fields of a group (1 nodes, 2 dense nodes, 3 ways…), each as a reader. */
export function* groupFields(group: ProtoReader) {
  const reader = new ProtoReader(group.buf, group.pos, group.end);
  while (reader.more) {
    const [field, wire] = reader.tag();
    if (wire === WIRE_BYTES) yield [field, reader.sub()] as const;
    else reader.skip(wire);
  }
}

interface RawWay {
  id: number;
  name: Buffer;
  highway: Buffer;
  /** The packed, delta-encoded node ids. */
  refs: ProtoReader;
}

/** The ways of a block that are named streets of the classes the croquis draws; the rest are skipped without decoding. */
function* streetWays(block: PrimitiveBlock): Generator<RawWay> {
  const nameKey = block.strings.findIndex((s) => s.length === 4 && s.toString("latin1") === "name");
  const highwayKey = block.strings.findIndex((s) => s.length === 7 && s.toString("latin1") === "highway");
  if (nameKey < 0 || highwayKey < 0) return;
  const accepted = block.strings.map((s) => s.length <= 40 && highwayRank(s.toString("latin1")) !== null);
  for (const group of block.groups) {
    for (const [field, way] of groupFields(group)) {
      if (field !== 3) continue;
      let id = 0;
      let keys: ProtoReader | null = null;
      let values: ProtoReader | null = null;
      let refs: ProtoReader | null = null;
      while (way.more) {
        const [wayField, wire] = way.tag();
        if (wayField === 1 && wire === WIRE_VARINT) id = way.varint();
        else if (wayField === 2 && wire === WIRE_BYTES) keys = way.sub();
        else if (wayField === 3 && wire === WIRE_BYTES) values = way.sub();
        else if (wayField === 8 && wire === WIRE_BYTES) refs = way.sub();
        else way.skip(wire);
      }
      if (!keys || !values || !refs) continue;
      let name: Buffer | null = null;
      let highway: Buffer | null = null;
      while (keys.more && values.more) {
        const key = keys.varint();
        const value = values.varint();
        if (key === nameKey) name = block.strings[value] ?? null;
        else if (key === highwayKey && accepted[value]) highway = block.strings[value];
      }
      if (name?.length && highway) yield { id, name, highway, refs };
    }
  }
}

/** Node ids kept in pieces as they come; one sorted array without repeats once every way was read. */
export class NodeIds {
  private static readonly PIECE = 1 << 20;
  private pieces: Float64Array[] = [];
  private current = new Float64Array(NodeIds.PIECE);
  private used = 0;

  push(id: number) {
    if (this.used === NodeIds.PIECE) {
      this.pieces.push(this.current);
      this.current = new Float64Array(NodeIds.PIECE);
      this.used = 0;
    }
    this.current[this.used++] = id;
  }

  /** Sorts, drops the repeats (a corner belongs to two streets) and returns the ids. */
  seal() {
    const all = new Float64Array(this.pieces.length * NodeIds.PIECE + this.used);
    all.set(this.current.subarray(0, this.used), this.pieces.length * NodeIds.PIECE);
    // Each piece is released as it is copied, so the ids are never held twice.
    while (this.pieces.length) all.set(this.pieces.pop() as Float64Array, this.pieces.length * NodeIds.PIECE);
    this.current = new Float64Array(0);
    all.sort();
    let unique = 0;
    for (let index = 0; index < all.length; index += 1) {
      if (index === 0 || all[index] !== all[index - 1]) all[unique++] = all[index];
    }
    return all.subarray(0, unique);
  }
}

export function indexOfId(ids: Float64Array, id: number) {
  let low = 0;
  let high = ids.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = ids[middle];
    if (value === id) return middle;
    if (value < id) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

/** Latitude or longitude of a node as an integer of 1e-7 degrees. */
export function coordinate(raw: number, offset: number, granularity: number) {
  return Math.round((offset + granularity * raw) / 100);
}

/** The coordinates of the wanted nodes (sorted ids), as integers of 1e-7 degrees, and which of them the file has. */
export async function readNodeCoordinates(file: FileHandle, index: readonly BlockEntry[], nodeIds: Float64Array, onBlock?: (done: number, total: number) => void) {
  const latitudes = new Int32Array(nodeIds.length);
  const longitudes = new Int32Array(nodeIds.length);
  const found = new Uint8Array(nodeIds.length);
  const nodeBlocks = index.filter((entry) => entry.hasNodes);
  let remaining = nodeIds.length;
  for (let done = 0; done < nodeBlocks.length && remaining > 0; done += 1) {
    const block = primitiveBlock(await blobData(file, nodeBlocks[done]));
    const keep = (id: number, lat: number, lon: number) => {
      const at = indexOfId(nodeIds, id);
      if (at < 0) return;
      if (!found[at]) remaining -= 1;
      found[at] = 1;
      latitudes[at] = coordinate(lat, block.latOffset, block.granularity);
      longitudes[at] = coordinate(lon, block.lonOffset, block.granularity);
    };
    for (const group of block.groups) {
      for (const [field, nodes] of groupFields(group)) {
        if (field === 2) {
          let ids: ProtoReader | null = null;
          let lats: ProtoReader | null = null;
          let lons: ProtoReader | null = null;
          while (nodes.more) {
            const [denseField, wire] = nodes.tag();
            if (denseField === 1 && wire === WIRE_BYTES) ids = nodes.sub();
            else if (denseField === 8 && wire === WIRE_BYTES) lats = nodes.sub();
            else if (denseField === 9 && wire === WIRE_BYTES) lons = nodes.sub();
            else nodes.skip(wire);
          }
          if (!ids || !lats || !lons) continue;
          let id = 0;
          let lat = 0;
          let lon = 0;
          while (ids.more) {
            id += ids.signed();
            lat += lats.signed();
            lon += lons.signed();
            // The ids of a block grow; most blocks hold no wanted node and are passed over quickly.
            if (id >= nodeIds[0] && id <= nodeIds[nodeIds.length - 1]) keep(id, lat, lon);
          }
        } else if (field === 1) {
          let id = 0;
          let lat = 0;
          let lon = 0;
          while (nodes.more) {
            const [nodeField, wire] = nodes.tag();
            if (nodeField === 1 && wire === WIRE_VARINT) id = nodes.signed();
            else if (nodeField === 8 && wire === WIRE_VARINT) lat = nodes.signed();
            else if (nodeField === 9 && wire === WIRE_VARINT) lon = nodes.signed();
            else nodes.skip(wire);
          }
          keep(id, lat, lon);
        }
      }
    }
    onBlock?.(done + 1, nodeBlocks.length);
  }
  return { latitudes, longitudes, found };
}

/**
 * Hands over, in batches, the named streets of the file (motorways to
 * residential and pedestrian streets, the same classes the Overpass query
 * asks for) and answers how many there were. `onBatch` may take its time:
 * the reading waits for it.
 */
export async function readOsmStreets(path: string, onBatch: (streets: OsmStreet[]) => Promise<void>, options: ReadOsmStreetsOptions = {}): Promise<OsmStreetsSummary> {
  const batchSize = options.batchSize ?? 2000;
  const bbox = options.bbox ?? null;
  const file = await open(path, "r");
  try {
    // 1. The ways: which nodes do the streets use? The index remembers what each block holds for the next readings.
    const index: BlockEntry[] = [];
    const wanted = new NodeIds();
    let ways = 0;
    const { size: fileSize } = await file.stat();
    for await (const blob of blobs(file)) {
      if (blob.type !== "OSMData") continue;
      const block = primitiveBlock(await blobData(file, blob));
      const entry: BlockEntry = { offset: blob.offset, size: blob.size, hasNodes: false, hasWays: false };
      for (const group of block.groups) {
        for (const [field] of groupFields(group)) {
          if (field === 1 || field === 2) entry.hasNodes = true;
          else if (field === 3) entry.hasWays = true;
        }
      }
      if (entry.hasWays) {
        for (const way of streetWays(block)) {
          ways += 1;
          let ref = 0;
          while (way.refs.more) {
            ref += way.refs.signed();
            wanted.push(ref);
          }
        }
      }
      index.push(entry);
      options.onProgress?.({ phase: "ways", done: blob.offset + blob.size, total: fileSize });
    }
    const nodeIds = wanted.seal();
    // 2. The nodes: the coordinates of those, and nothing else.
    const { latitudes, longitudes, found } = await readNodeCoordinates(file, index, nodeIds, (done, total) => options.onProgress?.({ phase: "nodes", done, total }));

    // 3. The ways again, now with their points.
    const wayBlocks = index.filter((entry) => entry.hasWays);
    let streets = 0;
    let batch: OsmStreet[] = [];
    for (let done = 0; done < wayBlocks.length; done += 1) {
      const block = primitiveBlock(await blobData(file, wayBlocks[done]));
      for (const way of streetWays(block)) {
        const line: [number, number][] = [];
        let inside = !bbox;
        let ref = 0;
        while (way.refs.more) {
          ref += way.refs.signed();
          const at = indexOfId(nodeIds, ref);
          // A node outside the extract: the street continues with the ones it has.
          if (at < 0 || !found[at]) continue;
          const lon = longitudes[at] / DEGREE;
          const lat = latitudes[at] / DEGREE;
          if (bbox && !inside && lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) inside = true;
          line.push([lon, lat]);
        }
        if (line.length < 2 || !inside) continue;
        const name = way.name.toString("utf8").trim();
        if (!name) continue;
        batch.push({ id: way.id, name, highway: way.highway.toString("utf8"), line });
        if (batch.length >= batchSize) {
          streets += batch.length;
          await onBatch(batch);
          batch = [];
        }
      }
      options.onProgress?.({ phase: "streets", done: done + 1, total: wayBlocks.length });
    }
    if (batch.length) {
      streets += batch.length;
      await onBatch(batch);
    }
    return { ways, nodes: nodeIds.length, streets };
  } finally {
    await file.close();
  }
}

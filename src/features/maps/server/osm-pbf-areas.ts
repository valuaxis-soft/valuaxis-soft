/**
 * The areas of an OpenStreetMap extract (.osm.pbf) the croquis' base map
 * paints under its streets (osm-areas.ts): parks, gardens, water, land uses,
 * grounds of schools and hospitals, buildings, and the rivers and streams as
 * lines. A sibling of the streets' reader (osm-pbf.ts), with its decoding.
 *
 * The file is read four times, a block at a time, so memory does not grow
 * with the file: (1) every block, to index it and keep the multipolygon
 * relations of an area kind (their tags and members only) and the nodes of
 * the tagged ways; (2) the ways, for the nodes of the relations' member
 * ways, whose node lists are kept; (3) the nodes, for the coordinates of
 * all of those; (4) the ways again, handed over as areas, and then the
 * relations, their rings put together from the member ways. What stays in
 * memory is 16 bytes per node used, plus the member ways' node lists.
 */
import { open } from "node:fs/promises";

import { AREA_TAG_KEYS, areaKind, isLineKind, multipolygon, polygonAreaM2, relationAreaKind, type AreaKind, type AreaPolygon } from "../osm-areas";
import type { LatLon } from "../types";
import {
  DEGREE,
  NodeIds,
  WIRE_BYTES,
  WIRE_VARINT,
  blobData,
  blobs,
  groupFields,
  indexOfId,
  primitiveBlock,
  readNodeCoordinates,
  type BlockEntry,
  type OsmBbox,
  type PrimitiveBlock,
  type ProtoReader,
} from "./osm-pbf";

/** An area as it goes into the table: `w<id>` or `r<id>`, its kind, its polygons (or lines, for a waterway) in [lat, lon], and its size. */
export interface OsmArea {
  id: string;
  kind: AreaKind;
  polygons: AreaPolygon[];
  lines: LatLon[][];
  areaM2: number;
}

export interface OsmAreasProgress {
  phase: "index" | "members" | "nodes" | "areas";
  done: number;
  total: number;
}

export interface ReadOsmAreasOptions {
  /** Only the areas with a point inside the box. */
  bbox?: OsmBbox | null;
  /** Buildings too (the most numerous by far); on by default. */
  buildings?: boolean;
  /** Areas handed over at a time. */
  batchSize?: number;
  onProgress?: (progress: OsmAreasProgress) => void;
}

export interface OsmAreasSummary {
  /** Tagged ways of an area kind in the file. */
  ways: number;
  /** Multipolygon relations of an area kind. */
  relations: number;
  /** Nodes they use. */
  nodes: number;
  /** Areas handed over (after the box; open outlines left out). */
  areas: number;
}

type TagKey = (typeof AREA_TAG_KEYS)[number];
type Tags = Partial<Record<TagKey, string>>;

/** The indexes in a block's string table of the keys an area is read from. */
function tagKeys(block: PrimitiveBlock) {
  const keys = new Map<number, TagKey>();
  const wanted = new Set<string>(AREA_TAG_KEYS);
  block.strings.forEach((text, index) => {
    if (text.length > 8) return;
    const key = text.toString("latin1");
    if (wanted.has(key)) keys.set(index, key as TagKey);
  });
  return keys;
}

/** The area tags of an element, from its packed keys and values; null when it has none of the keys. */
function readTags(block: PrimitiveBlock, keyIndexes: Map<number, TagKey>, keys: ProtoReader, values: ProtoReader): Tags | null {
  let tags: Tags | null = null;
  while (keys.more && values.more) {
    const key = keys.varint();
    const value = values.varint();
    const name = keyIndexes.get(key);
    if (!name) continue;
    tags ??= {};
    tags[name] = block.strings[value]?.toString("utf8") ?? "";
  }
  return tags;
}

interface RawWay {
  id: number;
  tags: Tags | null;
  /** Node ids, decoded. */
  refs: number[];
}

/**
 * The ways of a block with their area tags (null when they have none) and
 * their node ids; `wanted`, when given, picks by id before anything else is
 * decoded; without it the ways with no area tag are skipped.
 */
function* blockWays(block: PrimitiveBlock, keyIndexes: Map<number, TagKey>, wanted?: (id: number) => boolean): Generator<RawWay> {
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
      if (!refs || (wanted && !wanted(id))) continue;
      const tags = keys && values && keyIndexes.size ? readTags(block, keyIndexes, keys, values) : null;
      // Only the ways with area tags matter unless they were picked by id.
      if (!wanted && !tags) continue;
      const ids: number[] = [];
      let ref = 0;
      while (refs.more) {
        ref += refs.signed();
        ids.push(ref);
      }
      yield { id, tags, refs: ids };
    }
  }
}

/** The kind a tagged way draws as, or null; buildings only when asked for. */
function wayKind(way: RawWay, buildings: boolean) {
  if (!way.tags || way.refs.length < 2) return null;
  const kind = areaKind(way.tags, way.refs.length >= 4 && way.refs[0] === way.refs[way.refs.length - 1]);
  return kind === "building" && !buildings ? null : kind;
}

interface AreaRelation {
  id: number;
  kind: AreaKind;
  outer: number[];
  inner: number[];
}

/** The multipolygon relations of a block whose tags make an area. */
function* blockRelations(block: PrimitiveBlock, keyIndexes: Map<number, TagKey>, buildings: boolean): Generator<AreaRelation> {
  const innerIndex = block.strings.findIndex((text) => text.length === 5 && text.toString("latin1") === "inner");
  for (const group of block.groups) {
    for (const [field, relation] of groupFields(group)) {
      if (field !== 4) continue;
      let id = 0;
      let keys: ProtoReader | null = null;
      let values: ProtoReader | null = null;
      let roles: ProtoReader | null = null;
      let members: ProtoReader | null = null;
      let types: ProtoReader | null = null;
      while (relation.more) {
        const [relationField, wire] = relation.tag();
        if (relationField === 1 && wire === WIRE_VARINT) id = relation.varint();
        else if (relationField === 2 && wire === WIRE_BYTES) keys = relation.sub();
        else if (relationField === 3 && wire === WIRE_BYTES) values = relation.sub();
        else if (relationField === 8 && wire === WIRE_BYTES) roles = relation.sub();
        else if (relationField === 9 && wire === WIRE_BYTES) members = relation.sub();
        else if (relationField === 10 && wire === WIRE_BYTES) types = relation.sub();
        else relation.skip(wire);
      }
      if (!keys || !values || !roles || !members || !types) continue;
      const tags = readTags(block, keyIndexes, keys, values);
      const kind = tags ? relationAreaKind(tags) : null;
      if (!kind || (kind === "building" && !buildings)) continue;
      const found: AreaRelation = { id, kind, outer: [], inner: [] };
      let member = 0;
      while (members.more && roles.more && types.more) {
        member += members.signed();
        const role = roles.varint();
        // 0 node, 1 way, 2 relation: only ways make rings.
        if (types.varint() !== 1) continue;
        (role === innerIndex ? found.inner : found.outer).push(member);
      }
      if (found.outer.length) yield found;
    }
  }
}

/**
 * Hands over, in batches, the areas of the file and answers how many there
 * were. `onBatch` may take its time: the reading waits for it.
 */
export async function readOsmAreas(path: string, onBatch: (areas: OsmArea[]) => Promise<void>, options: ReadOsmAreasOptions = {}): Promise<OsmAreasSummary> {
  const batchSize = options.batchSize ?? 2000;
  const bbox = options.bbox ?? null;
  const buildings = options.buildings ?? true;
  const file = await open(path, "r");
  try {
    // 1. Every block: its index, the relations of an area kind and the nodes of the tagged ways.
    const index: BlockEntry[] = [];
    const wanted = new NodeIds();
    const memberIds = new NodeIds();
    const relations: AreaRelation[] = [];
    let ways = 0;
    const { size: fileSize } = await file.stat();
    for await (const blob of blobs(file)) {
      if (blob.type !== "OSMData") continue;
      const block = primitiveBlock(await blobData(file, blob));
      const entry: BlockEntry = { offset: blob.offset, size: blob.size, hasNodes: false, hasWays: false };
      let hasRelations = false;
      for (const group of block.groups) {
        for (const [field] of groupFields(group)) {
          if (field === 1 || field === 2) entry.hasNodes = true;
          else if (field === 3) entry.hasWays = true;
          else if (field === 4) hasRelations = true;
        }
      }
      const keyIndexes = tagKeys(block);
      if (entry.hasWays && keyIndexes.size) {
        for (const way of blockWays(block, keyIndexes)) {
          if (!wayKind(way, buildings)) continue;
          ways += 1;
          for (const ref of way.refs) wanted.push(ref);
        }
      }
      if (hasRelations && keyIndexes.size) {
        for (const relation of blockRelations(block, keyIndexes, buildings)) {
          relations.push(relation);
          for (const member of [...relation.outer, ...relation.inner]) memberIds.push(member);
        }
      }
      index.push(entry);
      options.onProgress?.({ phase: "index", done: blob.offset + blob.size, total: fileSize });
    }

    // 2. The member ways of those relations: their node lists, kept until the rings are made.
    const members = memberIds.seal();
    const memberRefs = new Map<number, Float64Array>();
    const wayBlocks = index.filter((entry) => entry.hasWays);
    if (members.length) {
      for (let done = 0; done < wayBlocks.length; done += 1) {
        const block = primitiveBlock(await blobData(file, wayBlocks[done]));
        const isMember = (id: number) => id >= members[0] && id <= members[members.length - 1] && indexOfId(members, id) >= 0;
        for (const way of blockWays(block, new Map(), isMember)) {
          memberRefs.set(way.id, Float64Array.from(way.refs));
          for (const ref of way.refs) wanted.push(ref);
        }
        options.onProgress?.({ phase: "members", done: done + 1, total: wayBlocks.length });
      }
    }

    // 3. The coordinates of every node used.
    const nodeIds = wanted.seal();
    const { latitudes, longitudes, found } = await readNodeCoordinates(file, index, nodeIds, (done, total) => options.onProgress?.({ phase: "nodes", done, total }));
    const points = (refs: ArrayLike<number>) => {
      const line: LatLon[] = [];
      for (let i = 0; i < refs.length; i += 1) {
        const at = indexOfId(nodeIds, refs[i]);
        // A node outside the extract: the outline continues with the ones it has.
        if (at >= 0 && found[at]) line.push([latitudes[at] / DEGREE, longitudes[at] / DEGREE]);
      }
      return line;
    };
    const insideBox = (lines: readonly (readonly LatLon[])[]) =>
      !bbox || lines.some((line) => line.some(([lat, lon]) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]));

    // 4. The ways again, as areas, then the relations.
    let areas = 0;
    let batch: OsmArea[] = [];
    const hand = async (area: OsmArea) => {
      batch.push(area);
      if (batch.length < batchSize) return;
      areas += batch.length;
      await onBatch(batch);
      batch = [];
    };
    for (let done = 0; done < wayBlocks.length; done += 1) {
      const block = primitiveBlock(await blobData(file, wayBlocks[done]));
      const keyIndexes = tagKeys(block);
      if (keyIndexes.size) {
        for (const way of blockWays(block, keyIndexes)) {
          const kind = wayKind(way, buildings);
          if (!kind) continue;
          const line = points(way.refs);
          if (line.length < 2 || !insideBox([line])) continue;
          if (isLineKind(kind)) await hand({ id: `w${way.id}`, kind, polygons: [], lines: [line], areaM2: 0 });
          else {
            // A ring that lost nodes outside the extract no longer closes: it is closed again where it stops.
            if (line.length < 3) continue;
            const ring = line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1] ? line : [...line, line[0]];
            await hand({ id: `w${way.id}`, kind, polygons: [[ring]], lines: [], areaM2: polygonAreaM2([ring]) });
          }
        }
      }
      options.onProgress?.({ phase: "areas", done: done + 1, total: wayBlocks.length + 1 });
    }
    for (const relation of relations) {
      const pieces = (ids: readonly number[]) => ids.flatMap((id) => (memberRefs.has(id) ? [points(memberRefs.get(id)!)] : []));
      const polygons = multipolygon(pieces(relation.outer), pieces(relation.inner));
      if (!polygons.length || !insideBox(polygons.map((polygon) => polygon[0]))) continue;
      await hand({ id: `r${relation.id}`, kind: relation.kind, polygons, lines: [], areaM2: polygons.reduce((total, polygon) => total + polygonAreaM2(polygon), 0) });
    }
    options.onProgress?.({ phase: "areas", done: wayBlocks.length + 1, total: wayBlocks.length + 1 });
    if (batch.length) {
      areas += batch.length;
      await onBatch(batch);
    }
    return { ways, relations: relations.length, nodes: nodeIds.length, areas };
  } finally {
    await file.close();
  }
}

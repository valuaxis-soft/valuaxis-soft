/**
 * What the imports of OpenStreetMap share (scripts/ops/importar-calles.ts and
 * importar-areas.ts): the Geofabrik extract of Mexico, its download to a
 * temporary folder, the `--bbox` option and the report's units.
 */
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { OsmBbox } from "../../src/features/maps/server/osm-pbf";

export const MEXICO_EXTRACT = "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf";

export function parseBbox(value: string | undefined): OsmBbox {
  const parts = (value ?? "").split(",").map(Number);
  const [west, south, east, north] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || west >= east || south >= north || Math.abs(south) > 90 || Math.abs(north) > 90) {
    throw new Error("--bbox espera west,south,east,north en grados, por ejemplo --bbox -102.40,20.65,-102.28,20.76");
  }
  return [west, south, east, north];
}

export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

export async function download(url: string, target: string) {
  const started = Date.now();
  console.log(`Descargando ${url} …`);
  const response = await fetch(url, { headers: { "User-Agent": "Valuaxis/1.0 (+https://valuaxissoft.com)" } });
  if (!response.ok || !response.body) throw new Error(`La descarga respondió ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), createWriteStream(target));
  const { size } = await stat(target);
  const expected = Number(response.headers.get("content-length"));
  if (expected && size !== expected) throw new Error(`La descarga quedó incompleta (${megabytes(size)} de ${megabytes(expected)}); vuelve a correr el comando.`);
  console.log(`Descargado: ${megabytes(size)} en ${seconds(started)}.`);
}

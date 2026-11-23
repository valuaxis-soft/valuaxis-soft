/**
 * Loads the named streets of Mexico into `devpware_calles_osm` (migration
 * 061) from the OpenStreetMap extract Geofabrik publishes every day (ODbL).
 * The croquis and the «Mapa de comparables» read the streets from that table
 * (src/features/maps/server/streets.service.ts); see docs/OPERACION.md,
 * section 7.
 *
 * It can be run again at any time to bring the streets up to date: every way
 * is inserted or replaced in batches, and only at the end of a full import
 * are the ways that no longer exist deleted. The table is never empty in
 * the middle, and an interrupted run leaves the previous streets in place.
 *
 *   pnpm streets:import                              downloads Mexico (~650 MB) and loads it
 *   pnpm streets:import --file mexico.osm.pbf        loads a file already downloaded
 *   pnpm streets:import --bbox -102.40,20.65,-102.28,20.76
 *                                                    only the streets inside the box (west,south,east,north);
 *                                                    adds and replaces, deletes nothing
 *   pnpm streets:import --url <url>                  another extract (a state, another country)
 *   pnpm streets:import --keep                       does not delete the downloaded file
 *
 * Inside the production container: node --import tsx scripts/ops/importar-calles.ts [...]
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { readOsmStreets, type OsmBbox } from "../../src/features/maps/server/osm-pbf";
import { deleteStreetsLoadedBefore, saveStreets, storedStreetsSize } from "../../src/features/maps/server/streets-db";
import { prisma } from "../../src/infrastructure/database/prisma-client";

const MEXICO_EXTRACT = "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf";

function parseBbox(value: string | undefined): OsmBbox {
  const parts = (value ?? "").split(",").map(Number);
  const [west, south, east, north] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || west >= east || south >= north || Math.abs(south) > 90 || Math.abs(north) > 90) {
    throw new Error("--bbox espera west,south,east,north en grados, por ejemplo --bbox -102.40,20.65,-102.28,20.76");
  }
  return [west, south, east, north];
}

function parseArgs(argv: string[]) {
  let file: string | null = null;
  let url = MEXICO_EXTRACT;
  let bbox: OsmBbox | null = null;
  let keep = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") file = argv[++index] ?? null;
    else if (arg === "--url") url = argv[++index] ?? url;
    else if (arg === "--bbox") bbox = parseBbox(argv[++index]);
    else if (arg === "--keep") keep = true;
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return { file, url, bbox, keep };
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

async function download(url: string, target: string) {
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

async function main() {
  const { file, url, bbox, keep } = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const loadedAt = new Date(started);
  const before = await storedStreetsSize();
  console.log(`La tabla tiene ${before.rows} calles (${megabytes(before.bytes)}).`);

  let path = file;
  let downloadDir: string | null = null;
  if (!path) {
    downloadDir = await mkdtemp(join(tmpdir(), "valuaxis-calles-"));
    path = join(downloadDir, "extracto.osm.pbf");
    await download(url, path);
  }

  try {
    const reading = Date.now();
    let written = 0;
    let lastPhase = "";
    let lastLog = 0;
    const summary = await readOsmStreets(
      path,
      async (streets) => {
        written += await saveStreets(streets, loadedAt);
      },
      {
        bbox,
        onProgress: ({ phase, done, total }) => {
          if (phase === lastPhase && Date.now() - lastLog < 15_000 && done < total) return;
          if (phase !== lastPhase) console.log({ ways: "1/3 Leyendo las vías del archivo…", nodes: "2/3 Leyendo las coordenadas…", streets: "3/3 Guardando las calles…" }[phase]);
          else console.log(`    ${Math.floor((done / total) * 100)} %${phase === "streets" ? ` (${written} calles)` : ""}`);
          lastPhase = phase;
          lastLog = Date.now();
        },
      },
    );
    console.log(`Leídas ${summary.ways} calles con nombre (${summary.nodes} nodos); guardadas ${written}${bbox ? ` dentro de ${bbox.join(",")}` : ""} en ${seconds(reading)}.`);

    if (bbox) console.log("Carga parcial (--bbox): no se borra ninguna calle anterior.");
    else if (!written) console.log("El archivo no trajo calles: la tabla queda como estaba.");
    else console.log(`Borradas ${await deleteStreetsLoadedBefore(loadedAt)} calles que ya no están en OpenStreetMap.`);

    // Outside a transaction: reclaims the replaced rows and refreshes the planner's statistics.
    await prisma.$executeRawUnsafe('VACUUM (ANALYZE) "devpware_calles_osm"').catch((error: unknown) => {
      console.warn(`VACUUM no corrió (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); el autovacuum de PostgreSQL lo hará.`);
    });

    const after = await storedStreetsSize();
    console.log(`\nListo en ${seconds(started)}: ${after.rows} calles, ${megabytes(after.bytes)} en disco (tabla e índices). Memoria máxima del proceso: ${megabytes(process.resourceUsage().maxRSS * 1024)}.`);
    console.log("Las zonas ya consultadas siguen en la memoria de la app hasta un día; reiniciarla las refresca de inmediato.");
  } finally {
    if (downloadDir && !keep) await rm(downloadDir, { recursive: true, force: true });
    else if (downloadDir) console.log(`El archivo queda en ${path}.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

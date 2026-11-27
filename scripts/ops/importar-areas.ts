/**
 * Loads the areas of Mexico into `devpware_areas_osm` (migration 067) from
 * the OpenStreetMap extract Geofabrik publishes every day (ODbL): parks,
 * gardens, water, land uses, grounds of schools and hospitals, buildings,
 * and the rivers and streams as lines. The croquis' base map paints them
 * under its streets (src/features/maps/osm-base-map.ts); see
 * docs/OPERACION.md, section 7.
 *
 * It can be run again at any time: every area is inserted or replaced in
 * batches, and only at the end of a full import are the ones that no longer
 * exist deleted. The table is never empty in the middle, and an interrupted
 * run leaves the previous areas in place.
 *
 *   pnpm areas:import                              downloads Mexico (~650 MB) and loads it
 *   pnpm areas:import --file mexico.osm.pbf        loads a file already downloaded (the one of streets:import --keep)
 *   pnpm areas:import --bbox -102.40,20.65,-102.28,20.76
 *                                                  only the areas inside the box (west,south,east,north);
 *                                                  adds and replaces, deletes nothing
 *   pnpm areas:import --sin-edificios              everything but the buildings (smaller and faster)
 *   pnpm areas:import --url <url>                  another extract
 *   pnpm areas:import --keep                       does not delete the downloaded file
 *
 * Inside the production container: node --import tsx scripts/ops/importar-areas.ts [...]
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deleteAreasLoadedBefore, saveAreas, storedAreasSize } from "../../src/features/maps/server/areas-db";
import type { OsmBbox } from "../../src/features/maps/server/osm-pbf";
import { readOsmAreas } from "../../src/features/maps/server/osm-pbf-areas";
import { prisma } from "../../src/infrastructure/database/prisma-client";
import { MEXICO_EXTRACT, download, megabytes, parseBbox, seconds } from "./osm-extract";

function parseArgs(argv: string[]) {
  let file: string | null = null;
  let url = MEXICO_EXTRACT;
  let bbox: OsmBbox | null = null;
  let keep = false;
  let buildings = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") file = argv[++index] ?? null;
    else if (arg === "--url") url = argv[++index] ?? url;
    else if (arg === "--bbox") bbox = parseBbox(argv[++index]);
    else if (arg === "--keep") keep = true;
    else if (arg === "--sin-edificios") buildings = false;
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return { file, url, bbox, keep, buildings };
}

const PHASES = {
  index: "1/4 Leyendo el archivo y sus multipolígonos…",
  members: "2/4 Leyendo las vías de los multipolígonos…",
  nodes: "3/4 Leyendo las coordenadas…",
  areas: "4/4 Guardando las áreas…",
} as const;

async function main() {
  const { file, url, bbox, keep, buildings } = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const loadedAt = new Date(started);
  const before = await storedAreasSize();
  console.log(`La tabla tiene ${before.rows} áreas (${megabytes(before.bytes)}).${buildings ? "" : " Sin edificios."}`);

  let path = file;
  let downloadDir: string | null = null;
  if (!path) {
    downloadDir = await mkdtemp(join(tmpdir(), "valuaxis-areas-"));
    path = join(downloadDir, "extracto.osm.pbf");
    await download(url, path);
  }

  try {
    const reading = Date.now();
    let written = 0;
    let lastPhase = "";
    let lastLog = 0;
    const summary = await readOsmAreas(
      path,
      async (areas) => {
        written += await saveAreas(areas, loadedAt);
      },
      {
        bbox,
        buildings,
        onProgress: ({ phase, done, total }) => {
          if (phase === lastPhase && Date.now() - lastLog < 15_000 && done < total) return;
          if (phase !== lastPhase) console.log(PHASES[phase]);
          else console.log(`    ${Math.floor((done / total) * 100)} %${phase === "areas" ? ` (${written} áreas)` : ""}`);
          lastPhase = phase;
          lastLog = Date.now();
        },
      },
    );
    console.log(
      `Leídas ${summary.ways} vías y ${summary.relations} multipolígonos (${summary.nodes} nodos); guardadas ${written}${bbox ? ` dentro de ${bbox.join(",")}` : ""} en ${seconds(reading)}.`,
    );

    // Without buildings the buildings already stored stay: the run did not read them.
    if (bbox) console.log("Carga parcial (--bbox): no se borra ninguna área anterior.");
    else if (!buildings) console.log("Carga sin edificios: no se borra ninguna área anterior.");
    else if (!written) console.log("El archivo no trajo áreas: la tabla queda como estaba.");
    else console.log(`Borradas ${await deleteAreasLoadedBefore(loadedAt)} áreas que ya no están en OpenStreetMap.`);

    // Outside a transaction: reclaims the replaced rows and refreshes the planner's statistics.
    await prisma.$executeRawUnsafe('VACUUM (ANALYZE) "devpware_areas_osm"').catch((error: unknown) => {
      console.warn(`VACUUM no corrió (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); el autovacuum de PostgreSQL lo hará.`);
    });

    const after = await storedAreasSize();
    console.log(`\nListo en ${seconds(started)}: ${after.rows} áreas, ${megabytes(after.bytes)} en disco (tabla e índices). Memoria máxima del proceso: ${megabytes(process.resourceUsage().maxRSS * 1024)}.`);
    console.log("Los croquis abiertos se redibujan con: pnpm maps:regenerate-croquis --apply");
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

/**
 * The history of «Buscar con IA» of a valuation (V8.8): every search with
 * what was asked and the listings it found, so they stay on screen and can be
 * turned into cards later without searching (and spending) again, and so the
 * listings found are counted against the 25 of the valuation whether they are
 * used or not («se contabilizan aunque no uses ninguno»).
 *
 * Without a migration: each search is a row of `BusquedaComparable` (the
 * table of the searches of comparables, migration 016, unused until now) of
 * the valuation, its version and its market, with `JFiltros.origen = "IA_WEB"`
 * and the request and listings in `JFiltros`; `ITotalResultados` is how many
 * listings it found. Deleting the valuation deletes them (retention).
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/infrastructure/database/prisma-client";
import { asRecord, type Tx } from "../calculation/access";
import { comparableKindSchema, type ComparableKind } from "../calculation/comparable-kinds";
import { COMPARABLE_TYPES, type ComparableType } from "../calculation/market-types";
import type { WebListingCandidate, WebListingDiscards } from "./web-listings";

/** What marks a row of the searches of comparables as one of «Buscar con IA». */
export const WEB_SEARCH_ORIGIN = "IA_WEB";
/** The kind of geographic search the table requires: the request names the town, not a radius or a polygon. */
const GEOGRAPHIC_KIND = "MUNICIPIO";

/** Where the search was made: a market of the valuation or the market approach of a machinery valuation. */
export type WebSearchTarget = "market" | "machinery";

/** One search of the history, as the dialog shows it. */
export type WebSearchRound = {
  id: string;
  type: ComparableType;
  target: WebSearchTarget;
  /** What the appraiser asked, as written. */
  request: string;
  kind: ComparableKind | null;
  /** ISO timestamp. */
  searchedAt: string;
  /** Listings asked for and found. */
  count: number;
  found: number;
  marketNote: string | null;
  candidates: WebListingCandidate[];
};

type Valuation = { IdAvaluo: number; IdVersionTrabajo: number | null; IdVersionFinal: number | null };

type StoredSearch = {
  origen: typeof WEB_SEARCH_ORIGIN;
  type: ComparableType;
  target: WebSearchTarget;
  request: string;
  previous: string[];
  kind: ComparableKind | null;
  count: number;
  marketNote: string | null;
  discards: WebListingDiscards;
  searches: number;
  elapsedSeconds: number;
  candidates: WebListingCandidate[];
};

/** Keeps a finished search with its listings. A valuation without a version yet (it never happens once it exists) keeps nothing. */
export async function recordWebSearch(input: {
  valuation: Valuation;
  organizationId: number;
  userId: number;
  search: Omit<StoredSearch, "origen">;
}): Promise<string | null> {
  const versionId = input.valuation.IdVersionTrabajo ?? input.valuation.IdVersionFinal;
  if (!versionId) return null;
  const [kind, type] = await Promise.all([
    prisma.tipoBusquedaGeografica.findFirst({ where: { SClave: GEOGRAPHIC_KIND }, select: { IdTipoBusquedaGeografica: true } }),
    prisma.tipoComparable.findUnique({ where: { SClave: input.search.type }, select: { IdTipoComparable: true } }),
  ]);
  const geographic = kind ?? await prisma.tipoBusquedaGeografica.findFirst({ orderBy: { IOrden: "asc" }, select: { IdTipoBusquedaGeografica: true } });
  if (!geographic) return null;
  const filters: StoredSearch = { origen: WEB_SEARCH_ORIGIN, ...input.search };
  const row = await prisma.busquedaComparable.create({
    data: {
      IdOrganizacion: input.organizationId,
      IdAvaluo: input.valuation.IdAvaluo,
      IdVersionAvaluo: versionId,
      IdUsuario: input.userId,
      IdTipoBusquedaGeografica: geographic.IdTipoBusquedaGeografica,
      IdTipoComparable: type?.IdTipoComparable ?? null,
      ILimiteResultados: Math.max(1, input.search.count),
      ITotalResultados: input.search.candidates.length,
      JFiltros: filters as unknown as Prisma.InputJsonObject,
    },
    select: { UIdentificadorPublico: true },
  });
  return row.UIdentificadorPublico;
}

const whereSearches = (valuationId: number) => ({
  IdAvaluo: valuationId,
  JFiltros: { path: ["origen"], equals: WEB_SEARCH_ORIGIN },
}) satisfies Prisma.BusquedaComparableWhereInput;

/** The listings found with AI in the valuation, across its markets and the searches of every version. */
export async function webListingsFound(client: Tx | typeof prisma, valuationId: number): Promise<number> {
  const total = await client.busquedaComparable.aggregate({ where: whereSearches(valuationId), _sum: { ITotalResultados: true } });
  return total._sum.ITotalResultados ?? 0;
}

const isType = (value: unknown): value is ComparableType => typeof value === "string" && (COMPARABLE_TYPES as readonly string[]).includes(value);

/** A stored search as the dialog reads it; one that cannot be read is left out. */
function roundOf(row: { UIdentificadorPublico: string; DFechaEjecucion: Date; JFiltros: Prisma.JsonValue | null; ITotalResultados: number }): WebSearchRound | null {
  const stored = asRecord(row.JFiltros);
  if (stored.origen !== WEB_SEARCH_ORIGIN || !isType(stored.type) || typeof stored.request !== "string") return null;
  const kind = comparableKindSchema.nullable().safeParse(stored.kind ?? null);
  const candidates = Array.isArray(stored.candidates) ? (stored.candidates as WebListingCandidate[]).filter((item) => item && typeof item.url === "string" && typeof item.key === "string") : [];
  return {
    id: row.UIdentificadorPublico,
    type: stored.type,
    target: stored.target === "machinery" ? "machinery" : "market",
    request: stored.request,
    kind: kind.success ? kind.data : null,
    searchedAt: row.DFechaEjecucion.toISOString(),
    count: typeof stored.count === "number" ? stored.count : row.ITotalResultados,
    found: row.ITotalResultados,
    marketNote: typeof stored.marketNote === "string" ? stored.marketNote : null,
    candidates,
  };
}

/** Every search of the valuation, oldest first; with `type`, those of that market (and target). */
export async function webSearchHistory(valuationId: number, filter: { type?: ComparableType; target?: WebSearchTarget } = {}): Promise<WebSearchRound[]> {
  const rows = await prisma.busquedaComparable.findMany({
    where: whereSearches(valuationId),
    orderBy: [{ DFechaEjecucion: "asc" }, { IdBusquedaComparable: "asc" }],
    select: { UIdentificadorPublico: true, DFechaEjecucion: true, JFiltros: true, ITotalResultados: true },
    take: 200,
  });
  return rows.flatMap((row) => roundOf(row) ?? [])
    .filter((round) => (!filter.type || round.type === filter.type) && (!filter.target || round.target === filter.target));
}

/** The addresses of every listing found with AI in the valuation: a new search does not propose them again. */
export async function webSearchKnownUrls(valuationId: number): Promise<string[]> {
  return (await webSearchHistory(valuationId)).flatMap((round) => round.candidates.map((candidate) => candidate.url));
}

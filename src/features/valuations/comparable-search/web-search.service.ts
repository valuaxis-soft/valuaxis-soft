/**
 * «Buscar con IA»: the provider searches the web for listings and the
 * appraiser turns the ones they choose into comparables.
 *
 * A search takes from tens of seconds to a couple of minutes, more than the
 * 60 s the reverse proxy waits for a response, so it runs apart from the
 * request that starts it: `startWebSearch` answers at once with an id and the
 * browser asks `webSearchStatus` every few seconds. The searches in course
 * live in the memory of the process (production runs one app container, as
 * the rate limiter assumes); a restart ends them and the appraiser searches
 * again.
 *
 * A finished search is kept with the valuation, what was asked and the
 * listings it found (web-search-history.ts, V8.8): they stay on screen, can be
 * turned into cards later without searching again, and count against the 25
 * listings found with AI a valuation may have, across all its markets, used or
 * not («se contabilizan aunque no uses ninguno»). A search proposes at most
 * five listings (V8.1 and V8.2, 24 nov 2026).
 *
 * The search also runs from the market approach of a machinery valuation
 * (`target: "machinery"`, audio of 26 nov 2026): kinds of the machinery
 * catalog, for sale or for rent; its cards go to the firm's base and its
 * listings become offers of the panel.
 */
import { randomUUID } from "node:crypto";

import { AI_NOT_ENABLED, AiAssistError } from "@/features/ai/ai-assist.service";
import { AiGatewayError, type AiFetchedPage, type AiGateway, type AiUsage, type AiWebSearchProgress } from "@/features/ai/ai-gateway";
import { aiWebSearchAvailability, getAiGateway } from "@/features/ai/ai-gateway-provider";
import { extractListing, type ListingProposal } from "@/features/ai/listing-extraction";
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { readSubjectLocation } from "@/features/maps/subject-location";
import { prisma } from "@/infrastructure/database/prisma-client";
import { consumeAiWebSearchRateLimit } from "@/security/rate-limit/ai-limit";
import { decimal, findValuation, type Tx } from "../calculation/access";
import { todayInMexico } from "../calculation/comparable-card";
import { comparableClassOfType, type ComparableClass } from "../calculation/comparable-classes";
import { defaultKindOfType, isOtherKind, kindFromText, type ComparableKind } from "../calculation/comparable-kinds";
import { findDuplicates } from "../calculation/comparable-card.service";
import { getMachineryCalculation } from "../calculation/machinery.service";
import { getMarketCalculation, importComparableIds, importToFirmBase, type ImportEntry } from "../calculation/market.service";
import { isLandComparableType, isRentComparableType, type ComparableType, type MarketCalculationDto } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { identityKeys, urlKey, withProvenance } from "./normalize";
import { foundComparableSchema } from "./schemas";
import { PAGE_TEXT_MAX, withPageReading } from "./web-listing-pages";
import {
  AI_COMPARABLES_PER_VALUATION,
  WEB_SEARCH_BATCH,
  WEB_SEARCH_MAX_KNOWN,
  WEB_SEARCH_SOURCE_LABEL,
  comparableFromWebListing,
  listingUrl,
  normalizeWebListings,
  suggestedMachinerySearchText,
  suggestedWebSearchText,
  webListingSearchPrompt,
  webListingSearchSchema,
  type WebListingCandidate,
  type WebListingCandidateInput,
  type WebListingDiscards,
  type WebListingSearchInput,
  type WebSearchSubject,
} from "./web-listings";
import { recordWebSearch, webListingsFound, webSearchHistory, webSearchKnownUrls, type WebSearchRound, type WebSearchTarget } from "./web-search-history";

/**
 * What the provider may do for a request of `count` listings: a few general
 * searches plus one directed search per listing, and opening each listing's
 * page plus three that fail (most portals refuse the provider's reader).
 * Five listings: 9 searches and 8 pages. They were 14 and 6 for up to 40
 * listings and took 80 to 154 s; measured on 24 nov 2026, five land listings
 * took 55 s and five houses 123 s.
 */
export function webSearchLimits(count: number) {
  const wanted = Math.min(Math.max(1, count), WEB_SEARCH_BATCH);
  return { searches: 4 + wanted, fetches: wanted + 3 };
}
/** The whole search; past it the appraiser reads that it took too long. */
export const WEB_SEARCH_TIMEOUT_MS = 240_000;
/** A finished search can still be read this long. */
const JOB_KEPT_MS = 15 * 60_000;
const MAX_JOBS = 300;

export const WEB_SEARCH_DISABLED: Record<"no_key" | "off", string> = {
  no_key: "La búsqueda con IA no está disponible: esta instalación no tiene configurada la llave del servicio de IA. Avisa al administrador.",
  off: "La búsqueda con IA está apagada en esta instalación. El administrador la enciende con AI_COMPARABLE_SEARCH_ENABLED.",
};

/** What the appraiser reads when the valuation already has its listings found with AI. */
export const AI_CAP_REACHED = `Este avalúo ya tiene los ${AI_COMPARABLES_PER_VALUATION} anuncios encontrados con IA que puede tener. Usa los que ya encontraste (siguen en el historial), captura los demás a mano o búscalos en la base del despacho.`;

/** What «Crear fichas» did with one listing, and the comparable of the valuation it is now. */
export type WebListingOutcome = { url: string; outcome: "CREATED" | "REUSED" | "SKIPPED"; comparableId: string | null };

/** A listing found, with the comparable of the firm's base that has the same address on the web, if any. */
export type WebSearchCandidateDto = WebListingCandidate & {
  existing: { comparableId: string; folio: number | null; inValuation: boolean } | null;
};

/** A search of the history with its listings marked as the dialog shows them. */
export type WebSearchRoundDto = Omit<WebSearchRound, "candidates"> & { candidates: WebSearchCandidateDto[] };

/**
 * Listings found with AI in the valuation (`used`, of `cap`), across all its
 * markets, and how many of them are comparables of it now (`cards`). A
 * listing found counts whether it is used or not (V8.8).
 */
export type AiComparableQuota = { used: number; cap: number; cards: number };

/** What the model is doing, as the dialog says it: searching, opening pages, writing its answer, or the server reading the pages. */
export type WebSearchPhase = NonNullable<AiWebSearchProgress["phase"]> | "reading";

export type WebSearchStatusDto =
  | { status: "running"; searches: number; maxSearches: number; fetches: number; phase: WebSearchPhase; query: string | null; elapsedSeconds: number }
  | {
    status: "done";
    candidates: WebSearchCandidateDto[];
    /** The search as the history keeps it; null when it could not be kept. */
    round: WebSearchRoundDto | null;
    /** Candidates of the model left out, and why. */
    discarded: number;
    discards: WebListingDiscards;
    marketNote: string | null;
    searches: number;
    /** Listings asked for. */
    count: number;
    quota: AiComparableQuota;
    elapsedSeconds: number;
  }
  | { status: "failed"; error: string };

type Job = {
  organizationId: number;
  userId: number;
  valuationId: string;
  startedAt: number;
  finishedAt: number | null;
  searches: number;
  maxSearches: number;
  fetches: number;
  phase: WebSearchPhase;
  query: string | null;
  outcome: Extract<WebSearchStatusDto, { status: "done" | "failed" }> | null;
};

// On globalThis: in development each route is its own bundle, and the route that asks must see the job another one started.
const store = globalThis as typeof globalThis & { valuaxisWebSearchJobs?: Map<string, Job> };
const jobs = (store.valuaxisWebSearchJobs ??= new Map<string, Job>());

function purgeJobs(now: number) {
  for (const [id, job] of jobs) {
    if (job.finishedAt !== null && now - job.finishedAt > JOB_KEPT_MS) jobs.delete(id);
  }
}

type RequestOrigin = { ip: string | null; userAgent: string | null };
type Valuation = Awaited<ReturnType<typeof findValuation>>;

/** The comparables of the valuation's current version, in every market. */
const currentComparables = (valuation: Valuation) => {
  const versionId = valuation.IdVersionTrabajo ?? valuation.IdVersionFinal;
  return versionId ? { IdVersionAvaluo: versionId, BIncluido: true } : null;
};

/**
 * The listings found with AI in the valuation (its searches kept, V8.8), used
 * or not, plus its comparables found with AI («Origen del dato» «Búsqueda con
 * IA») that no kept search found: those of before the searches were kept.
 */
export async function aiComparableQuota(tx: Tx, valuation: Valuation): Promise<AiComparableQuota> {
  const where = currentComparables(valuation);
  const [cards, found, history] = await Promise.all([
    where
      ? tx.comparableAvaluo.findMany({ where: { ...where, JPublicacionSnapshot: { path: ["details", "dataOrigin"], equals: WEB_SEARCH_SOURCE_LABEL } }, select: { JPublicacionSnapshot: true } })
      : Promise.resolve([]),
    webListingsFound(tx, valuation.IdAvaluo),
    webSearchKnownUrls(valuation.IdAvaluo),
  ]);
  const searched = new Set(history.flatMap((url) => urlKey(url) ?? []));
  const untracked = cards.filter((row) => {
    const url = (row.JPublicacionSnapshot as { url?: unknown } | null)?.url;
    const key = typeof url === "string" ? urlKey(url) : null;
    return !key || !searched.has(key);
  }).length;
  return { used: found + untracked, cap: AI_COMPARABLES_PER_VALUATION, cards: cards.length };
}

/** The addresses on the web of the valuation's comparables, so a search does not propose them again. */
async function valuationUrls(valuation: Valuation): Promise<string[]> {
  const where = currentComparables(valuation);
  if (!where) return [];
  const rows = await prisma.comparableAvaluo.findMany({ where, select: { JPublicacionSnapshot: true }, orderBy: { IdComparableAvaluo: "desc" }, take: 200 });
  return rows.flatMap((row) => {
    const url = (row.JPublicacionSnapshot as { url?: unknown } | null)?.url;
    return typeof url === "string" ? listingUrl(url) ?? [] : [];
  });
}

/** The class searched for: real estate in a market of a valuation, machinery in the machinery panel. */
const classOfTarget = (type: ComparableType, target: WebSearchTarget): ComparableClass => (target === "machinery" ? "MAQUINARIA" : comparableClassOfType(type));

/**
 * A kind of the other class is not searched for: the markets of a valuation
 * are of real estate, the machinery panel of machinery, and they never mix.
 * The machinery panel searches sales or rents, never land.
 */
function assertKindOfTarget(type: ComparableType, kind: ComparableKind | null | undefined, target: WebSearchTarget) {
  if (target === "machinery" && isLandComparableType(type)) {
    throw new ValuationWorkflowError("La maquinaria y el equipo se buscan en venta o en renta, no como terreno.", 400);
  }
  if (kind && kind.class !== classOfTarget(type, target)) {
    throw new ValuationWorkflowError(target === "machinery"
      ? "Ese tipo de bien es un inmueble: en el panel de maquinaria se buscan maquinaria y equipo."
      : "Ese tipo de bien es de otra clase: en este mercado se buscan inmuebles.", 400);
  }
}

/** «Código postal 47180»: what the address keeps when the valuation was created with its C.P. only. */
const BARE_POSTAL_CODE = /^c[oó]digo postal\s*\d{5}$/i;

/**
 * Where the subject is, in words a search understands. The town of its
 * address; the line captured as its «Ubicación»; and when that line is only
 * the C.P. it was created with, the address its pin was found with (V8.8:
 * the request said «cerca de Código postal 47180», of Arandas, for a
 * valuation in Guadalajara).
 */
export function searchPlaceOf(
  address: { SColonia: string | null; SMunicipio: string | null; SEstado: string | null; SDireccionCompleta: string | null } | undefined,
  pinAddress: string | null | undefined,
): Pick<WebSearchSubject, "neighborhood" | "municipality" | "state" | "address"> {
  const captured = address?.SDireccionCompleta?.trim() || null;
  const pin = pinAddress?.trim() || null;
  const line = captured && BARE_POSTAL_CODE.test(captured) ? pin ?? captured.replace(/^c[oó]digo postal\s*/i, "C.P. ") : captured ?? pin;
  return {
    neighborhood: address?.SColonia?.trim() || null,
    municipality: address?.SMunicipio?.trim() || null,
    state: address?.SEstado?.trim() || null,
    address: line,
  };
}

/** The comparable of the firm's base with the same address on the web as each candidate. */
async function withExisting(publicId: string, organizationId: number, candidates: WebListingCandidate[]): Promise<WebSearchCandidateDto[]> {
  const marked: WebSearchCandidateDto[] = [];
  // One at a time: a search brings five at most, and the pool of connections is small.
  for (const candidate of candidates) {
    const matches = await findDuplicates(publicId, organizationId, { url: candidate.url, location: "", contactPhone: null, price: null });
    const same = matches.find((match) => match.reasons.includes("URL"));
    marked.push({ ...candidate, existing: same ? { comparableId: same.comparableId, folio: same.folio, inValuation: same.sameValuation } : null });
  }
  return marked;
}

const markedRound = async (publicId: string, organizationId: number, round: WebSearchRound): Promise<WebSearchRoundDto> =>
  ({ ...round, candidates: await withExisting(publicId, organizationId, round.candidates) });

/** What the dialog needs before a search: whether it can run, the request its box starts with, the searches made and how many listings are left. */
export async function webSearchSetup(
  publicId: string,
  user: Pick<AuthUser, "organizationId">,
  type: ComparableType,
  target: WebSearchTarget = "market",
) {
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  const availability = aiWebSearchAvailability();
  const [avaluo, quota, history] = await Promise.all([
    prisma.avaluo.findUniqueOrThrow({
      where: { IdAvaluo: valuation.IdAvaluo },
      select: {
        tipoInmueble: { select: { SNombre: true } },
        propiedadSujeto: {
          select: {
            NSuperficieTerreno: true,
            NSuperficieConstruccion: true,
            SUsoSuelo: true,
            JCaracteristicas: true,
            direccionesPropiedad: {
              where: { BEsDireccionActual: true },
              select: { SColonia: true, SMunicipio: true, SEstado: true, SDireccionCompleta: true },
              take: 1,
            },
          },
        },
      },
    }),
    aiComparableQuota(prisma, valuation),
    webSearchHistory(valuation.IdAvaluo, { type, target }),
  ]);
  const subject = avaluo.propiedadSujeto;
  const place = searchPlaceOf(subject?.direccionesPropiedad[0], readSubjectLocation(subject?.JCaracteristicas ?? null)?.address);
  let searchSubject: WebSearchSubject;
  let startKind: ComparableKind | null;
  let suggestion: string;
  if (target === "machinery") {
    // What the valuation appraises: the machine of its cost approach, by name, brand, model and year.
    const machinery = await getMachineryCalculation(publicId, user.organizationId);
    const item = machinery.cost.item;
    const kind = item.name ? kindFromText(item.name, "MAQUINARIA") : null;
    startKind = kind && !isOtherKind(kind.key) ? kind : null;
    searchSubject = { propertyType: item.name || null, ...place, area: null, landUse: null };
    suggestion = suggestedMachinerySearchText(type, searchSubject, { name: item.name, brand: item.brand, model: item.model, year: item.year }, startKind);
  } else {
    const calculation = await getMarketCalculation(publicId, user.organizationId, type);
    const ownArea = decimal(isLandComparableType(type) ? subject?.NSuperficieTerreno : subject?.NSuperficieConstruccion);
    searchSubject = {
      propertyType: avaluo.tipoInmueble.SNombre,
      ...place,
      area: calculation.settings.subjectArea ?? ownArea,
      landUse: subject?.SUsoSuelo?.trim() || null,
    };
    // The kind the box starts with: «Terreno / Lote» in a land market, the subject's in the others (Casa → Casa habitación).
    const kind = defaultKindOfType(type) ?? (avaluo.tipoInmueble.SNombre ? kindFromText(avaluo.tipoInmueble.SNombre, "INMUEBLE") : null);
    startKind = kind && !isOtherKind(kind.key) ? kind : null;
    suggestion = suggestedWebSearchText(type, searchSubject, startKind);
  }
  const rounds: WebSearchRoundDto[] = [];
  for (const round of history) rounds.push(await markedRound(publicId, user.organizationId, round));
  return {
    enabled: availability.enabled,
    disabledReason: availability.enabled ? null : WEB_SEARCH_DISABLED[availability.reason],
    suggestion,
    // The dialog writes the request again when another kind is chosen.
    subject: searchSubject,
    kind: startKind,
    maxSearches: webSearchLimits(WEB_SEARCH_BATCH).searches,
    batch: WEB_SEARCH_BATCH,
    quota,
    // Every search of this market, with its listings: they are shown again, and turned into cards without searching again.
    history: rounds,
  };
}

function recordSearch(job: Job, origin: RequestOrigin, usage: AiUsage, detail: Record<string, number | string | null>) {
  return recordAuditEvent({
    typeKey: "EXPORTACION",
    organizationId: job.organizationId,
    userId: job.userId,
    entity: "Avaluo",
    entityId: job.valuationId,
    action: "AI_COMPARABLE_SEARCH",
    result: "EXITOSO",
    ip: origin.ip,
    userAgent: origin.userAgent,
    // Sizes, counts and times only: neither the request nor the listings found.
    metadata: {
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      webSearches: usage.webSearches ?? 0,
      ...detail,
    },
  });
}

/**
 * The second reading of the pages the provider opened: each one, as soon as
 * it arrives, goes to the extraction model while the search goes on, so the
 * reading adds little to the wait. A page that fails to be read is left out.
 */
function pageReader(gateway: AiGateway, maxPages: number) {
  const readings = new Map<string, Promise<{ proposal: ListingProposal; usage: AiUsage } | null>>();
  const texts = new Map<string, string>();
  return {
    texts,
    read(page: AiFetchedPage) {
      const key = urlKey(page.url);
      if (!key || readings.has(key) || readings.size >= maxPages) return;
      texts.set(key, page.text);
      readings.set(key, extractListing(gateway, { text: page.text.slice(0, PAGE_TEXT_MAX), url: page.url }).catch((error: unknown) => {
        console.warn(`[AI] listing page reading failed: ${error instanceof AiGatewayError ? error.kind : "unknown"}`);
        return null;
      }));
    },
    reading: (key: string) => readings.get(key) ?? Promise.resolve(null),
  };
}

type SearchInput = WebListingSearchInput & { target: WebSearchTarget };

async function runJob(job: Job, input: SearchInput, origin: RequestOrigin) {
  try {
    const gateway = await getAiGateway();
    if (!gateway) throw new AiAssistError(AI_NOT_ENABLED, 503);
    const limits = webSearchLimits(input.count);
    const pages = pageReader(gateway, limits.fetches + 2);
    const { data, usage, resultUrls, pages: returned, timings } = await gateway.searchWeb(
      webListingSearchPrompt(input, todayInMexico()),
      webListingSearchSchema,
      {
        maxSearches: limits.searches,
        maxFetches: limits.fetches,
        timeoutMs: WEB_SEARCH_TIMEOUT_MS,
        onProgress: (progress) => {
          job.searches = progress.searches;
          job.query = progress.query;
          job.fetches = progress.fetches ?? job.fetches;
          job.phase = progress.phase ?? job.phase;
        },
        onPage: (page) => pages.read(page),
      },
    );
    // A page the stream did not hand over as it came (a gateway without `onPage`) is read now.
    for (const page of returned) pages.read(page);
    const modelSeconds = (Date.now() - job.startedAt) / 1000;
    job.phase = "reading";
    const normalized = normalizeWebListings(input.type, data, { resultUrls, knownUrls: input.knownUrls, count: input.count, pages: pages.texts });
    // What each page confirms, in parallel; most were read while the model was still writing.
    let pageTokens = { input: 0, output: 0, read: 0 };
    const candidates = await Promise.all(normalized.candidates.map(async (candidate) => {
      if (!candidate.pageRead) return candidate;
      const reading = await pages.reading(candidate.key);
      if (!reading) return candidate;
      pageTokens = { input: pageTokens.input + reading.usage.inputTokens, output: pageTokens.output + reading.usage.outputTokens, read: pageTokens.read + 1 };
      return withPageReading(input.type, candidate, reading.proposal);
    }));
    const elapsedSeconds = Math.round((Date.now() - job.startedAt) / 1000);
    const searches = Math.max(job.searches, usage.webSearches ?? 0);
    const valuation = await findValuation(prisma, job.valuationId, job.organizationId);
    await recordSearch(job, origin, usage, {
      candidates: candidates.length,
      discarded: normalized.discarded,
      discardedListingPages: normalized.discards.listingPage,
      discardedUnpublished: normalized.discards.unpublished,
      discardedExtra: normalized.discards.extra,
      requested: input.count,
      pagesOpened: returned.length,
      pagesRead: pageTokens.read,
      pageInputTokens: pageTokens.input,
      pageOutputTokens: pageTokens.output,
      seconds: elapsedSeconds,
      modelSeconds: Math.round(modelSeconds),
      firstSearchSeconds: timings?.firstSearchMs === null || timings?.firstSearchMs === undefined ? null : Math.round(timings.firstSearchMs / 1000),
      lastToolSeconds: timings?.lastToolMs === null || timings?.lastToolMs === undefined ? null : Math.round(timings.lastToolMs / 1000),
      reportStartSeconds: timings?.reportStartMs === null || timings?.reportStartMs === undefined ? null : Math.round(timings.reportStartMs / 1000),
      turns: timings?.turns ?? null,
      characters: input.text.length,
    });
    // Kept with the valuation, so its listings can be used later without searching again (V8.8).
    const searchedAt = new Date();
    const roundId = await recordWebSearch({
      valuation,
      organizationId: job.organizationId,
      userId: job.userId,
      search: {
        type: input.type, target: input.target, request: input.text, previous: input.previous, kind: input.kind ?? null, count: input.count,
        marketNote: normalized.marketNote, discards: normalized.discards, searches, elapsedSeconds, candidates,
      },
    }).catch((error: unknown) => {
      console.error("[AI] COMPARABLE_SEARCH history not kept", error);
      return null;
    });
    const marked = await withExisting(job.valuationId, job.organizationId, candidates);
    job.outcome = {
      status: "done",
      candidates: marked,
      round: roundId ? {
        id: roundId, type: input.type, target: input.target, request: input.text, kind: input.kind ?? null, searchedAt: searchedAt.toISOString(),
        count: input.count, found: candidates.length, marketNote: normalized.marketNote, candidates: marked,
      } : null,
      discarded: normalized.discarded,
      discards: normalized.discards,
      marketNote: normalized.marketNote,
      searches,
      count: input.count,
      quota: await aiComparableQuota(prisma, valuation),
      elapsedSeconds,
    };
  } catch (error) {
    if (error instanceof AiGatewayError) console.warn(`[AI] COMPARABLE_SEARCH failed: ${error.kind}`);
    else if (!(error instanceof AiAssistError) && !(error instanceof ValuationWorkflowError)) console.error("[AI] COMPARABLE_SEARCH", error);
    const message = error instanceof AiGatewayError || error instanceof AiAssistError || error instanceof ValuationWorkflowError
      ? error.message
      : "No se pudo completar la búsqueda con IA. Intenta de nuevo.";
    job.outcome = { status: "failed", error: message };
  } finally {
    job.finishedAt = Date.now();
  }
}

/**
 * Starts a search and answers with its id. Reading the valuation is enough,
 * as with the search of the firm's base; another organization's is not found.
 * A valuation with its 25 listings found with AI is not searched for, and a
 * search asks for no more than the places left.
 */
export async function startWebSearch(
  publicId: string,
  user: Pick<AuthUser, "id" | "organizationId">,
  input: WebListingSearchInput & { target?: WebSearchTarget },
  origin: RequestOrigin,
): Promise<{ jobId: string; count: number }> {
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  const target = input.target ?? "market";
  assertKindOfTarget(input.type, input.kind, target);
  const availability = aiWebSearchAvailability();
  if (!availability.enabled) throw new AiAssistError(WEB_SEARCH_DISABLED[availability.reason], 503);
  const quota = await aiComparableQuota(prisma, valuation);
  const left = quota.cap - quota.used;
  if (left <= 0) throw new ValuationWorkflowError(AI_CAP_REACHED, 409);
  const now = Date.now();
  purgeJobs(now);
  if ([...jobs.values()].some((job) => job.userId === user.id && job.finishedAt === null)) {
    throw new ValuationWorkflowError("Ya tienes una búsqueda con IA en curso. Espera a que termine.", 409);
  }
  if (jobs.size >= MAX_JOBS) throw new AiAssistError("Hay demasiadas búsquedas con IA en curso. Intenta de nuevo en unos minutos.", 503);
  const limit = consumeAiWebSearchRateLimit(user, now);
  if (!limit.allowed) {
    throw new AiAssistError("Llegaste al límite de búsquedas con IA por ahora. Espera unos minutos antes de volver a buscar.", 429, limit.retryAfterSeconds);
  }
  const count = Math.min(input.count, left, WEB_SEARCH_BATCH);
  // The listings on screen, those found before in this valuation and those already in it are not proposed again.
  const known = [...new Set([...input.knownUrls, ...await webSearchKnownUrls(valuation.IdAvaluo), ...await valuationUrls(valuation)])].slice(0, WEB_SEARCH_MAX_KNOWN * 2);
  const jobId = randomUUID();
  const job: Job = {
    organizationId: user.organizationId, userId: user.id, valuationId: publicId, startedAt: now, finishedAt: null,
    searches: 0, maxSearches: webSearchLimits(count).searches, fetches: 0, phase: "searching", query: null, outcome: null,
  };
  jobs.set(jobId, job);
  // Not awaited: the request that started it has already answered when the search ends.
  void runJob(job, { ...input, target, count, knownUrls: known }, origin);
  return { jobId, count };
}

/** How a search is going, for the person who started it; anyone else gets "not found". */
export function webSearchStatus(publicId: string, user: Pick<AuthUser, "id" | "organizationId">, jobId: string): WebSearchStatusDto {
  const job = jobs.get(jobId);
  if (!job || job.organizationId !== user.organizationId || job.userId !== user.id || job.valuationId !== publicId) {
    throw new ValuationWorkflowError("La búsqueda ya no está disponible. Vuelve a buscar.", 404);
  }
  return job.outcome ?? {
    status: "running",
    searches: job.searches,
    maxSearches: job.maxSearches,
    fetches: job.fetches,
    phase: job.phase,
    query: job.query,
    elapsedSeconds: Math.round((Date.now() - job.startedAt) / 1000),
  };
}

/** The listing as a capture of a comparable, «Sin revisar», with where it came from. */
const capturedListing = (type: ComparableType, candidate: WebListingCandidateInput, today: string, kind: ComparableKind | null) =>
  foundComparableSchema.parse(withProvenance(comparableFromWebListing(type, candidate, today, kind), WEB_SEARCH_SOURCE_LABEL, candidate.portal));

/**
 * «Crear fichas»: each chosen listing becomes a comparable of the market,
 * filled with what the listing gave and left «Sin revisar», so it goes
 * through the firm's checklist like any other. A listing the firm's base
 * already has (same address on the web, same market) is brought from the base
 * with its number and its evidence instead of captured twice; one the
 * valuation already has is skipped. Every card stays in the firm's base,
 * also once it is taken out of the market (`deleteComparable`, V8.8).
 *
 * `items` says, in the order the listings came, what became of each and the
 * comparable it is now: the browser uploads to it the screenshot and photos
 * the appraiser pasted for that listing, through the same routes as the form.
 *
 * The listings were counted when they were found; the cards found with AI a
 * valuation includes are still never more than 25.
 */
export async function addWebListings(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  candidates: WebListingCandidateInput[],
  kind: ComparableKind | null = null,
): Promise<{ created: number; reused: number; skipped: number; items: WebListingOutcome[]; calculation: MarketCalculationDto; quota: AiComparableQuota }> {
  assertKindOfTarget(type, kind, "market");
  const current = await getMarketCalculation(publicId, user.organizationId, type);
  if (current.locked) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const today = todayInMexico();
  const seen = new Set(current.comparables.flatMap(identityKeys));
  const entries: ImportEntry[] = [];
  const items: WebListingOutcome[] = [];
  // The item of each entry, so the ids the import answers land on their listing.
  const itemOfEntry: number[] = [];
  for (const candidate of candidates) {
    const comparable = capturedListing(type, candidate, today, kind);
    const keys = identityKeys(comparable);
    if (keys.some((key) => seen.has(key))) {
      items.push({ url: candidate.url, outcome: "SKIPPED", comparableId: null });
      continue;
    }
    for (const key of keys) seen.add(key);
    const matches = await findDuplicates(publicId, user.organizationId, { url: comparable.url, location: "", contactPhone: null, price: null });
    const same = matches.find((match) => match.reasons.includes("URL") && match.type === type);
    if (same?.sameValuation) {
      items.push({ url: candidate.url, outcome: "SKIPPED", comparableId: null });
      continue;
    }
    itemOfEntry.push(items.length);
    items.push({ url: candidate.url, outcome: same ? "REUSED" : "CREATED", comparableId: null });
    entries.push(same ? { reuseFrom: same.comparableId } : { ...comparable, factors: [] });
  }
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  const quota = await aiComparableQuota(prisma, valuation);
  if (quota.cards + entries.length > quota.cap) {
    const left = Math.max(0, quota.cap - quota.cards);
    throw new ValuationWorkflowError(left
      ? `Este avalúo tiene ${quota.cards} de ${quota.cap} comparables encontrados con IA: solo puedes agregar ${left === 1 ? "uno más" : `${left} más`}. Elige menos anuncios o captura los demás a mano.`
      : AI_CAP_REACHED, 409);
  }
  if (entries.length) {
    const ids = await importComparableIds(publicId, user, type, entries);
    ids.forEach((id, index) => { items[itemOfEntry[index]].comparableId = id; });
  }
  const count = (outcome: WebListingOutcome["outcome"]) => items.filter((item) => item.outcome === outcome).length;
  return {
    created: count("CREATED"),
    reused: count("REUSED"),
    skipped: count("SKIPPED"),
    items,
    calculation: entries.length ? await getMarketCalculation(publicId, user.organizationId, type) : current,
    quota: entries.length ? await aiComparableQuota(prisma, valuation) : quota,
  };
}

/** A listing chosen in the machinery panel: its card in the firm's base and the offer the panel adds. */
export type MachineryListingOutcome = { url: string; outcome: "CREATED" | "REUSED"; comparableId: string; folio: number | null };

/**
 * «Crear ofertas» of the machinery panel: each chosen listing becomes a card
 * of the firm's base («Maquinaria y equipo», «Sin revisar»), so it stays to
 * be used again, and the panel adds it as an offer (machinery never enters a
 * market of a valuation). A listing the base already has (same address on the
 * web) is not captured twice: its card is used.
 */
export async function addWebListingsToMachinery(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  candidates: WebListingCandidateInput[],
  kind: ComparableKind | null,
): Promise<{ items: MachineryListingOutcome[]; quota: AiComparableQuota }> {
  assertKindOfTarget(type, kind, "machinery");
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  if (valuation.BBloqueado) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const today = todayInMexico();
  const items: MachineryListingOutcome[] = [];
  for (const candidate of candidates) {
    const matches = await findDuplicates(publicId, user.organizationId, { url: listingUrl(candidate.url), location: "", contactPhone: null, price: null, assetClass: "MAQUINARIA" });
    const same = matches.find((match) => match.reasons.includes("URL"));
    if (same) {
      items.push({ url: candidate.url, outcome: "REUSED", comparableId: same.comparableId, folio: same.folio });
      continue;
    }
    const payload = capturedListing(type, candidate, today, kind ?? { key: "EQUIPO", label: "Equipo", class: "MAQUINARIA" });
    const [result] = await importToFirmBase(user, [{ type, payload: { ...payload, operationType: isRentComparableType(type) ? "RENTA" : "VENTA", factors: [] } }]);
    const created = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: result.id }, select: { propiedad: { select: { IFolioComparable: true } } } });
    items.push({ url: candidate.url, outcome: "CREATED", comparableId: result.id, folio: created.propiedad.IFolioComparable });
  }
  return { items, quota: await aiComparableQuota(prisma, valuation) };
}

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
 * again. Nothing of a search is stored: only who ran it and what it cost.
 *
 * A search proposes at most five listings, and a valuation includes at most
 * 25 comparables found with AI, across all its markets (V8.1 and V8.2, 24 nov
 * 2026). The count is read from the comparables themselves: those whose
 * «Origen del dato» is «Búsqueda con IA».
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
import { findDuplicates } from "../calculation/comparable-card.service";
import { getMarketCalculation, importComparableIds, type ImportEntry } from "../calculation/market.service";
import { isLandComparableType, type ComparableType, type MarketCalculationDto } from "../calculation/market-types";
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
  suggestedWebSearchText,
  webListingSearchPrompt,
  webListingSearchSchema,
  type WebListingCandidate,
  type WebListingCandidateInput,
  type WebListingDiscards,
  type WebListingSearchInput,
} from "./web-listings";

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

/** What the appraiser reads when the valuation already has its comparables found with AI. */
export const AI_CAP_REACHED = `Este avalúo ya tiene los ${AI_COMPARABLES_PER_VALUATION} comparables encontrados con IA que puede incluir. Captura los demás a mano o búscalos en la base del despacho.`;

/** What «Crear fichas» did with one listing, and the comparable of the valuation it is now. */
export type WebListingOutcome = { url: string; outcome: "CREATED" | "REUSED" | "SKIPPED"; comparableId: string | null };

/** A listing found, with the comparable of the firm's base that has the same address on the web, if any. */
export type WebSearchCandidateDto = WebListingCandidate & {
  existing: { comparableId: string; folio: number | null; inValuation: boolean } | null;
};

/** Comparables found with AI the valuation includes, and how many it may. */
export type AiComparableQuota = { used: number; cap: number };

/** What the model is doing, as the dialog says it: searching, opening pages, writing its answer, or the server reading the pages. */
export type WebSearchPhase = NonNullable<AiWebSearchProgress["phase"]> | "reading";

export type WebSearchStatusDto =
  | { status: "running"; searches: number; maxSearches: number; fetches: number; phase: WebSearchPhase; query: string | null; elapsedSeconds: number }
  | {
    status: "done";
    candidates: WebSearchCandidateDto[];
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
 * Comparables found with AI the valuation includes now, across all its
 * markets: those whose «Origen del dato» is «Búsqueda con IA». Taking one
 * out of the valuation frees its place.
 */
export async function aiComparableQuota(tx: Tx, valuation: Valuation): Promise<AiComparableQuota> {
  const where = currentComparables(valuation);
  const used = where
    ? await tx.comparableAvaluo.count({ where: { ...where, JPublicacionSnapshot: { path: ["details", "dataOrigin"], equals: WEB_SEARCH_SOURCE_LABEL } } })
    : 0;
  return { used, cap: AI_COMPARABLES_PER_VALUATION };
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

/** What the dialog needs before a search: whether it can run, the request its box starts with and how many comparables found with AI are left. */
export async function webSearchSetup(publicId: string, user: Pick<AuthUser, "organizationId">, type: ComparableType) {
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  const availability = aiWebSearchAvailability();
  const [avaluo, calculation, quota] = await Promise.all([
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
    getMarketCalculation(publicId, user.organizationId, type),
    aiComparableQuota(prisma, valuation),
  ]);
  const subject = avaluo.propiedadSujeto;
  const address = subject?.direccionesPropiedad[0];
  const ownArea = decimal(isLandComparableType(type) ? subject?.NSuperficieTerreno : subject?.NSuperficieConstruccion);
  return {
    enabled: availability.enabled,
    disabledReason: availability.enabled ? null : WEB_SEARCH_DISABLED[availability.reason],
    suggestion: suggestedWebSearchText(type, {
      propertyType: avaluo.tipoInmueble.SNombre,
      neighborhood: address?.SColonia?.trim() || null,
      municipality: address?.SMunicipio?.trim() || null,
      state: address?.SEstado?.trim() || null,
      // The «Ubicación» of the valuation as captured; without it, the address its pin was found with.
      address: address?.SDireccionCompleta?.trim() || readSubjectLocation(subject?.JCaracteristicas ?? null)?.address?.trim() || null,
      area: calculation.settings.subjectArea ?? ownArea,
      landUse: subject?.SUsoSuelo?.trim() || null,
    }),
    maxSearches: webSearchLimits(WEB_SEARCH_BATCH).searches,
    batch: WEB_SEARCH_BATCH,
    quota,
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

async function runJob(job: Job, input: WebListingSearchInput, origin: RequestOrigin) {
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
    job.outcome = {
      status: "done",
      candidates: await withExisting(job.valuationId, job.organizationId, candidates),
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
 * A valuation with its 25 comparables found with AI is not searched for, and
 * a search asks for no more than the places left.
 */
export async function startWebSearch(
  publicId: string,
  user: Pick<AuthUser, "id" | "organizationId">,
  input: WebListingSearchInput,
  origin: RequestOrigin,
): Promise<{ jobId: string; count: number }> {
  const valuation = await findValuation(prisma, publicId, user.organizationId);
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
  // The listings on screen and those already in the valuation are not proposed again.
  const known = [...new Set([...input.knownUrls, ...await valuationUrls(valuation)])].slice(0, WEB_SEARCH_MAX_KNOWN * 2);
  const jobId = randomUUID();
  const job: Job = {
    organizationId: user.organizationId, userId: user.id, valuationId: publicId, startedAt: now, finishedAt: null,
    searches: 0, maxSearches: webSearchLimits(count).searches, fetches: 0, phase: "searching", query: null, outcome: null,
  };
  jobs.set(jobId, job);
  // Not awaited: the request that started it has already answered when the search ends.
  void runJob(job, { ...input, count, knownUrls: known }, origin);
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

/**
 * «Crear fichas»: each chosen listing becomes a comparable of the market,
 * filled with what the listing gave and left «Sin revisar», so it goes
 * through the firm's checklist like any other. A listing the firm's base
 * already has (same address on the web, same market) is brought from the base
 * with its number and its evidence instead of captured twice; one the
 * valuation already has is skipped.
 *
 * `items` says, in the order the listings came, what became of each and the
 * comparable it is now: the browser uploads to it the screenshot and photos
 * the appraiser pasted for that listing, through the same routes as the form.
 *
 * The valuation includes at most 25 comparables found with AI: a choice that
 * would pass them is rejected whole, saying how many are left.
 */
export async function addWebListings(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  candidates: WebListingCandidateInput[],
): Promise<{ created: number; reused: number; skipped: number; items: WebListingOutcome[]; calculation: MarketCalculationDto; quota: AiComparableQuota }> {
  const current = await getMarketCalculation(publicId, user.organizationId, type);
  if (current.locked) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const today = todayInMexico();
  const seen = new Set(current.comparables.flatMap(identityKeys));
  const entries: ImportEntry[] = [];
  const items: WebListingOutcome[] = [];
  // The item of each entry, so the ids the import answers land on their listing.
  const itemOfEntry: number[] = [];
  for (const candidate of candidates) {
    const comparable = foundComparableSchema.parse(withProvenance(comparableFromWebListing(type, candidate, today), WEB_SEARCH_SOURCE_LABEL, candidate.portal));
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
  if (quota.used + entries.length > quota.cap) {
    const left = Math.max(0, quota.cap - quota.used);
    throw new ValuationWorkflowError(left
      ? `Este avalúo tiene ${quota.used} de ${quota.cap} comparables encontrados con IA: solo puedes agregar ${left === 1 ? "uno más" : `${left} más`}. Elige menos anuncios o captura los demás a mano.`
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

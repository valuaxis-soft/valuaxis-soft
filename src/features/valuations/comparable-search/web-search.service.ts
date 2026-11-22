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
 */
import { randomUUID } from "node:crypto";

import { AI_NOT_ENABLED, AiAssistError } from "@/features/ai/ai-assist.service";
import { AiGatewayError, type AiUsage } from "@/features/ai/ai-gateway";
import { aiWebSearchAvailability, getAiGateway } from "@/features/ai/ai-gateway-provider";
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { readSubjectLocation } from "@/features/maps/subject-location";
import { prisma } from "@/infrastructure/database/prisma-client";
import { consumeAiWebSearchRateLimit } from "@/security/rate-limit/ai-limit";
import { decimal, findValuation } from "../calculation/access";
import { todayInMexico } from "../calculation/comparable-card";
import { findDuplicates } from "../calculation/comparable-card.service";
import { getMarketCalculation, importComparables, type ImportEntry } from "../calculation/market.service";
import { isLandComparableType, type ComparableType, type MarketCalculationDto } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { identityKeys, withProvenance } from "./normalize";
import { foundComparableSchema } from "./schemas";
import {
  WEB_SEARCH_SOURCE_LABEL,
  comparableFromWebListing,
  normalizeWebListings,
  suggestedWebSearchText,
  webListingSearchPrompt,
  webListingSearchSchema,
  type WebListingCandidate,
  type WebListingCandidateInput,
  type WebListingSearchInput,
} from "./web-listings";

/** Web searches the provider may run for one request of the appraiser. */
export const WEB_SEARCH_MAX_SEARCHES = 8;
/** The whole search; past it the appraiser reads that it took too long. */
export const WEB_SEARCH_TIMEOUT_MS = 150_000;
/** A finished search can still be read this long. */
const JOB_KEPT_MS = 15 * 60_000;
const MAX_JOBS = 300;

export const WEB_SEARCH_DISABLED: Record<"no_key" | "off", string> = {
  no_key: "La búsqueda con IA no está disponible: esta instalación no tiene configurada la llave del servicio de IA. Avisa al administrador.",
  off: "La búsqueda con IA está apagada en esta instalación. El administrador la enciende con AI_COMPARABLE_SEARCH_ENABLED.",
};

/** A listing found, with the comparable of the firm's base that has the same address on the web, if any. */
export type WebSearchCandidateDto = WebListingCandidate & {
  existing: { comparableId: string; folio: number | null; inValuation: boolean } | null;
};

export type WebSearchStatusDto =
  | { status: "running"; searches: number; query: string | null; elapsedSeconds: number }
  | {
    status: "done";
    candidates: WebSearchCandidateDto[];
    /** Candidates of the model left out: no usable address on the web, another operation or a repeat. */
    discarded: number;
    marketNote: string | null;
    searches: number;
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

/** What the dialog needs before a search: whether it can run and the request its box starts with. */
export async function webSearchSetup(publicId: string, user: Pick<AuthUser, "organizationId">, type: ComparableType) {
  const valuation = await findValuation(prisma, publicId, user.organizationId);
  const availability = aiWebSearchAvailability();
  const [avaluo, calculation] = await Promise.all([
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
    maxSearches: WEB_SEARCH_MAX_SEARCHES,
  };
}

/** The comparable of the firm's base with the same address on the web as each candidate. */
async function withExisting(publicId: string, organizationId: number, candidates: WebListingCandidate[]): Promise<WebSearchCandidateDto[]> {
  const marked: WebSearchCandidateDto[] = [];
  // One at a time: a search brings a few dozen at most, and the pool of connections is small.
  for (const candidate of candidates) {
    const matches = await findDuplicates(publicId, organizationId, { url: candidate.url, location: "", contactPhone: null, price: null });
    const same = matches.find((match) => match.reasons.includes("URL"));
    marked.push({ ...candidate, existing: same ? { comparableId: same.comparableId, folio: same.folio, inValuation: same.sameValuation } : null });
  }
  return marked;
}

function recordSearch(job: Job, origin: RequestOrigin, usage: AiUsage, detail: Record<string, number>) {
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
    // Sizes and counts only: neither the request nor the listings found.
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

async function runJob(job: Job, input: WebListingSearchInput, origin: RequestOrigin) {
  try {
    const gateway = await getAiGateway();
    if (!gateway) throw new AiAssistError(AI_NOT_ENABLED, 503);
    const { data, usage, resultUrls } = await gateway.searchWeb(
      webListingSearchPrompt(input, todayInMexico()),
      webListingSearchSchema,
      {
        maxSearches: WEB_SEARCH_MAX_SEARCHES,
        timeoutMs: WEB_SEARCH_TIMEOUT_MS,
        onProgress: (progress) => {
          job.searches = progress.searches;
          job.query = progress.query;
        },
      },
    );
    const { candidates, discarded, marketNote } = normalizeWebListings(input.type, data, { resultUrls, knownUrls: input.knownUrls });
    const elapsedSeconds = Math.round((Date.now() - job.startedAt) / 1000);
    const searches = Math.max(job.searches, usage.webSearches ?? 0);
    await recordSearch(job, origin, usage, { candidates: candidates.length, discarded, seconds: elapsedSeconds, characters: input.text.length });
    job.outcome = {
      status: "done",
      candidates: await withExisting(job.valuationId, job.organizationId, candidates),
      discarded,
      marketNote,
      searches,
      elapsedSeconds,
    };
  } catch (error) {
    if (error instanceof AiGatewayError) console.warn(`[AI] COMPARABLE_SEARCH failed: ${error.kind}`);
    else if (!(error instanceof AiAssistError)) console.error("[AI] COMPARABLE_SEARCH", error);
    const message = error instanceof AiGatewayError || error instanceof AiAssistError
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
 */
export async function startWebSearch(
  publicId: string,
  user: Pick<AuthUser, "id" | "organizationId">,
  input: WebListingSearchInput,
  origin: RequestOrigin,
): Promise<{ jobId: string }> {
  await findValuation(prisma, publicId, user.organizationId);
  const availability = aiWebSearchAvailability();
  if (!availability.enabled) throw new AiAssistError(WEB_SEARCH_DISABLED[availability.reason], 503);
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
  const jobId = randomUUID();
  const job: Job = { organizationId: user.organizationId, userId: user.id, valuationId: publicId, startedAt: now, finishedAt: null, searches: 0, query: null, outcome: null };
  jobs.set(jobId, job);
  // Not awaited: the request that started it has already answered when the search ends.
  void runJob(job, input, origin);
  return { jobId };
}

/** How a search is going, for the person who started it; anyone else gets "not found". */
export function webSearchStatus(publicId: string, user: Pick<AuthUser, "id" | "organizationId">, jobId: string): WebSearchStatusDto {
  const job = jobs.get(jobId);
  if (!job || job.organizationId !== user.organizationId || job.userId !== user.id || job.valuationId !== publicId) {
    throw new ValuationWorkflowError("La búsqueda ya no está disponible. Vuelve a buscar.", 404);
  }
  return job.outcome ?? { status: "running", searches: job.searches, query: job.query, elapsedSeconds: Math.round((Date.now() - job.startedAt) / 1000) };
}

/**
 * «Crear fichas»: each chosen listing becomes a comparable of the market,
 * filled with what the listing gave and left «Sin revisar», so it goes
 * through the firm's checklist like any other. A listing the firm's base
 * already has (same address on the web, same market) is brought from the base
 * with its number and its evidence instead of captured twice; one the
 * valuation already has is skipped.
 */
export async function addWebListings(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  candidates: WebListingCandidateInput[],
): Promise<{ created: number; reused: number; skipped: number; calculation: MarketCalculationDto }> {
  const current = await getMarketCalculation(publicId, user.organizationId, type);
  if (current.locked) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const today = todayInMexico();
  const seen = new Set(current.comparables.flatMap(identityKeys));
  const entries: ImportEntry[] = [];
  let reused = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const comparable = foundComparableSchema.parse(withProvenance(comparableFromWebListing(type, candidate, today), WEB_SEARCH_SOURCE_LABEL, candidate.portal));
    const keys = identityKeys(comparable);
    if (keys.some((key) => seen.has(key))) {
      skipped += 1;
      continue;
    }
    for (const key of keys) seen.add(key);
    const matches = await findDuplicates(publicId, user.organizationId, { url: comparable.url, location: "", contactPhone: null, price: null });
    const same = matches.find((match) => match.reasons.includes("URL") && match.type === type);
    if (same?.sameValuation) {
      skipped += 1;
    } else if (same) {
      entries.push({ reuseFrom: same.comparableId });
      reused += 1;
    } else {
      entries.push({ ...comparable, factors: [] });
    }
  }
  if (entries.length) await importComparables(publicId, user, type, entries);
  return {
    created: entries.length - reused,
    reused,
    skipped,
    calculation: entries.length ? await getMarketCalculation(publicId, user.organizationId, type) : current,
  };
}

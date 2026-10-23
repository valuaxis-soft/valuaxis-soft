import type {
  ComparableDto,
  ComparableReadOnlyKey,
  ComparableType,
  MarketCalculationDto,
  MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import type { ComparableImportPreview, ImportBaseCounts } from "@/features/valuations/calculation/comparable-import";
import type { ImportDestination } from "@/features/valuations/calculation/comparable-master";
import type { ComparableCardDto, DuplicateMatchDto, ReviewRowDto } from "@/features/valuations/calculation/comparable-card.service";
import type { DuplicateProbe } from "@/features/valuations/calculation/comparable-duplicates";
import type { ComparableReviewDto } from "@/features/valuations/calculation/comparable-review";
import type { ComparableSearchHit, ComparableSearchResponse } from "@/features/valuations/comparable-search/types";
import type { ConstructionTypeDto, ConstructionTypesDto, CostCalculationDto, CostInputDto } from "@/features/valuations/calculation/cost-types";
import type { ConclusionCalculationDto, ConclusionSettingsDto } from "@/features/valuations/calculation/conclusion-types";
import type { IncomeCalculationDto, IncomeInputDto } from "@/features/valuations/calculation/income-types";
import type { MachineryCalculationDto, MachineryInputDto } from "@/features/valuations/calculation/machinery-types";
import type { TeamRole } from "@/features/team/team-rules";
import type { MyInvitationDto, SentInvitationDto, TeamDto } from "@/features/team/team.service";
import type { FirmSettingsInput } from "@/features/firm/firm-schemas";
import type { FirmSettingsDto } from "@/features/firm/firm.service";
import type { BillingOverviewDto } from "@/features/billing/billing.service";
import type { FactorCatalog } from "@/features/valuations/calculation/factor-catalog";
import type { CustomFactor } from "@/features/firm/custom-factors";
import type { DraftInput } from "@/features/ai/draft-writing";
import type { ListingProposal } from "@/features/ai/listing-extraction";
import type { ValuationDetail, ValuationListItem } from "@/features/valuations/repositories/valuation.repository";
import type { ValuationTemplateDetail, ValuationTemplateSummary } from "@/features/valuations/services/valuation-template.service";

/** What the comparable form sends: the comparable without its id, reference, images and review. */
export type ComparableFormValues = Omit<ComparableDto, ComparableReadOnlyKey>;

const BASE = "/api";

type JsonRecord = Record<string, unknown>;
type ApiId = string;

export type PrincipalCoverImageResponse = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

export type DocumentHeaderImageResponse = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

export type DatosImageResponse = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  blockId: string;
  subBlockId: string | null;
  warning?: string;
};

export type UploadResponse = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type TerrainSketchResponse = {
  id: string;
  slot: "macro" | "micro";
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

/** What the comparable search form sends; null leaves that side of a range open. */
export type ComparableSearchFilters = {
  text: string;
  areaMin: number | null;
  areaMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  /** The filters of the form; empty ones are not sent. */
  state?: string;
  municipality?: string;
  neighborhood?: string;
  postalCode?: string;
  /** "TERRENO", "CONSTRUIDO" or "TODOS"; empty, the market's. */
  kind?: string;
  /** "VENTA", "RENTA" or "TODAS"; empty, the market's. */
  operation?: string;
  consultedFrom?: string;
  consultedTo?: string;
};

const SEARCH_FILTER_PARAMS = {
  state: "estado", municipality: "municipio", neighborhood: "colonia", postalCode: "cp", kind: "inmueble", operation: "operacion",
  consultedFrom: "consultaDesde", consultedTo: "consultaHasta",
} as const;

/** The server answered 401: the session expired or was revoked. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Inicia sesión de nuevo para continuar.");
    this.name = "SessionExpiredError";
  }
}

/** A rejected request with its message, its status and, when the server offers one, a page where the user can fix it. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly link: string | null = null,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(error.error || `HTTP ${res.status}`, typeof error.link === "string" ? error.link : null, res.status);
  }
  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return json.data as T;
}

async function uploadForm<T>(url: string, fields: Record<string, string | Blob | undefined>): Promise<T> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.append(key, value);
  }
  const res = await fetch(`${BASE}${url}`, { method: "POST", body: formData });
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || "Upload failed");
  }
  const json = await res.json();
  return json.data as T;
}

export const api = {
  valuations: {
    update: (id: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    conclude: (id: ApiId) => request<JsonRecord>(`/avaluos/${id}/conclude`, { method: "POST" }),
    reopen: (id: ApiId, input: { reason: string; acceptedText: string }) =>
      request<JsonRecord>(`/avaluos/${id}/reopen`, { method: "POST", body: JSON.stringify(input) }),
    saveFull: (id: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${id}/full`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    coverImage: {
      get: (id: ApiId) =>
        request<PrincipalCoverImageResponse | null>(`/avaluos/${id}/caratula/imagen-principal`),
      upload: (id: ApiId, file: File) =>
        uploadForm<PrincipalCoverImageResponse>(`/avaluos/${id}/caratula/imagen-principal`, { file }),
    },
    documentHeaderImage: {
      get: (id: ApiId) =>
        request<DocumentHeaderImageResponse | null>(`/avaluos/${id}/caratula/imagen-encabezado`),
      upload: (id: ApiId, file: File) =>
        uploadForm<DocumentHeaderImageResponse>(`/avaluos/${id}/caratula/imagen-encabezado`, { file }),
      delete: (id: ApiId) =>
        request<JsonRecord>(`/avaluos/${id}/caratula/imagen-encabezado`, { method: "DELETE" }),
    },
    datosImages: {
      list: (id: ApiId) =>
        request<DatosImageResponse[]>(`/avaluos/${id}/datos/imagenes`),
      upload: (id: ApiId, file: File, blockId: string, apartadoId?: string) =>
        uploadForm<DatosImageResponse>(`/avaluos/${id}/datos/imagenes`, {
          file,
          blockId,
          subBlockId: apartadoId,
        }),
      delete: (id: ApiId, imageId: string) =>
        request<{ deleted: boolean }>(
          `/avaluos/${id}/datos/imagenes?imageId=${encodeURIComponent(imageId)}`,
          { method: "DELETE" },
        ),
    },
    terrainSketches: {
      list: (id: ApiId) =>
        request<TerrainSketchResponse[]>(`/avaluos/${id}/info-terreno/croquis`),
      upload: (id: ApiId, file: File, slot: "macro" | "micro") =>
        uploadForm<TerrainSketchResponse>(`/avaluos/${id}/info-terreno/croquis`, { file, slot }),
    },
  },
  market: {
    get: (id: ApiId, type: ComparableType) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado?tipo=${type}`),
    saveSettings: (id: ApiId, settings: MarketSettingsDto) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado`, { method: "PUT", body: JSON.stringify(settings) }),
    /** `mergeInto`: "es el mismo" that comparable of the firm's base; the new one keeps its number. */
    createComparable: (id: ApiId, type: ComparableType, comparable: ComparableFormValues, mergeInto?: string) =>
      request<MarketCalculationDto>(
        `/avaluos/${id}/mercado/comparables?tipo=${type}${mergeInto ? `&unificar=${encodeURIComponent(mergeInto)}` : ""}`,
        { method: "POST", body: JSON.stringify(comparable) },
      ),
    updateComparable: (id: ApiId, type: ComparableType, comparableId: string, comparable: ComparableFormValues) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}?tipo=${type}`, { method: "PUT", body: JSON.stringify(comparable) }),
    deleteComparable: (id: ApiId, type: ComparableType, comparableId: string) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}?tipo=${type}`, { method: "DELETE" }),
    uploadPhoto: (id: ApiId, type: ComparableType, comparableId: string, file: File) =>
      uploadForm<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}/fotos?tipo=${type}`, { file }),
    previewImport: (id: ApiId, type: ComparableType, file: File, destination?: ImportDestination) =>
      uploadForm<{ preview: ComparableImportPreview }>(`/avaluos/${id}/mercado/comparables/importar?tipo=${type}`, { file, destino: destination }),
    /**
     * `reuse` maps a row to the comparable of the firm's base used instead of it ("Usar el existente");
     * `merge`, to the one it is the same as ("Es el mismo": the most recent data stays, with that one's number).
     */
    importComparables: (
      id: ApiId, type: ComparableType, file: File, reuse: Record<number, string> = {}, merge: Record<number, string> = {}, destination?: ImportDestination,
    ) =>
      uploadForm<{ preview: ComparableImportPreview; imported: number; base: ImportBaseCounts; calculation: MarketCalculationDto }>(
        `/avaluos/${id}/mercado/comparables/importar?tipo=${type}&confirmar=1`,
        { file, reusar: JSON.stringify(reuse), unificar: JSON.stringify(merge), destino: destination },
      ),
    searchComparables: (id: ApiId, type: ComparableType, filters: ComparableSearchFilters) => {
      const params = new URLSearchParams({ tipo: type, q: filters.text });
      const ranges = { supMin: filters.areaMin, supMax: filters.areaMax, precioMin: filters.priceMin, precioMax: filters.priceMax };
      for (const [key, value] of Object.entries(ranges)) if (value !== null) params.set(key, String(value));
      for (const [field, param] of Object.entries(SEARCH_FILTER_PARAMS)) {
        const value = filters[field as keyof typeof SEARCH_FILTER_PARAMS]?.trim();
        if (value) params.set(param, value);
      }
      return request<ComparableSearchResponse>(`/avaluos/${id}/mercado/comparables/buscar?${params}`);
    },
    /** Comparables of the firm's base that look like the same property; only reads. */
    duplicates: (id: ApiId, probe: DuplicateProbe) =>
      request<DuplicateMatchDto[]>(`/avaluos/${id}/mercado/comparables/duplicados`, { method: "POST", body: JSON.stringify(probe) }),
    /** "Usar el existente": brings a comparable of the firm's base with its photos and number. */
    reuseComparable: (id: ApiId, type: ComparableType, comparableId: string) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/reusar?tipo=${type}`, { method: "POST", body: JSON.stringify({ comparableId }) }),
    uploadScreenshot: (id: ApiId, type: ComparableType, comparableId: string, file: File) =>
      uploadForm<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}/pantalla?tipo=${type}`, { file }),
    deleteScreenshot: (id: ApiId, type: ComparableType, comparableId: string) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}/pantalla?tipo=${type}`, { method: "DELETE" }),
    review: (id: ApiId) => request<ReviewRowDto[]>(`/avaluos/${id}/mercado/revision`),
    saveReview: (id: ApiId, comparableId: string, review: Pick<ComparableReviewDto, "status" | "checks" | "notes">) =>
      request<ComparableReviewDto>(`/avaluos/${id}/mercado/comparables/${comparableId}/revision`, { method: "PUT", body: JSON.stringify(review) }),
    /** "Ficha del comparable": any comparable of the firm's base, by the id of one of its captures. */
    card: (comparableId: string) => request<ComparableCardDto>(`/comparables/${comparableId}`),
    addFoundComparables: (id: ApiId, type: ComparableType, results: ComparableSearchHit[]) =>
      request<{ added: number; skipped: number; calculation: MarketCalculationDto }>(`/avaluos/${id}/mercado/comparables/buscar?tipo=${type}`, {
        method: "POST",
        // The id lets the source hand over the photos of the comparable too.
        body: JSON.stringify({ results: results.map(({ id, sourceId, origin, comparable }) => ({ id, sourceId, origin, comparable })) }),
      }),
    deletePhoto: (id: ApiId, type: ComparableType, comparableId: string, photoId: string) =>
      request<MarketCalculationDto>(
        `/avaluos/${id}/mercado/comparables/${comparableId}/fotos?tipo=${type}&fotoId=${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      ),
  },
  /** AI assistance: both answer a draft to review; neither saves anything. */
  /** The firm's base of comparables (/comparables): import without a valuation, or to the valuations of each row's folio. */
  comparableBase: {
    previewImport: (file: File, destination?: ImportDestination, type?: ComparableType) =>
      uploadForm<{ preview: ComparableImportPreview }>("/comparables/importar", { file, destino: destination, tipo: type }),
    importComparables: (
      file: File, reuse: Record<number, string>, merge: Record<number, string>, destination?: ImportDestination, type?: ComparableType,
    ) =>
      uploadForm<{ preview: ComparableImportPreview; imported: number; base: ImportBaseCounts }>(
        "/comparables/importar?confirmar=1",
        { file, reusar: JSON.stringify(reuse), unificar: JSON.stringify(merge), destino: destination, tipo: type },
      ),
  },
  ai: {
    extractListing: (id: ApiId, input: { text: string; url: string | null }) =>
      request<ListingProposal>(`/avaluos/${id}/ia/anuncio`, { method: "POST", body: JSON.stringify(input) }),
    writeDraft: (id: ApiId, input: DraftInput) =>
      request<{ text: string }>(`/avaluos/${id}/ia/redaccion`, { method: "POST", body: JSON.stringify(input) }),
  },
  /** Construction types of the construction section; the cost approach picks from them. */
  constructionTypes: {
    get: (id: ApiId) => request<ConstructionTypesDto>(`/avaluos/${id}/construcciones`),
    save: (id: ApiId, input: { types: ConstructionTypeDto[]; formulas?: Record<string, string> }) =>
      request<ConstructionTypesDto>(`/avaluos/${id}/construcciones`, { method: "PUT", body: JSON.stringify(input) }),
  },
  costs: {
    get: (id: ApiId) => request<CostCalculationDto>(`/avaluos/${id}/costos`),
    save: (id: ApiId, input: CostInputDto) =>
      request<CostCalculationDto>(`/avaluos/${id}/costos`, { method: "PUT", body: JSON.stringify(input) }),
  },
  income: {
    get: (id: ApiId) => request<IncomeCalculationDto>(`/avaluos/${id}/ingresos`),
    save: (id: ApiId, input: IncomeInputDto) =>
      request<IncomeCalculationDto>(`/avaluos/${id}/ingresos`, { method: "PUT", body: JSON.stringify(input) }),
  },
  machinery: {
    get: (id: ApiId) => request<MachineryCalculationDto>(`/avaluos/${id}/maquinaria`),
    /** Saves the capture sent (costs or market); the other one stays as stored. */
    save: (id: ApiId, input: MachineryInputDto) =>
      request<MachineryCalculationDto>(`/avaluos/${id}/maquinaria`, { method: "PUT", body: JSON.stringify(input) }),
  },
  conclusion: {
    get: (id: ApiId) => request<ConclusionCalculationDto>(`/avaluos/${id}/conclusion`),
    save: (id: ApiId, settings: ConclusionSettingsDto) =>
      request<ConclusionCalculationDto>(`/avaluos/${id}/conclusion`, { method: "PUT", body: JSON.stringify(settings) }),
  },
  session: {
    /** Renews an active session; throws SessionExpiredError when it is gone. */
    heartbeat: () => request<{ expiresAt: string }>(`/auth/session`),
  },
  uploads: {
    create: (file: File) => uploadForm<UploadResponse>(`/uploads`, { file }),
  },
  team: {
    get: () => request<TeamDto>(`/organizacion/equipo`),
    save: (name: string) => request<TeamDto>(`/organizacion/equipo`, { method: "PATCH", body: JSON.stringify({ name }) }),
    invite: (input: { email: string; role: TeamRole }) =>
      request<SentInvitationDto>(`/organizacion/equipo/invitaciones`, { method: "POST", body: JSON.stringify(input) }),
    resend: (id: string) => request<SentInvitationDto>(`/organizacion/equipo/invitaciones/${id}`, { method: "POST" }),
    revoke: (id: string) => request<void>(`/organizacion/equipo/invitaciones/${id}`, { method: "DELETE" }),
    changeRole: (memberId: number, role: TeamRole) =>
      request<void>(`/organizacion/equipo/miembros/${memberId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    remove: (memberId: number) => request<void>(`/organizacion/equipo/miembros/${memberId}`, { method: "DELETE" }),
  },
  firm: {
    get: () => request<FirmSettingsDto>(`/organizacion/despacho`),
    save: (input: FirmSettingsInput) =>
      request<FirmSettingsDto>(`/organizacion/despacho`, { method: "PUT", body: JSON.stringify(input) }),
    uploadLogo: (file: File) => uploadForm<{ logoUrl: string | null }>(`/organizacion/despacho/logo`, { file }),
    deleteLogo: () => request<void>(`/organizacion/despacho/logo`, { method: "DELETE" }),
    factors: () => request<{ catalog: FactorCatalog; customized: boolean }>(`/organizacion/despacho/factores`),
    customUnits: () => request<{ units: string[] }>(`/organizacion/despacho/unidades`),
    addCustomUnit: (unit: string) =>
      request<{ units: string[] }>(`/organizacion/despacho/unidades`, { method: "POST", body: JSON.stringify({ unit }) }),
    customFactors: () => request<{ factors: CustomFactor[] }>(`/organizacion/despacho/factores/personalizados`),
    addCustomFactor: (label: string) =>
      request<{ factors: CustomFactor[]; factor: CustomFactor | null }>(`/organizacion/despacho/factores/personalizados`, {
        method: "POST",
        body: JSON.stringify({ label }),
      }),
  },
  billing: {
    get: () => request<BillingOverviewDto>(`/organizacion/facturacion`),
    /** Both answer a Stripe page to send the browser to. */
    checkout: (priceId: string) =>
      request<{ url: string; destination: "checkout" | "portal" }>(`/organizacion/facturacion/checkout`, { method: "POST", body: JSON.stringify({ priceId }) }),
    portal: () => request<{ url: string }>(`/organizacion/facturacion/portal`, { method: "POST" }),
    /** Buys a credit package: answers the Stripe page to send the browser to. */
    buyPackage: (packageId: string) =>
      request<{ url: string }>(`/organizacion/facturacion/creditos/checkout`, { method: "POST", body: JSON.stringify({ packageId }) }),
  },
  /** The firm's templates, and its other valuations to import Blocks from. */
  templates: {
    list: () => request<ValuationTemplateSummary[]>(`/plantillas`),
    get: (id: ApiId) => request<ValuationTemplateDetail>(`/plantillas/${id}`),
    /** Answers 409 (ApiError.status) under a name already in use, unless `replace`. */
    create: (input: { name: string; description?: string | null; valuationId: ApiId; includeData: boolean; includeImages: boolean; replace?: boolean }) =>
      request<ValuationTemplateSummary>(`/plantillas`, { method: "POST", body: JSON.stringify(input) }),
    update: (id: ApiId, input: { name: string; description?: string | null }) =>
      request<ValuationTemplateSummary>(`/plantillas/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: ApiId) => request<void>(`/plantillas/${id}`, { method: "DELETE" }),
    valuations: () => request<ValuationListItem[]>(`/avaluos`),
    valuation: (id: ApiId) => request<ValuationDetail>(`/avaluos/${id}`),
  },
  invitations: {
    mine: () => request<MyInvitationDto[]>(`/organizacion/invitaciones`),
    accept: (selector: { token: string } | { id: string }) =>
      request<{ organizationName: string }>(`/organizacion/invitaciones`, { method: "POST", body: JSON.stringify(selector) }),
  },
};

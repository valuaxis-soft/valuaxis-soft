import type {
  ComparableDto,
  ComparableType,
  MarketCalculationDto,
  MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import type { ComparableImportPreview } from "@/features/valuations/calculation/comparable-import";
import type { CostCalculationDto, CostInputDto } from "@/features/valuations/calculation/cost-types";
import type { ConclusionCalculationDto, ConclusionSettingsDto } from "@/features/valuations/calculation/conclusion-types";
import type { IncomeCalculationDto, IncomeInputDto } from "@/features/valuations/calculation/income-types";
import type { TeamRole } from "@/features/team/team-rules";
import type { MyInvitationDto, SentInvitationDto, TeamDto } from "@/features/team/team.service";
import type { FirmSettingsInput } from "@/features/firm/firm-schemas";
import type { FirmSettingsDto } from "@/features/firm/firm.service";

/** What the comparable form sends: the comparable without its id, reference and photos. */
export type ComparableFormValues = Omit<ComparableDto, "id" | "reference" | "photos">;

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

/** The server answered 401: the session expired or was revoked. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Inicia sesión de nuevo para continuar.");
    this.name = "SessionExpiredError";
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
    throw new Error(error.error || `HTTP ${res.status}`);
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
    createComparable: (id: ApiId, type: ComparableType, comparable: ComparableFormValues) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables?tipo=${type}`, { method: "POST", body: JSON.stringify(comparable) }),
    updateComparable: (id: ApiId, type: ComparableType, comparableId: string, comparable: ComparableFormValues) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}?tipo=${type}`, { method: "PUT", body: JSON.stringify(comparable) }),
    deleteComparable: (id: ApiId, type: ComparableType, comparableId: string) =>
      request<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}?tipo=${type}`, { method: "DELETE" }),
    uploadPhoto: (id: ApiId, type: ComparableType, comparableId: string, file: File) =>
      uploadForm<MarketCalculationDto>(`/avaluos/${id}/mercado/comparables/${comparableId}/fotos?tipo=${type}`, { file }),
    previewImport: (id: ApiId, type: ComparableType, file: File) =>
      uploadForm<{ preview: ComparableImportPreview }>(`/avaluos/${id}/mercado/comparables/importar?tipo=${type}`, { file }),
    importComparables: (id: ApiId, type: ComparableType, file: File) =>
      uploadForm<{ preview: ComparableImportPreview; imported: number; calculation: MarketCalculationDto }>(
        `/avaluos/${id}/mercado/comparables/importar?tipo=${type}&confirmar=1`, { file }),
    deletePhoto: (id: ApiId, type: ComparableType, comparableId: string, photoId: string) =>
      request<MarketCalculationDto>(
        `/avaluos/${id}/mercado/comparables/${comparableId}/fotos?tipo=${type}&fotoId=${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      ),
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
  },
  invitations: {
    mine: () => request<MyInvitationDto[]>(`/organizacion/invitaciones`),
    accept: (selector: { token: string } | { id: string }) =>
      request<{ organizationName: string }>(`/organizacion/invitaciones`, { method: "POST", body: JSON.stringify(selector) }),
  },
};

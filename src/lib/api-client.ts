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
  session: {
    /** Renews an active session; throws SessionExpiredError when it is gone. */
    heartbeat: () => request<{ expiresAt: string }>(`/auth/session`),
  },
  uploads: {
    create: (file: File) => uploadForm<UploadResponse>(`/uploads`, { file }),
  },
};

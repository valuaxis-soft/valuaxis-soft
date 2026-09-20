const BASE = "/api";

type JsonRecord = Record<string, unknown>;
type ApiId = string;
type CreatedResource = JsonRecord & { id: string };

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

export type TerrainSketchResponse = {
  id: string;
  slot: "macro" | "micro";
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data as T;
}

export const api = {
  valuations: {
    list: () => request<JsonRecord[]>(`/avaluos`),
    get: (id: ApiId) => request<JsonRecord>(`/avaluos/${id}`),
    create: (data: JsonRecord) =>
      request<CreatedResource>(`/avaluos`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: ApiId) =>
      request<JsonRecord>(`/avaluos/${id}`, { method: "DELETE" }),
    saveFull: (id: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${id}/full`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    coverImage: {
      get: (id: ApiId) =>
        request<PrincipalCoverImageResponse | null>(`/avaluos/${id}/caratula/imagen-principal`),
      upload: async (id: ApiId, file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${BASE}/avaluos/${id}/caratula/imagen-principal`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || "Upload failed");
        }
        const json = await res.json();
        return json.data as PrincipalCoverImageResponse;
      },
    },
    documentHeaderImage: {
      get: (id: ApiId) =>
        request<DocumentHeaderImageResponse | null>(`/avaluos/${id}/caratula/imagen-encabezado`),
      upload: async (id: ApiId, file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${BASE}/avaluos/${id}/caratula/imagen-encabezado`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || "Upload failed");
        }
        const json = await res.json();
        return json.data as DocumentHeaderImageResponse;
      },
      delete: (id: ApiId) =>
        request<JsonRecord>(`/avaluos/${id}/caratula/imagen-encabezado`, { method: "DELETE" }),
    },
    datosImages: {
      list: (id: ApiId) =>
        request<DatosImageResponse[]>(`/avaluos/${id}/datos/imagenes`),
      upload: async (
        id: ApiId,
        file: File,
        blockId: string,
        apartadoId?: string,
      ) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("blockId", blockId);
        if (apartadoId) formData.append("subBlockId", apartadoId);
        const res = await fetch(`${BASE}/avaluos/${id}/datos/imagenes`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || "Upload failed");
        }
        const json = await res.json();
        return json.data as DatosImageResponse;
      },
      delete: (id: ApiId, imageId: string) =>
        request<{ deleted: boolean }>(
          `/avaluos/${id}/datos/imagenes?imageId=${encodeURIComponent(imageId)}`,
          { method: "DELETE" },
        ),
    },
    terrainSketches: {
      list: (id: ApiId) =>
        request<TerrainSketchResponse[]>(`/avaluos/${id}/info-terreno/croquis`),
      upload: async (id: ApiId, file: File, slot: "macro" | "micro") => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("slot", slot);
        const res = await fetch(`${BASE}/avaluos/${id}/info-terreno/croquis`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || "Upload failed");
        }
        const json = await res.json();
        return json.data as TerrainSketchResponse;
      },
    },
  },
  sections: {
    list: (valuationId: ApiId) =>
      request<JsonRecord[]>(`/avaluos/${valuationId}/sections`),
    get: (valuationId: ApiId, sectionId: ApiId) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}`),
    reorder: (valuationId: ApiId, sections: JsonRecord[]) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections`, {
        method: "PUT",
        body: JSON.stringify({ sections }),
      }),
  },
  blocks: {
    list: (valuationId: ApiId, sectionId: ApiId) =>
      request<JsonRecord[]>(`/avaluos/${valuationId}/sections/${sectionId}/blocks`),
    get: (valuationId: ApiId, sectionId: ApiId, blockId: ApiId) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}/blocks/${blockId}`),
    create: (valuationId: ApiId, sectionId: ApiId, data?: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}/blocks`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    reorder: (valuationId: ApiId, sectionId: ApiId, blocks: JsonRecord[]) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}/blocks`, {
        method: "PUT",
        body: JSON.stringify({ blocks }),
      }),
    update: (valuationId: ApiId, sectionId: ApiId, blockId: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}/blocks/${blockId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (valuationId: ApiId, sectionId: ApiId, blockId: ApiId) =>
      request<JsonRecord>(`/avaluos/${valuationId}/sections/${sectionId}/blocks/${blockId}`, {
        method: "DELETE",
      }),
  },
  comparables: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<JsonRecord[]>(`/comparables${qs}`);
    },
    get: (id: ApiId) => request<JsonRecord>(`/comparables/${id}`),
    create: (data: JsonRecord) =>
      request<JsonRecord>(`/comparables`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: ApiId, data: JsonRecord) =>
      request<JsonRecord>(`/comparables/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: ApiId) =>
      request<JsonRecord>(`/comparables/${id}`, { method: "DELETE" }),
    search: (params: Record<string, string>) => {
      const qs = "?" + new URLSearchParams(params).toString();
      return request<unknown>(`/comparables/search${qs}`);
    },
  },
  uploads: {
    create: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/uploads`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error);
      }
      const json = await res.json();
      return json.data;
    },
  },
  history: {
    byPostalCode: (postalCode: string) =>
      request<JsonRecord[]>(`/history?postalCode=${encodeURIComponent(postalCode)}`),
  },
};

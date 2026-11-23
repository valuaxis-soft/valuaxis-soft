/**
 * What the assisted features need from the AI provider, in plain objects. The
 * Anthropic implementation lives in src/infrastructure/ai/anthropic-gateway.ts,
 * the only module that imports the SDK; tests use a fake.
 */
import type { z } from "zod";

/** Tokens of one call, as the provider bills them. Never the text sent or received. */
export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Web searches the provider ran and bills apart from the tokens; absent on calls without them. */
  webSearches?: number;
};

export type AiErrorKind = "rate_limit" | "no_credit" | "overloaded" | "timeout" | "refused" | "invalid_output" | "configuration" | "unavailable";

/** What the user reads for each failure, and the HTTP status the route answers with. */
const AI_ERRORS: Record<AiErrorKind, { message: string; status: number }> = {
  rate_limit: { message: "El servicio de IA recibió demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.", status: 429 },
  no_credit: { message: "El servicio de IA no tiene saldo disponible. Avisa al administrador de tu despacho.", status: 503 },
  overloaded: { message: "El servicio de IA está saturado en este momento. Intenta de nuevo en unos minutos.", status: 503 },
  timeout: { message: "El servicio de IA tardó demasiado en responder. Intenta de nuevo.", status: 504 },
  refused: { message: "El servicio de IA no pudo procesar este texto. Captura los datos a mano.", status: 422 },
  invalid_output: { message: "El servicio de IA devolvió una respuesta que no se pudo leer. Intenta de nuevo.", status: 502 },
  configuration: { message: "El servicio de IA no está bien configurado. Avisa al administrador de tu despacho.", status: 503 },
  unavailable: { message: "No se pudo contactar al servicio de IA. Intenta de nuevo en unos minutos.", status: 503 },
};

export class AiGatewayError extends Error {
  readonly status: number;
  constructor(readonly kind: AiErrorKind) {
    super(AI_ERRORS[kind].message);
    this.name = "AiGatewayError";
    this.status = AI_ERRORS[kind].status;
  }
}

export type AiPrompt = {
  /** Fixed instructions; the same bytes on every call of a feature. */
  system: string;
  /** The data of this call. */
  user: string;
};

/** How far a web search has gone: the searches run so far and what the last one asked. */
export type AiWebSearchProgress = { searches: number; query: string | null };

export type AiWebSearchOptions = {
  /** Searches the provider may run for this call. */
  maxSearches: number;
  /** Pages the provider may open for this call; without it, it only searches. */
  maxFetches?: number;
  /** The whole call, searches included. */
  timeoutMs: number;
  onProgress?: (progress: AiWebSearchProgress) => void;
};

export interface AiGateway {
  /** A small, fast extraction whose answer must match the schema. */
  extract<T>(prompt: AiPrompt, schema: z.ZodType<T>): Promise<{ data: T; usage: AiUsage }>;
  /** A short text. */
  write(prompt: AiPrompt): Promise<{ text: string; usage: AiUsage }>;
  /**
   * A search of the web run by the provider, answered in the shape of the
   * schema. `resultUrls` are the addresses the provider's search returned,
   * so the caller can tell a page that was found from one that was written.
   */
  searchWeb<T>(prompt: AiPrompt, schema: z.ZodType<T>, options: AiWebSearchOptions): Promise<{ data: T; usage: AiUsage; resultUrls: string[] }>;
}

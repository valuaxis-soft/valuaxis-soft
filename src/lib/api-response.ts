import { NextResponse } from "next/server";
import type { z } from "zod";

/** Logs the real error on the server and returns a generic message to the client. */
export function internalError(context: string, error: unknown, message = "Ocurrió un error interno. Intenta de nuevo.") {
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** A rejected request leaves a trace (where and why, never the content), so a failed save can be diagnosed. */
function logRejected(request: Request, reason: string, detail: unknown) {
  let path = request.url;
  try {
    path = new URL(request.url).pathname;
  } catch {
    // Keep the raw URL.
  }
  console.warn(`[API_REJECTED] ${request.method} ${path} ${reason}`, JSON.stringify(detail));
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Reads a JSON body with a size limit and validates it against a Zod schema. */
export async function readJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  options: { maxBytes?: number } = {},
): Promise<ParsedBody<T>> {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    logRejected(request, "413", { bytes: declared, maxBytes });
    return { ok: false, response: NextResponse.json({ error: "El contenido es demasiado grande." }, { status: 413 }) };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    logRejected(request, "413", { bytes: Buffer.byteLength(text, "utf8"), maxBytes });
    return { ok: false, response: NextResponse.json({ error: "El contenido es demasiado grande." }, { status: 413 }) };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const fields = parsed.error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.join("."),
      message: issueInSpanish(issue),
    }));
    logRejected(request, "400", fields);
    // Name the first field: "no son válidos" alone leaves the user with nothing to correct.
    const [first] = fields;
    const error = first ? `Los datos enviados no son válidos (${first.path || "contenido"}: ${first.message.replace(/\.$/, "")}).` : "Los datos enviados no son válidos.";
    return { ok: false, response: NextResponse.json({ error, fields }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

/** 429 with Retry-After. */
export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Demasiados intentos. Espera un momento antes de volver a intentarlo." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * A schema's own message is already the user's; the ones the validator words
 * itself are in English («Too big: expected number to be <=10»), and they
 * reach the screen when a save is refused.
 */
export function issueInSpanish(issue: { code?: string; message: string; maximum?: unknown; minimum?: unknown; origin?: unknown }) {
  const builtIn = /^(Too big|Too small|Invalid input|Invalid |Unrecognized key|Expected )/.test(issue.message);
  if (!builtIn) return issue.message;
  const text = issue.origin === "string" || issue.origin === "array";
  const limit = (value: unknown) => (typeof value === "number" || typeof value === "bigint" ? Number(value).toLocaleString("es-MX") : null);
  if (issue.code === "too_big") {
    const max = limit(issue.maximum);
    if (issue.origin === "string") return max ? `el texto es demasiado largo: admite hasta ${max} caracteres` : "el texto es demasiado largo";
    if (issue.origin === "array") return max ? `hay demasiados renglones: se admiten hasta ${max}` : "hay demasiados renglones";
    return max ? `el valor es demasiado grande: el máximo es ${max}` : "el valor es demasiado grande";
  }
  if (issue.code === "too_small") {
    const min = limit(issue.minimum);
    if (text) return "falta un dato obligatorio";
    return min ? `el valor es demasiado chico: el mínimo es ${min}` : "el valor es demasiado chico";
  }
  if (issue.code === "invalid_type") return "falta un dato o no es del tipo esperado";
  return "el dato no es válido";
}

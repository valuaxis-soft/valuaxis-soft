import { NextResponse } from "next/server";
import type { z } from "zod";

/** Logs the real error on the server and returns a generic message to the client. */
export function internalError(context: string, error: unknown, message = "Ocurrió un error interno. Intenta de nuevo.") {
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: message }, { status: 500 });
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
    return { ok: false, response: NextResponse.json({ error: "El contenido es demasiado grande." }, { status: 413 }) };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
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
      message: issue.message,
    }));
    return {
      ok: false,
      response: NextResponse.json({ error: "Los datos enviados no son válidos.", fields }, { status: 400 }),
    };
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

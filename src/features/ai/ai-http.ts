import { NextResponse } from "next/server";
import { z } from "zod";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { AiAssistError } from "./ai-assist.service";
import { AiGatewayError } from "./ai-gateway";
import { DRAFT_FACT_LABEL_MAX, DRAFT_FACT_VALUE_MAX, DRAFT_FACTS_MAX_CHARS, DRAFT_MAX_FACTS } from "./draft-writing";
import { LISTING_TEXT_MAX } from "./listing-extraction";

/** Bytes of a request body: the listing or the data, with room for accents and JSON. */
export const AI_BODY_MAX_BYTES = 64_000;

export const listingRequestSchema = z.object({
  text: z.string().max(LISTING_TEXT_MAX, `El anuncio es demasiado largo: pega hasta ${LISTING_TEXT_MAX.toLocaleString("es-MX")} caracteres.`),
  url: z.string().trim().max(1000).nullable().optional()
    .refine((value) => !value || /^https?:\/\//i.test(value), "La liga debe empezar con http:// o https://.")
    .transform((value) => value || null),
});

export const draftRequestSchema = z.object({
  field: z.string().trim().min(1, "Falta el título del campo.").max(DRAFT_FACT_LABEL_MAX),
  context: z.string().trim().max(DRAFT_FACT_LABEL_MAX).nullable().optional().transform((value) => value || null),
  facts: z.array(z.object({
    label: z.string().max(DRAFT_FACT_LABEL_MAX, "El título de un dato es demasiado largo."),
    value: z.string().max(DRAFT_FACT_VALUE_MAX, "Un dato es demasiado largo para redactar con él."),
  })).max(DRAFT_MAX_FACTS, `Se redacta con hasta ${DRAFT_MAX_FACTS} datos.`)
    .refine((facts) => facts.reduce((sum, fact) => sum + fact.label.length + fact.value.length, 0) <= DRAFT_FACTS_MAX_CHARS,
      "Los datos del apartado son demasiado largos para redactar un borrador."),
});

/** Failures of the assistance return their message; anything else is logged and hidden from the client. */
export function aiErrorResponse(context: string, error: unknown, fallbackMessage: string) {
  if (error instanceof AiAssistError) {
    const headers = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  if (error instanceof AiGatewayError) return NextResponse.json({ error: error.message }, { status: error.status });
  return valuationErrorResponse(context, error, fallbackMessage);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableInputSchema, comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { createBaseComparable } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/**
 * "Nuevo comparable" from the Comparables page: kept in the firm's base
 * without a valuation (?tipo= is its market). ?unificar=<id> answers "es el
 * mismo" to that comparable of the base: it keeps that one's number.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const search = new URL(request.url).searchParams;
    const type = comparableTypeSchema.safeParse(search.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const mergeInto = z.uuid().optional().safeParse(search.get("unificar") ?? undefined);
    if (!mergeInto.success) return NextResponse.json({ error: "El comparable con que se unifica no es válido." }, { status: 400 });
    const body = await readJsonBody(request, comparableInputSchema);
    if (!body.ok) return body.response;
    const result = await createBaseComparable(auth.user, type.data, body.data, { mergeInto: mergeInto.data });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_CREATE", error, "No se pudo guardar el comparable.");
  }
}

import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getComparableCard } from "@/features/valuations/calculation/comparable-card.service";
import { comparableInputSchema, comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { deleteBaseComparables, updateBaseComparable } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

type Context = RouteContext<"/api/comparables/[comparableId]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ficha del comparable": a comparable of the firm's base, its evidence and the valuations it was used in. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    return NextResponse.json({ data: await getComparableCard(comparableId, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_CARD", error, "No se pudo cargar la ficha del comparable.");
  }
}

/**
 * "Editar ficha" (?tipo= is its market). One kept in the base without a
 * valuation changes in place; one captured in a valuation gets a newer capture
 * in the base under its number, and the answer carries that capture's id.
 */
export async function PUT(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const body = await readJsonBody(request, comparableInputSchema);
    if (!body.ok) return body.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    return NextResponse.json({ data: await updateBaseComparable(auth.user, comparableId, type.data, body.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_UPDATE", error, "No se pudo guardar el comparable.");
  }
}

/** "Eliminar": only a comparable kept in the base without a valuation; one of a valuation is removed from its market. */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    const outcome = await deleteBaseComparables(auth.user, [comparableId]);
    if (!outcome.deleted && !outcome.kept.length) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    return NextResponse.json({ data: outcome });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_DELETE", error, "No se pudo eliminar el comparable.");
  }
}

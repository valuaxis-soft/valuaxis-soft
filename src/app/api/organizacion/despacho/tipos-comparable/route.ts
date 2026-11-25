import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { addCustomComparableKind, getCustomComparableKinds, removeCustomComparableKind } from "@/features/firm/comparable-kinds.service";
import { CUSTOM_KIND_KEY, customKindSchema } from "@/features/valuations/calculation/comparable-kinds";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const removeSchema = z.object({ key: z.string().trim().regex(CUSTOM_KIND_KEY, "Tipo inválido.") });

/** The kinds of comparable the firm added, for everyone who works on comparables. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: { kinds: await getCustomComparableKinds(auth.user.organizationId) } });
  } catch (error) {
    return internalError("COMPARABLE_KINDS_GET", error, "No se pudieron cargar los tipos del despacho.");
  }
}

/** Confirms a kind typed in the card: from then on the list offers it. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, customKindSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await addCustomComparableKind(auth.user, body.data.label, body.data.class) });
  } catch (error) {
    return internalError("COMPARABLE_KINDS_ADD", error, "No se pudo guardar el tipo.");
  }
}

/** Takes a kind out of the firm's list; the comparables that use it keep its name. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, removeSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await removeCustomComparableKind(auth.user, body.data.key) });
  } catch (error) {
    return internalError("COMPARABLE_KINDS_REMOVE", error, "No se pudo quitar el tipo.");
  }
}

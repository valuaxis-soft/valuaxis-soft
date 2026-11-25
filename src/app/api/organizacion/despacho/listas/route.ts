import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { firmListItemSchema } from "@/features/firm/firm-lists";
import { addFirmListItem, getFirmLists, removeFirmListItem } from "@/features/firm/firm.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** What the firm values of each class and its kinds of valuation of its own, for everyone who works on valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: { lists: await getFirmLists(auth.user.organizationId) } });
  } catch (error) {
    return internalError("FIRM_LISTS_GET", error, "No se pudieron cargar las listas del despacho.");
  }
}

/** Keeps a name typed in «¿Qué se está valuando?» or «Tipo de avalúo» and ticked: from then on the list offers it. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, firmListItemSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { lists: await addFirmListItem(auth.user, body.data) } });
  } catch (error) {
    return internalError("FIRM_LISTS_ADD", error, "No se pudo guardar en la lista del despacho.");
  }
}

/** Takes a name out of one of the firm's lists. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, firmListItemSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { lists: await removeFirmListItem(auth.user, body.data) } });
  } catch (error) {
    return internalError("FIRM_LISTS_REMOVE", error, "No se pudo quitar de la lista del despacho.");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import {
  listTrash,
  OLD_COMPARABLE_MONTHS,
  previewOldComparables,
  restoreFromTrash,
  trashOldComparables,
  type OldComparableMonths,
} from "@/features/valuations/comparable-base/comparable-trash.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const monthsSchema = z.union(OLD_COMPARABLE_MONTHS.map((months) => z.literal(months)) as [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>], "Elige 6, 12 o 24 meses.");
const trashSchema = z.object({ months: monthsSchema });
const restoreSchema = z.object({
  folios: z.union([z.literal("all"), z.array(z.number().int().positive()).min(1, "Elige al menos un comparable.").max(20_000)]),
});

/**
 * The trash of the firm's base (V8.8, «borrado masivo de comparables muy
 * viejos»). GET: the numbers in it; with ?meses=6|12|24, how many comparables
 * older than that would go, to confirm first.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const months = new URL(request.url).searchParams.get("meses");
    if (months !== null) {
      const parsed = monthsSchema.safeParse(Number(months));
      if (!parsed.success) return NextResponse.json({ error: "Elige 6, 12 o 24 meses." }, { status: 400 });
      return NextResponse.json({ data: await previewOldComparables(auth.user.organizationId, parsed.data as OldComparableMonths) });
    }
    return NextResponse.json({ data: { items: await listTrash(auth.user.organizationId) } });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_TRASH_GET", error, "No se pudo leer la papelera de comparables.");
  }
}

/** «Borrar comparables viejos»: those older than the months chosen go to the trash; their numbers come back for «Deshacer». */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, trashSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await trashOldComparables(auth.user, body.data.months as OldComparableMonths) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_TRASH_OLD", error, "No se pudieron mandar a la papelera los comparables.");
  }
}

/** «Restaurar» or «Deshacer»: the numbers given (or all) are in the base again, as they were. */
export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, restoreSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await restoreFromTrash(auth.user, body.data.folios) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_TRASH_RESTORE", error, "No se pudieron restaurar los comparables.");
  }
}

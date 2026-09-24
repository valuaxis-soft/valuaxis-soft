import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { incomeInputSchema } from "@/features/valuations/calculation/income-schemas";
import { getIncomeCalculation, saveIncomeCalculation } from "@/features/valuations/calculation/income.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Income approach: rentable units, deductions and capitalization rate. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/ingresos">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getIncomeCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("INCOME_GET", error, "No se pudo cargar el enfoque de ingresos.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/ingresos">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, incomeInputSchema, { maxBytes: 200_000 });
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveIncomeCalculation(id, auth.user, body.data);
    return NextResponse.json({ data: await getIncomeCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("INCOME_SAVE", error, "No se pudo guardar el enfoque de ingresos.");
  }
}

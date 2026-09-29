import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { parseComparableRows, type ComparableImportPreview } from "@/features/valuations/calculation/comparable-import";
import { readSpreadsheet, SpreadsheetError } from "@/features/valuations/calculation/comparable-workbook";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, importComparables } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Reads an Excel or CSV of comparables. Without `confirmar=1` it only returns
 * the preview (each row with its errors); with it, it saves the valid rows.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/importar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const search = new URL(request.url).searchParams;
    const type = comparableTypeSchema.safeParse(search.get("tipo"));
    if (!type.success) return badRequest("Tipo de comparable inválido");
    const { id } = await params;
    // The valuation must be this organization's and still editable before any file is read.
    const valuation = await prisma.avaluo.findFirst({
      where: { UIdentificadorPublico: id, IdOrganizacion: auth.user.organizationId, BActivo: true, DFechaEliminacion: null },
      select: { BBloqueado: true },
    });
    if (!valuation) return NextResponse.json({ error: "Avalúo no encontrado" }, { status: 404 });
    if (valuation.BBloqueado) return NextResponse.json({ error: "El avalúo está concluido; reábrelo para editarlo." }, { status: 409 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return badRequest("No se envió ningún archivo.");

    const sheet = await readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
    const parsed = parseComparableRows(sheet, type.data);
    if (parsed.missingColumns.length) {
      return badRequest(`Falta la columna ${parsed.missingColumns.join(", ")}. Usa la plantilla de Valuaxis.`);
    }
    const preview: ComparableImportPreview = {
      rows: parsed.rows.map(({ row, errors, summary }) => ({ row, errors, ...summary })),
      valid: parsed.rows.filter((row) => row.payload).length,
      invalid: parsed.rows.filter((row) => !row.payload).length,
      tooManyRows: parsed.tooManyRows,
    };
    if (search.get("confirmar") !== "1") return NextResponse.json({ data: { preview } });

    const payloads = parsed.rows.flatMap((row) => (row.payload ? [row.payload] : []));
    if (!payloads.length) return badRequest("No hay comparables válidos para importar.");
    await importComparables(id, auth.user, type.data, payloads);
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: auth.user.organizationId,
      userId: auth.user.id,
      entity: "Avaluo",
      entityId: id,
      action: "COMPARABLES_IMPORT",
      result: "EXITOSO",
      metadata: { type: type.data, imported: payloads.length, skipped: preview.invalid, file: file.name },
    });
    return NextResponse.json({
      data: { preview, imported: payloads.length, calculation: await getMarketCalculation(id, auth.user.organizationId, type.data) },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SpreadsheetError) return badRequest(error.message);
    return valuationErrorResponse("COMPARABLES_IMPORT", error, "No se pudieron importar los comparables.");
  }
}

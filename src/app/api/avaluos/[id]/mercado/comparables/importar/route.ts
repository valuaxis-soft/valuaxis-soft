import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { readComparableFile, SpreadsheetError } from "@/features/valuations/calculation/comparable-workbook";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation } from "@/features/valuations/calculation/market.service";
import {
  ImportFileError,
  previewComparableImport,
  runComparableImport,
} from "@/features/valuations/comparable-base/comparable-import.service";
import { readImportForm } from "@/features/valuations/comparable-base/import-form";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Reads an Excel or CSV of comparables into this market: the template of the
 * market or the master workbook. Without `confirmar=1` it only returns the
 * preview (each row with its errors, warnings and destination); with it, it
 * saves the valid rows. Destination "Solo base general", and rows of another
 * market with "Ambos", go to the firm's base without the valuation.
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
      select: { BBloqueado: true, SFolio: true },
    });
    if (!valuation) return NextResponse.json({ error: "Avalúo no encontrado" }, { status: 404 });
    if (valuation.BBloqueado) return NextResponse.json({ error: "El avalúo está concluido; reábrelo para editarlo." }, { status: 409 });
    const form = readImportForm(await request.formData());
    if (!form.ok) return badRequest(form.error);

    const file = await readComparableFile(Buffer.from(await form.data.file.arrayBuffer()), form.data.file.name);
    const origin = { kind: "valuation" as const, valuationId: id, valuationFolio: valuation.SFolio, type: type.data };
    const options = { destination: form.data.destination, defaultType: type.data };
    if (search.get("confirmar") !== "1") {
      return NextResponse.json({ data: { preview: await previewComparableImport(auth.user, origin, file, options) } });
    }

    const summary = await runComparableImport(auth.user, origin, file, { ...options, reuse: form.data.reuse, merge: form.data.merge });
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: auth.user.organizationId,
      userId: auth.user.id,
      entity: "Avaluo",
      entityId: id,
      action: "COMPARABLES_IMPORT",
      result: "EXITOSO",
      metadata: {
        type: type.data, destination: summary.preview.destination, format: summary.preview.format, file: form.data.file.name,
        imported: summary.toValuations, base: summary.toBase, skipped: summary.preview.invalid + (summary.preview.skipped ?? 0),
        reused: Object.keys(form.data.reuse).length, merged: Object.keys(form.data.merge).length,
      },
    });
    return NextResponse.json({
      data: {
        preview: summary.preview,
        imported: summary.toValuations,
        base: summary.toBase,
        calculation: await getMarketCalculation(id, auth.user.organizationId, type.data),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SpreadsheetError || error instanceof ImportFileError) return badRequest(error.message);
    return valuationErrorResponse("COMPARABLES_IMPORT", error, "No se pudieron importar los comparables.");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { findDuplicates } from "@/features/valuations/calculation/comparable-card.service";
import { parseComparableRows, type ComparableImportPreview } from "@/features/valuations/calculation/comparable-import";
import { readSpreadsheet, SpreadsheetError } from "@/features/valuations/calculation/comparable-workbook";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, importComparables } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

const reuseSchema = z.record(z.string().regex(/^\d+$/), z.uuid());
const parseJson = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};
const badRequest =(error: string) => NextResponse.json({ error }, { status: 400 });

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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("No se envió ningún archivo.");
    // Rows the appraiser answered with "Usar el existente": {"<row>": "<comparable id>"}.
    const reuse = reuseSchema.safeParse(parseJson(form.get("reusar")));
    if (!reuse.success) return badRequest("Los comparables existentes elegidos no son válidos.");

    const sheet = await readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
    const parsed = parseComparableRows(sheet, type.data);
    if (parsed.missingColumns.length) {
      return badRequest(`Falta la columna ${parsed.missingColumns.join(", ")}. Usa la plantilla de Valuaxis.`);
    }
    // Each valid row is checked against the firm's base, as a comparable captured by hand is.
    const duplicates = new Map(await Promise.all(parsed.rows.flatMap((row) => (row.payload ? [row.payload] : [])
      .map(async (payload) => [row.row, await findDuplicates(id, auth.user.organizationId, payload)] as const))));
    const preview: ComparableImportPreview = {
      rows: parsed.rows.map(({ row, errors, summary }) => {
        const matches = (duplicates.get(row) ?? []).slice(0, 3);
        return {
          row, errors, ...summary,
          ...(matches.length ? {
            duplicates: matches.map((match) => ({ comparableId: match.comparableId, folio: match.folio, valuationFolio: match.valuation.folio, reasons: match.reasons })),
          } : {}),
        };
      }),
      valid: parsed.rows.filter((row) => row.payload).length,
      invalid: parsed.rows.filter((row) => !row.payload).length,
      tooManyRows: parsed.tooManyRows,
    };
    if (search.get("confirmar") !== "1") return NextResponse.json({ data: { preview } });

    const payloads = parsed.rows.flatMap((row) => {
      if (!row.payload) return [];
      // Only a comparable the preview offered for that row may be used instead of it.
      const chosen = reuse.data[String(row.row)];
      return [chosen && duplicates.get(row.row)?.some((match) => match.comparableId === chosen) ? { reuseFrom: chosen } : row.payload];
    });
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

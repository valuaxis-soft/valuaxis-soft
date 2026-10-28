import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { readComparableFile, SpreadsheetError } from "@/features/valuations/calculation/comparable-workbook";
import {
  ImportFileError,
  previewComparableImport,
  runComparableImport,
} from "@/features/valuations/comparable-base/comparable-import.service";
import { readImportForm } from "@/features/valuations/comparable-base/import-form";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * "Importar plantilla maestra" from the Comparables page: the master workbook (or a
 * market's template, with `tipo`). "Solo base general" keeps every row in the
 * firm's base without a valuation; "Ambos" and "Solo avalúo" add each row to
 * the valuation of its "Folio avalúo" (one of the organization the user can
 * edit), and with "Ambos" a row without a usable folio stays in the base.
 * Without `confirmar=1` it only returns the preview.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const form = readImportForm(await request.formData());
    if (!form.ok) return badRequest(form.error);

    const file = await readComparableFile(Buffer.from(await form.data.file.arrayBuffer()), form.data.file.name);
    const options = { destination: form.data.destination, defaultType: form.data.defaultType };
    if (new URL(request.url).searchParams.get("confirmar") !== "1") {
      return NextResponse.json({ data: { preview: await previewComparableImport(auth.user, { kind: "base" }, file, options) } });
    }

    const summary = await runComparableImport(auth.user, { kind: "base" }, file, { ...options, reuse: form.data.reuse, merge: form.data.merge });
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: auth.user.organizationId,
      userId: auth.user.id,
      entity: "Organizacion",
      entityId: String(auth.user.organizationId),
      action: "COMPARABLES_BASE_IMPORT",
      result: "EXITOSO",
      metadata: {
        destination: summary.preview.destination, format: summary.preview.format, file: form.data.file.name,
        toValuations: summary.toValuations, base: summary.toBase, markets: summary.markets,
        skipped: summary.preview.invalid + (summary.preview.skipped ?? 0),
      },
    });
    return NextResponse.json({
      data: { preview: summary.preview, imported: summary.toValuations, base: summary.toBase, markets: summary.markets },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SpreadsheetError || error instanceof ImportFileError) return badRequest(error.message);
    return valuationErrorResponse("COMPARABLES_BASE_IMPORT", error, "No se pudieron importar los comparables.");
  }
}

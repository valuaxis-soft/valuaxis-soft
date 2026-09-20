import { Prisma } from "@prisma/client";

const DEFAULT_VALUATION_PREFIX = "VLO";
const FOLIO_PADDING = 4;

type FolioTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

type ConsecutiveRow = {
  IUltimoConsecutivo: number;
};

export async function reserveNextValuationFolio(
  tx: FolioTransaction,
  organizationId: number,
  prefix = DEFAULT_VALUATION_PREFIX,
) {
  const rows = await tx.$queryRaw<ConsecutiveRow[]>(Prisma.sql`
    INSERT INTO "devpware_series_folios_organizaciones" (
      "IdOrganizacion",
      "SPrefijo",
      "IUltimoConsecutivo",
      "BActivo",
      "DFechaCreacion",
      "DFechaModificacion"
    )
    VALUES (${organizationId}, ${prefix}, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("IdOrganizacion", "SPrefijo")
    DO UPDATE SET
      "IUltimoConsecutivo" = "devpware_series_folios_organizaciones"."IUltimoConsecutivo" + 1,
      "BActivo" = TRUE,
      "DFechaModificacion" = CURRENT_TIMESTAMP
    RETURNING "IUltimoConsecutivo"
  `);

  const consecutive = rows[0]?.IUltimoConsecutivo;
  if (!Number.isSafeInteger(consecutive) || consecutive < 1) {
    throw new Error("No se pudo reservar el consecutivo del avaluo");
  }

  return formatValuationFolio(prefix, consecutive);
}

export function formatValuationFolio(prefix: string, consecutive: number) {
  return `${prefix}-${String(consecutive).padStart(FOLIO_PADDING, "0")}`;
}

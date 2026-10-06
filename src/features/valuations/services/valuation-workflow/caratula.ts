import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import {
  isValidityMonths,
  parseSignatures,
  validUntilDate,
  VALIDITY_MONTHS_ERROR,
} from "@/features/valuations/services/valuation-signatures";
import { normalizeCoverImageFocus } from "@/features/valuations/services/cover-image-focus";
import { ValuationWorkflowError } from "./errors";
import type { CaratulaPayload, Tx } from "./types";

export async function saveCaratula(input: {
  versionId: number;
  payload: CaratulaPayload;
  tx?: Tx;
}) {
  const client = input.tx ?? prisma;
  // Signatures are replaced only when the client sends the list. A missing cédula does not stop a save; it stops the conclusion.
  const signatures = input.payload.firmas === undefined ? null : parseSignatures(input.payload.firmas, { draft: true });
  if (signatures && !signatures.ok) throw new ValuationWorkflowError(signatures.error, 400);
  const months = input.payload.mesesVigencia ?? null;
  if (months !== null && !isValidityMonths(months)) throw new ValuationWorkflowError(VALIDITY_MONTHS_ERROR, 400);

  // The framing changes only when the client sends it, like the signatures.
  const focus = input.payload.enfoqueImagenPrincipal === undefined ? null : normalizeCoverImageFocus(input.payload.enfoqueImagenPrincipal);

  const data = {
    SNumeroAvaluo: cleanText(input.payload.numeroAvaluo),
    SFolio: cleanText(input.payload.folio),
    SNombreSolicitante: cleanText(input.payload.solicitante),
    SNombrePropietario: cleanText(input.payload.propietario),
    SObjetoAvaluo: cleanText(input.payload.objeto),
    SPropositoAvaluo: cleanText(input.payload.proposito),
    // The single-signer columns follow the first signature.
    SNombreValuador: signatures ? signatures.value[0]?.name ?? null : cleanText(input.payload.valuador),
    SRegistroValuador: signatures ? signatures.value[0]?.cedula ?? null : cleanText(input.payload.registroValuador),
    ...(signatures ? { JFirmas: signatures.value as unknown as Prisma.InputJsonValue } : {}),
    NValorTotal: toDecimal(input.payload.valorTotal),
    SValorConLetra: cleanText(input.payload.valorConLetra),
    DFechaAvaluo: toDate(input.payload.fechaAvaluo),
    IMesesVigencia: months,
    // With months, the validity date is the valuation date plus those months.
    DFechaVigencia: toDate(months === null ? input.payload.fechaVigencia : validUntilDate(input.payload.fechaAvaluo, months)),
    ...(focus ? { IEnfoqueImagenX: focus.x, IEnfoqueImagenY: focus.y } : {}),
  };

  await client.caratulaAvaluo.upsert({
    where: { IdVersionAvaluo: input.versionId },
    update: data,
    create: {
      IdVersionAvaluo: input.versionId,
      ...data,
    },
  });
}

function cleanText(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
}

function toDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[,$\s]/g, ""));
  return Number.isFinite(numeric) ? new Prisma.Decimal(numeric) : null;
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

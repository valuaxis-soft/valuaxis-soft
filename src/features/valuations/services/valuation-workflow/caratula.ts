import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { CaratulaPayload, Tx } from "./types";

export async function saveCaratula(input: {
  versionId: number;
  payload: CaratulaPayload;
  tx?: Tx;
}) {
  const client = input.tx ?? prisma;
  const data = {
    SNumeroAvaluo: cleanText(input.payload.numeroAvaluo),
    SFolio: cleanText(input.payload.folio),
    SNombreSolicitante: cleanText(input.payload.solicitante),
    SNombrePropietario: cleanText(input.payload.propietario),
    SObjetoAvaluo: cleanText(input.payload.objeto),
    SPropositoAvaluo: cleanText(input.payload.proposito),
    SNombreValuador: cleanText(input.payload.valuador),
    SRegistroValuador: cleanText(input.payload.registroValuador),
    NValorTotal: toDecimal(input.payload.valorTotal),
    SValorConLetra: cleanText(input.payload.valorConLetra),
    DFechaAvaluo: toDate(input.payload.fechaAvaluo),
    DFechaVigencia: toDate(input.payload.fechaVigencia),
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

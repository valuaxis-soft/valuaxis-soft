/**
 * «Borrar comparables viejos» (V8.8, 12:30: «opción de borrado masivo de
 * comparables muy viejos… de un año para atrás, de 6 meses, de 2 años»): the
 * comparables of the firm's base whose data are older than 6, 12 or 24 months
 * go to the trash, and come back with «Restaurar». Nothing is renumbered and
 * no number is given again («el día de mañana en un juicio… mantener siempre
 * el historial»): the trash only lists their numbers; the cards, the
 * valuations that used them and their dictámenes stay as they are.
 *
 * Without a migration: the trash is the firm's custom field
 * PAPELERA_COMPARABLES (JSON `{ items: [{ folio, trashedAt, by }] }`), read
 * by `firmBaseCondition`, so every list, search, map and duplicate check of
 * the base leaves those numbers out.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { asRecord } from "../calculation/access";
import { formatComparableId, todayInMexico } from "../calculation/comparable-card";
import { COMPARABLE_TRASH_FIELD_KEY } from "../comparable-search/own-base-sql";
import { LATEST_FROM, latestCapturesCte } from "./comparable-base.service";

/** How old the data of a comparable must be to go to the trash: the three ages the appraiser named. */
export const OLD_COMPARABLE_MONTHS = [6, 12, 24] as const;
export type OldComparableMonths = (typeof OLD_COMPARABLE_MONTHS)[number];

/** A number in the trash: when it went and who sent it. */
export type TrashedComparable = { folio: number; trashedAt: string; by: string | null };

const JSON_DATA_TYPE = "JSON";
const MAX_TRASHED = 20_000;

const fieldWhere = (organizationId: number) => ({ IdOrganizacion: organizationId, SClave: COMPARABLE_TRASH_FIELD_KEY, DFechaEliminacion: null });

/** The numbers in the trash, most recent first. */
export async function listTrash(organizationId: number): Promise<TrashedComparable[]> {
  const field = await prisma.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { JConfiguracion: true } });
  return trashItems(field?.JConfiguracion ?? null).sort((a, b) => b.trashedAt.localeCompare(a.trashedAt) || a.folio - b.folio);
}

function trashItems(stored: Prisma.JsonValue | null): TrashedComparable[] {
  const items = asRecord(stored).items;
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const record = asRecord(item as Prisma.JsonValue);
    return typeof record.folio === "number" && Number.isInteger(record.folio)
      ? [{ folio: record.folio, trashedAt: typeof record.trashedAt === "string" ? record.trashedAt : "", by: typeof record.by === "string" ? record.by : null }]
      : [];
  });
}

/** The first day that is not old: today minus the months, in Mexico. */
export function oldCutoff(months: OldComparableMonths, today = todayInMexico()) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 - months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

/** The numbers of the base whose most recent data are from before the cutoff, oldest first. */
async function oldFolios(organizationId: number, months: OldComparableMonths): Promise<number[]> {
  const cutoff = oldCutoff(months);
  const rows = await prisma.$queryRaw<Array<{ folio: number }>>(Prisma.sql`
    ${latestCapturesCte(organizationId)}
    SELECT p."IFolioComparable" AS "folio" ${LATEST_FROM}
    WHERE p."IFolioComparable" IS NOT NULL
      AND (c."DFechaActualizacionDatos" AT TIME ZONE 'America/Mexico_City')::date < ${cutoff}::date
    ORDER BY p."IFolioComparable" ASC
    LIMIT ${MAX_TRASHED}`);
  return rows.map((row) => Number(row.folio));
}

/** How many comparables «Borrar comparables viejos» would send to the trash, and the first numbers, to confirm. */
export async function previewOldComparables(organizationId: number, months: OldComparableMonths) {
  const folios = await oldFolios(organizationId, months);
  return { months, cutoff: oldCutoff(months), count: folios.length, sample: folios.slice(0, 12).map((folio) => formatComparableId(folio) ?? String(folio)) };
}

async function writeTrash(organizationId: number, items: TrashedComparable[]) {
  await prisma.$transaction(async (tx) => {
    const field = await tx.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { IdCampoPersonalizado: true } });
    const configuration = { items } as unknown as Prisma.InputJsonObject;
    if (field) {
      await tx.campoPersonalizado.update({ where: { IdCampoPersonalizado: field.IdCampoPersonalizado }, data: { JConfiguracion: configuration } });
      return;
    }
    const dataType = await tx.tipoDato.findUniqueOrThrow({ where: { SClave: JSON_DATA_TYPE }, select: { IdTipoDato: true } });
    await tx.campoPersonalizado.create({
      data: {
        IdOrganizacion: organizationId,
        IdTipoDato: dataType.IdTipoDato,
        SClave: COMPARABLE_TRASH_FIELD_KEY,
        SNombre: "Papelera de comparables",
        SDescripcion: "Números de comparables que el despacho mandó a la papelera («Borrar comparables viejos»); se restauran desde Comparables.",
        SSeccionSugerida: "COMPARABLES",
        JConfiguracion: configuration,
      },
    });
  });
}

/** Sends to the trash the comparables older than `months`; answers the numbers sent, for «Deshacer». */
export async function trashOldComparables(user: AuthUser, months: OldComparableMonths): Promise<{ folios: number[] }> {
  const folios = await oldFolios(user.organizationId, months);
  if (!folios.length) return { folios: [] };
  const current = await listTrash(user.organizationId);
  const known = new Set(current.map((item) => item.folio));
  const now = new Date().toISOString();
  const added = folios.filter((folio) => !known.has(folio)).map((folio) => ({ folio, trashedAt: now, by: user.name }));
  await writeTrash(user.organizationId, [...current, ...added].slice(0, MAX_TRASHED));
  await recordAuditEvent({
    typeKey: "ELIMINACION_LOGICA",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(user.organizationId),
    action: "COMPARABLES_TRASH_OLD",
    result: "EXITOSO",
    metadata: { months, count: added.length },
  });
  return { folios: added.map((item) => item.folio) };
}

/** «Restaurar»: the numbers given (or all) leave the trash and are in the base again, as they were. */
export async function restoreFromTrash(user: AuthUser, folios: number[] | "all"): Promise<{ restored: number }> {
  const current = await listTrash(user.organizationId);
  const wanted = folios === "all" ? null : new Set(folios);
  const kept = current.filter((item) => wanted !== null && !wanted.has(item.folio));
  await writeTrash(user.organizationId, kept);
  const restored = current.length - kept.length;
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(user.organizationId),
    action: "COMPARABLES_TRASH_RESTORE",
    result: "EXITOSO",
    metadata: { count: restored },
  });
  return { restored };
}

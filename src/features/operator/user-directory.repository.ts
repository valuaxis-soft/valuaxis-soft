/**
 * The directory of every person on the platform, for the operator
 * (/operador/usuarios). Who the person is, never what they made: the only
 * thing read from their valuations is how many they created and concluded.
 * No title, client, folio, address or link of a valuation leaves this module,
 * by design (the owner's lawyer: the operator has no access to that content).
 */
import type { Prisma } from "@prisma/client";
import { ACADEMIC_LEVEL_LABELS, toAccreditationStatus, type AccreditationStatus } from "@/features/accreditation/accreditation-rules";
import { prisma } from "@/infrastructure/database/prisma-client";
import { searchTerms, type UserDirectoryParams } from "./user-directory-params";

export type UserDirectoryMembership = {
  organization: string;
  /** «Personal» space or «Equipo». */
  kind: "PERSONAL" | "TEAM";
  role: string;
};

export type UserDirectoryEntry = {
  /** The public id of the person (never the numeric one). */
  publicId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** As the person typed it; not verified. */
  phone: string | null;
  /** The account is active (not deactivated nor deleted). */
  active: boolean;
  memberships: UserDirectoryMembership[];
  accreditation: AccreditationStatus;
  /** «Maestría», «Especialidad»… as the reviewer recorded it, when there is one. */
  accreditationLevel: string | null;
  signedUpAt: Date;
  lastAccessAt: Date | null;
  valuationsCreated: number;
  valuationsConcluded: number;
};

const ACCREDITED: AccreditationStatus = "ACREDITADO";

function whereFor(params: Pick<UserDirectoryParams, "q" | "accredited">): Prisma.UsuarioWhereInput {
  const and: Prisma.UsuarioWhereInput[] = searchTerms(params.q).map((term) => ({
    OR: [
      { SNombre: { contains: term, mode: "insensitive" } },
      { SApellidoPaterno: { contains: term, mode: "insensitive" } },
      { SApellidoMaterno: { contains: term, mode: "insensitive" } },
      { SCorreo: { contains: term, mode: "insensitive" } },
      { STelefono: { contains: term, mode: "insensitive" } },
    ],
  }));
  if (params.accredited === "si") and.push({ acreditacion: { is: { SEstado: ACCREDITED } } });
  if (params.accredited === "no") and.push({ OR: [{ acreditacion: { is: null } }, { acreditacion: { is: { SEstado: { not: ACCREDITED } } } }] });
  return and.length ? { AND: and } : {};
}

function orderFor(params: Pick<UserDirectoryParams, "sort" | "direction">): Prisma.UsuarioOrderByWithRelationInput[] {
  const tieBreak: Prisma.UsuarioOrderByWithRelationInput = { IdUsuario: params.direction };
  if (params.sort === "acceso") return [{ DFechaUltimoAcceso: { sort: params.direction, nulls: "last" } }, tieBreak];
  return [{ DFechaCreacion: params.direction }, tieBreak];
}

/** Only these columns are read: nothing of a valuation but the two counts. */
const directorySelect = {
  IdUsuario: true,
  UIdentificadorPublico: true,
  SNombre: true,
  SApellidoPaterno: true,
  SApellidoMaterno: true,
  SCorreo: true,
  BCorreoVerificado: true,
  STelefono: true,
  BActivo: true,
  DFechaEliminacion: true,
  DFechaCreacion: true,
  DFechaUltimoAcceso: true,
  acreditacion: { select: { SEstado: true, SNivelAcademico: true } },
  miembros: {
    where: { BActivo: true },
    orderBy: { DFechaIngreso: "asc" },
    select: {
      organizacion: { select: { SNombre: true, STipoAmbito: true } },
      rol: { select: { SNombre: true } },
    },
  },
  _count: {
    select: {
      avaluosCreados: true,
    },
  },
} satisfies Prisma.UsuarioSelect;

type DirectoryRow = Prisma.UsuarioGetPayload<{ select: typeof directorySelect }>;

/** How many of the valuations each person created are concluded. */
async function concludedCounts(userIds: number[]): Promise<Map<number, number>> {
  if (!userIds.length) return new Map();
  const groups = await prisma.avaluo.groupBy({
    by: ["IdUsuarioCreador"],
    where: { IdUsuarioCreador: { in: userIds }, DFechaConclusion: { not: null } },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.IdUsuarioCreador, group._count._all]));
}

function toEntry(row: DirectoryRow, concluded: Map<number, number>): UserDirectoryEntry {
  const level = row.acreditacion?.SNivelAcademico as keyof typeof ACADEMIC_LEVEL_LABELS | null | undefined;
  return {
    publicId: row.UIdentificadorPublico,
    name: [row.SNombre, row.SApellidoPaterno, row.SApellidoMaterno].filter(Boolean).join(" ").trim(),
    email: row.SCorreo,
    emailVerified: row.BCorreoVerificado,
    phone: row.STelefono?.trim() || null,
    active: row.BActivo && !row.DFechaEliminacion,
    memberships: row.miembros.map((member) => ({
      organization: member.organizacion.SNombre,
      kind: member.organizacion.STipoAmbito === "TEAM" ? "TEAM" : "PERSONAL",
      role: member.rol.SNombre,
    })),
    accreditation: toAccreditationStatus(row.acreditacion?.SEstado),
    accreditationLevel: level ? ACADEMIC_LEVEL_LABELS[level] ?? null : null,
    signedUpAt: row.DFechaCreacion,
    lastAccessAt: row.DFechaUltimoAcceso,
    valuationsCreated: row._count.avaluosCreados,
    valuationsConcluded: concluded.get(row.IdUsuario) ?? 0,
  };
}

async function readDirectory(params: Omit<UserDirectoryParams, "page">, skip: number, take: number) {
  const where = whereFor(params);
  const [rows, total] = await Promise.all([
    prisma.usuario.findMany({ where, orderBy: orderFor(params), skip, take, select: directorySelect }),
    prisma.usuario.count({ where }),
  ]);
  const concluded = await concludedCounts(rows.map((row) => row.IdUsuario));
  return { items: rows.map((row) => toEntry(row, concluded)), total };
}

export function listUserDirectoryPage(params: UserDirectoryParams, pageSize: number) {
  return readDirectory(params, (params.page - 1) * pageSize, pageSize);
}

/** Every page of the search, up to `limit` rows (the export). */
export function listUserDirectoryForExport(params: UserDirectoryParams, limit: number) {
  return readDirectory(params, 0, limit);
}

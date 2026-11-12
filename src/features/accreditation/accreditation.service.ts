import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { env } from "@/lib/env";
import { requiresUnaccreditedNotice, valuationIssuerUserId } from "./accreditation-notice";
import {
  ACADEMIC_LEVEL_LABELS,
  decideAccreditation,
  findSepVerificationLink,
  gradeProblem,
  storedGrade,
  toAccreditationStatus,
  type AcademicGrade,
  type AccreditationStatus,
  type AutomaticResult,
} from "./accreditation-rules";
import { hashCurp } from "./curp-hash";
import { detectUploadKind, readQrTexts, UnreadableUploadError } from "./qr-reader";
import { unavailableSepVerifier, type SepVerifier } from "./sep-verifier";

/**
 * Professional accreditation of a user (docs/ACREDITACION.md). An upload is
 * read here and thrown away: only the outcome, the folio, the CURP's hash and
 * what the SEP showed are kept, and the SEP link only while in review.
 */

export class AccreditationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "AccreditationError";
  }
}

/** 10 MB, the same as any upload. */
export const MAX_ACCREDITATION_UPLOAD_BYTES = 10 * 1024 * 1024;

export type AccreditationView = {
  status: AccreditationStatus;
  folio: string | null;
  cedulaNumber: string | null;
  sepName: string | null;
  automatic: AutomaticResult | null;
  reason: string | null;
  requestedAt: string | null;
  verifiedAt: string | null;
  /** The grade the reviewer recorded; null when none was (an account accredited before the rule). */
  grade: AcademicGrade | null;
  /** Accredited before the grade was recorded: the reviewer still has to confirm it (WA-03). */
  levelPending: boolean;
};

const NOT_ACCREDITED: AccreditationView = {
  status: "NO_ACREDITADO",
  folio: null,
  cedulaNumber: null,
  sepName: null,
  automatic: null,
  reason: null,
  requestedAt: null,
  verifiedAt: null,
  grade: null,
  levelPending: false,
};

type AccreditationRow = NonNullable<Awaited<ReturnType<typeof prisma.acreditacionUsuario.findUnique>>>;

function toView(row: AccreditationRow | null): AccreditationView {
  if (!row) return NOT_ACCREDITED;
  return {
    status: toAccreditationStatus(row.SEstado),
    folio: row.SFolio,
    cedulaNumber: row.SNumeroCedula,
    sepName: row.SNombreSep,
    automatic: (row.SResultadoAutomatico as AutomaticResult | null) ?? null,
    reason: row.SMotivo,
    requestedAt: row.DFechaSolicitud?.toISOString() ?? null,
    verifiedAt: row.DFechaVerificacion?.toISOString() ?? null,
    grade: storedGrade(row),
    levelPending: row.SEstado === "ACREDITADO" && !storedGrade(row),
  };
}

export async function getAccreditation(userId: number): Promise<AccreditationView> {
  return toView(await prisma.acreditacionUsuario.findUnique({ where: { IdUsuario: userId } }));
}

async function fullNameOf(userId: number) {
  const user = await prisma.usuario.findUniqueOrThrow({
    where: { IdUsuario: userId },
    select: { SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true },
  });
  return [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ");
}

/**
 * Reads the QR of an uploaded constancia (PDF or image) and records the
 * outcome: ACREDITADO when the SEP could confirm it, EN_REVISION otherwise. A
 * file without a SEP QR is refused and changes nothing. An accredited user
 * stays accredited: a new upload is refused.
 */
export async function submitAccreditation(input: {
  user: Pick<AuthUser, "id" | "organizationId">;
  bytes: Uint8Array;
  verifier?: SepVerifier;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<AccreditationView> {
  const { user } = input;
  const verifier = input.verifier ?? unavailableSepVerifier;
  if (input.bytes.length === 0) throw new AccreditationError("El archivo está vacío.");
  if (input.bytes.length > MAX_ACCREDITATION_UPLOAD_BYTES) throw new AccreditationError("El archivo pesa más de 10 MB.");

  const current = await prisma.acreditacionUsuario.findUnique({ where: { IdUsuario: user.id } });
  if (current?.SEstado === "ACREDITADO") throw new AccreditationError("Tu cuenta ya está acreditada.", 409);

  const kind = await detectUploadKind(input.bytes);
  if (!kind) throw new AccreditationError("Sube la constancia en PDF o una imagen (JPG, PNG o WebP) de su código QR.");
  let texts: string[];
  try {
    texts = await readQrTexts(input.bytes, kind);
  } catch (error) {
    if (error instanceof UnreadableUploadError) throw new AccreditationError(error.message);
    throw error;
  }
  const found = findSepVerificationLink(texts);
  if (!found.ok) throw new AccreditationError(found.reason);
  const { link } = found;

  const curpHash = hashCurp(link.curp, env.ACCREDITATION_HASH_SECRET || null);
  const [otherUser, userName, check] = await Promise.all([
    prisma.acreditacionUsuario.findFirst({
      where: { SCurpHash: curpHash, IdUsuario: { not: user.id }, SEstado: { in: ["ACREDITADO", "EN_REVISION"] } },
      select: { IdUsuario: true },
    }),
    fullNameOf(user.id),
    verifier(link),
  ]);
  const decision = decideAccreditation({
    userName,
    check,
    curpUsedByAnotherUser: Boolean(otherUser),
    previouslyRevoked: Boolean(current?.DFechaRevocacion),
  });

  const now = new Date();
  const read = check.kind === "read" ? check : null;
  const data = {
    SEstado: decision.status,
    SFolio: link.folio,
    SCurpHash: curpHash,
    SNumeroCedula: read?.cedulaNumber?.slice(0, 30) ?? null,
    SNombreSep: read?.name?.slice(0, 300) ?? null,
    // The link carries the CURP: kept only for the administrator who reviews it.
    SUrlVerificacion: decision.status === "EN_REVISION" ? link.url : null,
    SResultadoAutomatico: decision.automatic,
    SMotivo: decision.reason,
    SResueltoPor: decision.status === "ACREDITADO" ? "AUTOMATICO" : null,
    DFechaSolicitud: now,
    DFechaVerificacion: decision.status === "ACREDITADO" ? now : null,
    ...(decision.grade ? gradeColumns(decision.grade) : { SNivelAcademico: null, SProgramaAcademico: null, BProgramaValuacion: null }),
  };
  const row = await prisma.acreditacionUsuario.upsert({
    where: { IdUsuario: user.id },
    create: { IdUsuario: user.id, ...data },
    update: data,
  });

  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "ACREDITACION",
    entityId: String(user.id),
    action: "ACREDITACION_SOLICITUD",
    result: decision.status,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { folio: link.folio, automatico: decision.automatic },
  });
  return toView(row);
}

/* ------------------------------------------------------------------ */
/*  Manual review (scripts/ops/acreditacion.ts)                        */
/* ------------------------------------------------------------------ */

export type AccreditationDecisionKind = "approve" | "reject" | "revoke";

export type PendingAccreditation = {
  email: string;
  name: string;
  folio: string | null;
  url: string | null;
  automatic: string | null;
  reason: string | null;
  requestedAt: Date | null;
};

export async function listPendingAccreditations(): Promise<PendingAccreditation[]> {
  const rows = await prisma.acreditacionUsuario.findMany({
    where: { SEstado: "EN_REVISION" },
    orderBy: { DFechaSolicitud: "asc" },
    include: { usuario: { select: { SCorreo: true, SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true } } },
  });
  return rows.map((row) => ({
    email: row.usuario.SCorreo,
    name: [row.usuario.SNombre, row.usuario.SApellidoPaterno, row.usuario.SApellidoMaterno].filter(Boolean).join(" "),
    folio: row.SFolio,
    url: row.SUrlVerificacion,
    automatic: row.SResultadoAutomatico,
    reason: row.SMotivo,
    requestedAt: row.DFechaSolicitud,
  }));
}

/** Which states each decision applies to. */
const DECISION_FROM: Record<AccreditationDecisionKind, AccreditationStatus[]> = {
  approve: ["EN_REVISION"],
  reject: ["EN_REVISION"],
  revoke: ["ACREDITADO"],
};

/**
 * Approves or rejects a request in review, or revokes an accreditation. Both
 * resolutions erase the SEP link. With `apply: false` it only says what it
 * would do. `resolvedBy` names who decided, for the record.
 */
export async function resolveAccreditation(input: {
  email: string;
  decision: AccreditationDecisionKind;
  resolvedBy: string;
  reason?: string | null;
  /** Approving records the grade of the constancia: only a specialty, master's or doctorate in valuation approves (WA-03). */
  grade?: AcademicGrade | null;
  apply: boolean;
}): Promise<{ before: AccreditationStatus; after: AccreditationStatus; applied: boolean; userName: string }> {
  const user = await prisma.usuario.findFirst({
    where: { SCorreo: { equals: input.email.trim(), mode: "insensitive" } },
    select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true, acreditacion: true },
  });
  if (!user) throw new AccreditationError(`No existe un usuario con el correo ${input.email}.`, 404);
  const userName = [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ");
  const before = toAccreditationStatus(user.acreditacion?.SEstado);
  if (!DECISION_FROM[input.decision].includes(before)) {
    throw new AccreditationError(`La acreditación está ${before}: no se puede ${input.decision === "revoke" ? "revocar" : "resolver"}.`, 409);
  }
  if (input.decision === "approve") {
    if (!input.grade) throw new AccreditationError("Para aprobar, registra el nivel de la constancia y su programa (--nivel y --programa).");
    const problem = gradeProblem(input.grade);
    if (problem) throw new AccreditationError(`${problem} Recházala con ese motivo.`, 409);
  }
  const after: AccreditationStatus = input.decision === "approve" ? "ACREDITADO" : "RECHAZADO";
  if (!input.apply) return { before, after, applied: false, userName };

  const now = new Date();
  const reason = input.reason?.trim() || null;
  await prisma.acreditacionUsuario.update({
    where: { IdUsuario: user.IdUsuario },
    data: {
      SEstado: after,
      SUrlVerificacion: null,
      SResueltoPor: input.resolvedBy.slice(0, 180),
      SMotivo: input.decision === "approve" ? null : (input.decision === "revoke" ? `Revocada: ${reason ?? "sin motivo"}` : reason)?.slice(0, 500) ?? null,
      DFechaVerificacion: now,
      ...(input.decision === "revoke" ? { DFechaRevocacion: now } : {}),
      ...(input.decision === "approve" && input.grade ? gradeColumns(input.grade) : {}),
    },
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    userId: user.IdUsuario,
    entity: "ACREDITACION",
    entityId: String(user.IdUsuario),
    action: `ACREDITACION_${input.decision.toUpperCase()}`,
    result: after,
    metadata: { resueltoPor: input.resolvedBy, motivo: reason, ...(input.grade ? { nivel: input.grade.level, programa: input.grade.program } : {}) },
  });
  return { before, after, applied: true, userName };
}

const gradeColumns = (grade: AcademicGrade) => ({
  SNivelAcademico: grade.level,
  SProgramaAcademico: grade.program?.trim().slice(0, 300) || null,
  BProgramaValuacion: grade.valuationProgram,
});

export type AccreditedWithoutLevel = { email: string; name: string; folio: string | null; cedulaNumber: string | null; verifiedAt: Date | null; resolvedBy: string | null };

/**
 * Accounts accredited before the grade was recorded: «pendiente de confirmar
 * nivel». They keep their state and print as they did until the reviewer
 * confirms their grade; nothing here revokes them.
 */
export async function listAccreditedWithoutLevel(): Promise<AccreditedWithoutLevel[]> {
  const rows = await prisma.acreditacionUsuario.findMany({
    where: { SEstado: "ACREDITADO", SNivelAcademico: null },
    orderBy: { DFechaVerificacion: "asc" },
    include: { usuario: { select: { SCorreo: true, SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true } } },
  });
  return rows.map((row) => ({
    email: row.usuario.SCorreo,
    name: [row.usuario.SNombre, row.usuario.SApellidoPaterno, row.usuario.SApellidoMaterno].filter(Boolean).join(" "),
    folio: row.SFolio,
    cedulaNumber: row.SNumeroCedula,
    verifiedAt: row.DFechaVerificacion,
    resolvedBy: row.SResueltoPor,
  }));
}

/**
 * Records the grade of an account accredited before the rule, once the
 * reviewer checked its constancia. Only a grade that meets the rule is
 * recorded: one that does not (a licenciatura, a program in another field)
 * changes nothing and says so, because whether to revoke those accounts is
 * the client's decision, taken apart with «revocar».
 */
export async function confirmAccreditationLevel(input: {
  email: string;
  grade: AcademicGrade;
  resolvedBy: string;
  apply: boolean;
}): Promise<{ applied: boolean; userName: string; problem: string | null }> {
  const user = await prisma.usuario.findFirst({
    where: { SCorreo: { equals: input.email.trim(), mode: "insensitive" } },
    select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true, acreditacion: true },
  });
  if (!user) throw new AccreditationError(`No existe un usuario con el correo ${input.email}.`, 404);
  const userName = [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ");
  const row = user.acreditacion;
  if (row?.SEstado !== "ACREDITADO") throw new AccreditationError(`La cuenta no está acreditada (${toAccreditationStatus(row?.SEstado)}): su nivel se registra al aprobarla.`, 409);
  if (storedGrade(row)) throw new AccreditationError(`El nivel ya está registrado: ${ACADEMIC_LEVEL_LABELS[storedGrade(row)!.level]}.`, 409);
  const problem = gradeProblem(input.grade);
  if (problem || !input.apply) return { applied: false, userName, problem };

  await prisma.acreditacionUsuario.update({ where: { IdUsuario: user.IdUsuario }, data: gradeColumns(input.grade) });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    userId: user.IdUsuario,
    entity: "ACREDITACION",
    entityId: String(user.IdUsuario),
    action: "ACREDITACION_NIVEL",
    result: "ACREDITADO",
    metadata: { resueltoPor: input.resolvedBy, nivel: input.grade.level, programa: input.grade.program },
  });
  return { applied: true, userName, problem: null };
}

/* ------------------------------------------------------------------ */
/*  The notice in the documents                                        */
/* ------------------------------------------------------------------ */

/**
 * Whether the documents of a valuation print "DOCUMENTO SIN VALIDEZ OFICIAL":
 * when its issuer (responsible user, or the creator without one) is not
 * accredited. A valuation not found answers true: the notice is the safe side.
 */
export async function valuationRequiresUnaccreditedNotice(valuationPublicId: string, organizationId: number): Promise<boolean> {
  return (await valuationIssuerNotice(valuationPublicId, organizationId)).show;
}

/** The notice decision and who the issuer is, for the editor to say whose accreditation is missing. */
export async function valuationIssuerNotice(
  valuationPublicId: string,
  organizationId: number,
): Promise<{ show: boolean; issuerUserId: number | null }> {
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: valuationPublicId, IdOrganizacion: organizationId },
    select: { IdUsuarioResponsable: true, IdUsuarioCreador: true },
  });
  if (!valuation) return { show: true, issuerUserId: null };
  const issuerUserId = valuationIssuerUserId(valuation);
  const accreditation = await prisma.acreditacionUsuario.findUnique({
    where: { IdUsuario: issuerUserId },
    select: { SEstado: true, SNivelAcademico: true, SProgramaAcademico: true, BProgramaValuacion: true },
  });
  return {
    show: requiresUnaccreditedNotice(accreditation ? toAccreditationStatus(accreditation.SEstado) : null, accreditation ? storedGrade(accreditation) : null),
    issuerUserId,
  };
}

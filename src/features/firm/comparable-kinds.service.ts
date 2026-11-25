/**
 * The firm's own kinds of comparable («Retroexcavadora», «Granja»…): written
 * in the card, ticked, and offered in every list of kinds of the firm from
 * then on, as the units of measure are (24 Nov 2026).
 *
 * Without a migration: they live in the organization's JSON list of units
 * and lists (JUnidadesPersonalizadas), as `{ lista: "tipoComparable", clase,
 * nombre }` beside the units (strings) and the lists of features/firm/
 * firm-lists.ts, which keep the items they do not know when they write.
 */
import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import type { ComparableClass } from "@/features/valuations/calculation/comparable-classes";
import {
  addCustomKindTo,
  removeCustomKindFrom,
  resolveCustomKinds,
  withCustomKinds,
  type ComparableKind,
} from "@/features/valuations/calculation/comparable-kinds";
import { prisma } from "@/infrastructure/database/prisma-client";

type Client = Prisma.TransactionClient | typeof prisma;

const storedOf = async (client: Client, organizationId: number) =>
  (await client.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: organizationId }, select: { JUnidadesPersonalizadas: true } })).JUnidadesPersonalizadas;

/** The kinds the firm added, in the order it added them. */
export async function getCustomComparableKinds(organizationId: number, client: Client = prisma): Promise<ComparableKind[]> {
  return resolveCustomKinds(await storedOf(client, organizationId));
}

/** Writes the firm's kinds in its JSON list; its units and other lists stay as they are. */
async function writeKinds(tx: Prisma.TransactionClient, organizationId: number, stored: unknown, kinds: ComparableKind[]) {
  await tx.organizacion.update({
    where: { IdOrganizacion: organizationId },
    data: { JUnidadesPersonalizadas: withCustomKinds(stored, kinds) as Prisma.InputJsonValue },
  });
}

/**
 * Keeps a kind for the firm; one already in the list (Valuaxis's or the
 * firm's, however it was written) changes nothing. `kind` is the one the
 * comparable takes.
 */
export async function addCustomComparableKind(user: AuthUser, label: string, kindClass: ComparableClass) {
  const result = await prisma.$transaction(async (tx) => {
    const stored = await storedOf(tx, user.organizationId);
    const next = addCustomKindTo(resolveCustomKinds(stored), label, kindClass);
    if (next.added) await writeKinds(tx, user.organizationId, stored, next.kinds);
    return next;
  });
  if (result.added) {
    await recordAuditEvent({
      typeKey: "MODIFICACION",
      organizationId: user.organizationId,
      userId: user.id,
      entity: "Organizacion",
      entityId: String(user.organizationId),
      action: "COMPARABLE_KIND_ADD",
      result: "EXITOSO",
      metadata: { kind: result.kind?.label ?? null, class: kindClass },
    });
  }
  return { kinds: result.kinds, kind: result.kind };
}

/** Takes a kind out of the firm's list; the comparables that use it keep its name. */
export async function removeCustomComparableKind(user: AuthUser, key: string) {
  const result = await prisma.$transaction(async (tx) => {
    const stored = await storedOf(tx, user.organizationId);
    const next = removeCustomKindFrom(resolveCustomKinds(stored), key);
    if (next.removed) await writeKinds(tx, user.organizationId, stored, next.kinds);
    return next;
  });
  if (result.removed) {
    await recordAuditEvent({
      typeKey: "MODIFICACION",
      organizationId: user.organizationId,
      userId: user.id,
      entity: "Organizacion",
      entityId: String(user.organizationId),
      action: "COMPARABLE_KIND_REMOVE",
      result: "EXITOSO",
      metadata: { key },
    });
  }
  return { kinds: result.kinds };
}

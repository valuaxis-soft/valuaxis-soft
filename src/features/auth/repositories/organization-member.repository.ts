import { prisma } from "@/infrastructure/database/prisma-client";

export function listActiveMemberships(userId: number) {
  return prisma.miembroOrganizacion.findMany({
    where: {
      IdUsuario: userId,
      BActivo: true,
      organizacion: {
        BActivo: true,
        DFechaEliminacion: null,
      },
    },
    include: {
      organizacion: true,
      rol: {
        include: {
          permisos: {
            include: { permiso: true },
          },
        },
      },
    },
    orderBy: { IdMiembroOrganizacion: "asc" },
  });
}

/** The organization a login opens: the first team the user belongs to, else their personal space. */
export async function resolveSingleActiveMembership(userId: number) {
  const memberships = await listActiveMemberships(userId);
  return memberships.find((membership) => membership.organizacion.STipoAmbito === "TEAM") ?? memberships[0] ?? null;
}

export function findActiveMembership(
  userId: number,
  organization: { organizationId: number } | { organizationPublicId: string },
) {
  return prisma.miembroOrganizacion.findFirst({
    where: {
      IdUsuario: userId,
      BActivo: true,
      organizacion: {
        BActivo: true,
        DFechaEliminacion: null,
        ...("organizationId" in organization
          ? { IdOrganizacion: organization.organizationId }
          : { UIdentificadorPublico: organization.organizationPublicId }),
      },
    },
    include: {
      organizacion: true,
      rol: {
        include: {
          permisos: {
            include: { permiso: true },
          },
        },
      },
    },
  });
}

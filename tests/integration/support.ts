/**
 * Shared setup for integration tests. They run against the local database from
 * compose.dev.yml (pnpm test:integration) and never against production.
 */
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../src/features/auth/model";
import { prisma } from "../../src/infrastructure/database/prisma-client";

export { prisma };

export function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Integration tests only run against a local database (DATABASE_URL must point to localhost).");
  }
}

/** Creates an isolated organization, user and valuation for one test run. */
export async function createValuationFixture() {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8);
  const [userState, orgState, valuationState, appraisalType, propertyType, operationType] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
  ]);

  const organization = await prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      SNombre: `Prueba ${suffix}`,
      SSlug: `prueba-${suffix}`,
      STipoAmbito: "PERSONAL",
      DFechaModificacion: new Date(),
    },
  });
  const usuario = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: "Perito",
      SCorreo: `perito-${suffix}@example.test`,
      DFechaModificacion: new Date(),
    },
  });
  const valuation = await prisma.avaluo.create({
    data: {
      IdOrganizacion: organization.IdOrganizacion,
      IdUsuarioCreador: usuario.IdUsuario,
      IdEstadoAvaluo: valuationState.IdEstadoAvaluo,
      IdTipoAvaluo: appraisalType.IdTipoAvaluo,
      IdTipoInmueble: propertyType.IdTipoInmueble,
      IdTipoOperacion: operationType.IdTipoOperacion,
      SFolio: `TEST-${suffix}`,
      STitulo: "Avalúo de prueba",
      DFechaModificacion: new Date(),
    },
  });

  const user: AuthUser = {
    id: usuario.IdUsuario,
    name: "Perito",
    email: usuario.SCorreo,
    role: "ADMINISTRADOR",
    permissions: ["AVALUO_VER", "AVALUO_EDITAR"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };

  return { publicId: valuation.UIdentificadorPublico, organizationId: organization.IdOrganizacion, user };
}

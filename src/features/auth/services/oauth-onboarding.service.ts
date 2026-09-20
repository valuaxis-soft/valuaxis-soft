import type { Prisma } from "@prisma/client";
import { buildOrganizationSlug, buildPersonalOrganizationName } from "../rules/registration.rules";
import type { GoogleOAuthProfile } from "../providers/google-oauth.provider";

type Tx = Prisma.TransactionClient;

export async function createGoogleUserWithOnboarding(tx: Tx, profile: GoogleOAuthProfile, providerId: number) {
  const [userState] = await Promise.all([
    tx.estadoUsuario.findUnique({ where: { SClave: "ACTIVO" } }),
  ]);

  if (!userState) {
    throw new Error("AUTH_CATALOGS_MISSING");
  }

  const firstName = profile.givenName ?? profile.name ?? profile.email.split("@")[0];
  const lastName = profile.familyName ?? null;

  const user = await tx.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: firstName,
      SApellidoPaterno: lastName,
      SCorreo: profile.email,
      SImagenPerfil: profile.picture ?? null,
      BCorreoVerificado: true,
      DFechaVerificacionCorreo: new Date(),
    },
  });

  const identity = await tx.identidadUsuario.create({
    data: {
      IdUsuario: user.IdUsuario,
      IdProveedorIdentidad: providerId,
      SIdentificadorProveedor: profile.providerUserId,
      SCorreoProveedor: profile.email,
      SNombreProveedor: profile.name ?? `${firstName} ${lastName ?? ""}`.trim(),
      SImagenProveedor: profile.picture ?? null,
      BCorreoVerificadoProveedor: true,
      BPrincipal: true,
    },
  });

  const organization = await ensureUserOrganizationMembership(tx, {
    userId: user.IdUsuario,
    name: firstName,
    email: profile.email,
  });

  return { user, identity, createdOrganizationId: organization.IdOrganizacion };
}

export async function ensureUserOrganizationMembership(
  tx: Tx,
  input: { userId: number; name: string; email: string },
) {
  const existingMembership = await tx.miembroOrganizacion.findFirst({
    where: {
      IdUsuario: input.userId,
      BActivo: true,
      organizacion: {
        BActivo: true,
        DFechaEliminacion: null,
      },
    },
    include: { organizacion: true },
    orderBy: { IdMiembroOrganizacion: "asc" },
  });

  if (existingMembership) {
    return existingMembership.organizacion;
  }

  const [orgState, adminRole] = await Promise.all([
    tx.estadoOrganizacion.findUnique({ where: { SClave: "ACTIVA" } }),
    tx.rol.findUnique({ where: { SClave: "ADMINISTRADOR" } }),
  ]);

  if (!orgState || !adminRole) {
    throw new Error("AUTH_CATALOGS_MISSING");
  }

  const organizationName = buildPersonalOrganizationName(input.name);
  const organization = await tx.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      IdUsuarioPropietario: input.userId,
      SNombre: organizationName,
      SSlug: buildOrganizationSlug(organizationName),
      SCorreo: input.email,
      STipoAmbito: "PERSONAL",
    },
  });

  await tx.miembroOrganizacion.create({
    data: {
      IdOrganizacion: organization.IdOrganizacion,
      IdUsuario: input.userId,
      IdRol: adminRole.IdRol,
    },
  });

  return organization;
}

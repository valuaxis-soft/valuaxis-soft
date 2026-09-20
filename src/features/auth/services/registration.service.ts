import { prisma } from "@/infrastructure/database/prisma-client";
import { hashPassword } from "./password.service";
import { createEmailVerificationToken } from "./email-verification.service";
import { buildOrganizationSlug, buildPersonalOrganizationName } from "../rules/registration.rules";
import type { RegisterInput } from "../validations/register.schema";

export async function registerLocalUser(input: RegisterInput) {
  const existing = await prisma.usuario.findFirst({
    where: { SCorreo: input.email, DFechaEliminacion: null },
    include: {
      identidades: {
        where: { BActiva: true },
        include: { proveedorIdentidad: true },
      },
    },
  });

  if (existing) {
    const usesGoogle = existing.identidades.some((identity) => identity.proveedorIdentidad.SClave === "GOOGLE");
    return {
      ok: false as const,
      reason: usesGoogle && !existing.SContrasenaHash ? ("ACCOUNT_USES_GOOGLE" as const) : ("EMAIL_ALREADY_REGISTERED" as const),
    };
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const [userState, orgState, localProvider, adminRole] = await Promise.all([
      tx.estadoUsuario.findUnique({ where: { SClave: "ACTIVO" } }),
      tx.estadoOrganizacion.findUnique({ where: { SClave: "ACTIVA" } }),
      tx.proveedorIdentidad.findUnique({ where: { SClave: "LOCAL" } }),
      tx.rol.findUnique({ where: { SClave: "ADMINISTRADOR" } }),
    ]);

    if (!userState || !orgState || !localProvider || !adminRole) {
      throw new Error("AUTH_CATALOGS_MISSING");
    }

    const createdUser = await tx.usuario.create({
      data: {
        IdEstadoUsuario: userState.IdEstadoUsuario,
        SNombre: input.name,
        SApellidoPaterno: input.paternalLastName,
        SApellidoMaterno: input.maternalLastName ?? null,
        SCorreo: input.email,
        SContrasenaHash: passwordHash,
      },
    });

    await tx.identidadUsuario.create({
      data: {
        IdUsuario: createdUser.IdUsuario,
        IdProveedorIdentidad: localProvider.IdProveedorIdentidad,
        SIdentificadorProveedor: input.email,
        SCorreoProveedor: input.email,
        SNombreProveedor: `${input.name} ${input.paternalLastName}`.trim(),
        BPrincipal: true,
        BCorreoVerificadoProveedor: false,
      },
    });

    const organizationName = input.organizationName || buildPersonalOrganizationName(input.name);
    const organization = await tx.organizacion.create({
      data: {
        IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
        IdUsuarioPropietario: createdUser.IdUsuario,
        SNombre: organizationName,
        SSlug: buildOrganizationSlug(organizationName),
        SCorreo: input.email,
        STipoAmbito: "PERSONAL",
      },
    });

    await tx.miembroOrganizacion.create({
      data: {
        IdOrganizacion: organization.IdOrganizacion,
        IdUsuario: createdUser.IdUsuario,
        IdRol: adminRole.IdRol,
      },
    });

    return createdUser;
  });

  try {
    await createEmailVerificationToken({
      userId: user.IdUsuario,
      email: user.SCorreo,
      name: user.SNombre,
    });
  } catch {
    // Email verification failure should not block registration
  }

  return { ok: true as const, userId: user.IdUsuario };
}

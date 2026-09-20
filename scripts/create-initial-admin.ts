import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/features/auth/services/password.service";
import { buildOrganizationSlug } from "../src/features/auth/rules/registration.rules";

const prisma = new PrismaClient();

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

async function main() {
  const email = required("INITIAL_ADMIN_EMAIL").toLowerCase();
  const password = required("INITIAL_ADMIN_PASSWORD");
  const name = required("INITIAL_ADMIN_NAME");
  const organizationName = required("INITIAL_ORGANIZATION_NAME");
  const verifyEmail = process.env.INITIAL_ADMIN_EMAIL_VERIFIED === "true";

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const [userState, orgState, localProvider, adminRole] = await Promise.all([
      tx.estadoUsuario.findUnique({ where: { SClave: "ACTIVO" } }),
      tx.estadoOrganizacion.findUnique({ where: { SClave: "ACTIVA" } }),
      tx.proveedorIdentidad.findUnique({ where: { SClave: "LOCAL" } }),
      tx.rol.findUnique({ where: { SClave: "ADMINISTRADOR" } }),
    ]);

    if (!userState || !orgState || !localProvider || !adminRole) {
      throw new Error("Faltan catalogos requeridos: ACTIVO, ACTIVA, LOCAL o ADMINISTRADOR.");
    }

    const user =
      (await tx.usuario.findFirst({ where: { SCorreo: email, DFechaEliminacion: null } })) ??
      (await tx.usuario.create({
        data: {
          IdEstadoUsuario: userState.IdEstadoUsuario,
          SNombre: name,
          SCorreo: email,
          SContrasenaHash: passwordHash,
          BCorreoVerificado: verifyEmail,
          DFechaVerificacionCorreo: verifyEmail ? new Date() : null,
        },
      }));

    const organization =
      (await tx.organizacion.findFirst({
        where: { SNombre: organizationName, DFechaEliminacion: null },
      })) ??
      (await tx.organizacion.create({
        data: {
          IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
          IdUsuarioPropietario: user.IdUsuario,
          SNombre: organizationName,
          SSlug: buildOrganizationSlug(organizationName),
          SCorreo: email,
          STipoAmbito: "PERSONAL",
        },
      }));

    await tx.identidadUsuario.upsert({
      where: {
        IdUsuario_IdProveedorIdentidad: {
          IdUsuario: user.IdUsuario,
          IdProveedorIdentidad: localProvider.IdProveedorIdentidad,
        },
      },
      create: {
        IdUsuario: user.IdUsuario,
        IdProveedorIdentidad: localProvider.IdProveedorIdentidad,
        SIdentificadorProveedor: email,
        SCorreoProveedor: email,
        SNombreProveedor: name,
        BPrincipal: true,
        BCorreoVerificadoProveedor: verifyEmail,
      },
      update: {
        SCorreoProveedor: email,
        SNombreProveedor: name,
        BActiva: true,
        DFechaDesvinculacion: null,
      },
    });

    await tx.miembroOrganizacion.upsert({
      where: {
        IdOrganizacion_IdUsuario: {
          IdOrganizacion: organization.IdOrganizacion,
          IdUsuario: user.IdUsuario,
        },
      },
      create: {
        IdOrganizacion: organization.IdOrganizacion,
        IdUsuario: user.IdUsuario,
        IdRol: adminRole.IdRol,
      },
      update: {
        IdRol: adminRole.IdRol,
        BActivo: true,
      },
    });

    return {
      userId: user.IdUsuario,
      organizationId: organization.IdOrganizacion,
      emailVerified: verifyEmail,
    };
  });

  console.info("Administrador inicial listo", {
    email,
    userId: result.userId,
    organizationId: result.organizationId,
    emailVerified: result.emailVerified,
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

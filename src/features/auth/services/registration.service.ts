import { prisma } from "@/infrastructure/database/prisma-client";
import { appendConsentLog } from "@/features/legal/consent-log.repository";
import { documentRefs, registrationFormRecord, type ConsentRequestContext } from "@/features/legal/consent.service";
import type { LegalVersion } from "@/features/legal/legal-document.repository";
import { grantTrialCredits } from "@/features/billing/credits.service";
import { hashPassword } from "./password.service";
import { createEmailVerificationToken } from "./email-verification.service";
import { buildOrganizationSlug, buildPersonalOrganizationName } from "../rules/registration.rules";
import type { RegisterInput } from "../validations/register.schema";

/**
 * Creates the account with its personal space and, in the same transaction,
 * the log entry of its acceptance (event ALTA, matrix 3.2): no account exists
 * without the evidence of what it accepted.
 */
export async function registerLocalUser(input: RegisterInput, legal: { versions: readonly LegalVersion[]; context: ConsentRequestContext }) {
  const existing = await prisma.usuario.findFirst({
    // Deleted accounts included: the email stays unique, so it cannot be registered again.
    where: { SCorreo: input.email },
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
        STelefono: input.phone,
        JPerfilProfesional: { cedula: input.cedula ?? null, especialidad: input.specialty },
      },
    });

    await appendConsentLog(tx, {
      userId: createdUser.IdUsuario,
      email: input.email,
      event: "ALTA",
      method: "LOCAL",
      documents: documentRefs(legal.versions),
      boxes: { privacidad: true, terminos: true, mayorDeEdad: true, ...input.consents.optional },
      form: registrationFormRecord(input),
      ...legal.context,
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
    // The free trial of a new account: three Avalúos Disponibles for a month (docs/COBRO.md).
    await grantTrialCredits(tx, organization.IdOrganizacion);

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

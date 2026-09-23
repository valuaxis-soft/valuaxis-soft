/**
 * Creates a logged-in user with a valuation in the local database and prints
 * the session cookie and valuation id, for manual end-to-end checks against a
 * running server. Local database only.
 *   pnpm exec tsx --env-file=.env tests/integration/e2e-session.helper.ts
 */
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma } from "./support";

async function createE2eSession() {
  const fixture = await createValuationFixture();
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } });
  await prisma.usuario.update({ where: { IdUsuario: fixture.user.id }, data: { BCorreoVerificado: true, DFechaVerificacionCorreo: new Date() } });
  await prisma.miembroOrganizacion.create({
    data: {
      IdOrganizacion: fixture.organizationId,
      IdUsuario: fixture.user.id,
      IdRol: role.IdRol,
      DFechaModificacion: new Date(),
    },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      // Close to expiring, so the next authorized request must renew it.
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  console.log(JSON.stringify({ token, publicId: fixture.publicId }));
  await prisma.$disconnect();
}

void createE2eSession();

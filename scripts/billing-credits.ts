/**
 * Credit ledger administration for one organization, until there is a UI
 * for it. The organization is named by slug or by public id (UUID).
 *   pnpm billing:credits balance <org>
 *   pnpm billing:credits adjust <org> <credits> "<reason>"   (positive grants, negative removes)
 *   pnpm billing:credits enforce <org> on|off                (BCobroPorAvaluo: block concluding without balance)
 * Works against any database: it is the way to grant courtesy credits and to
 * turn the per-appraisal charge on in production, one organization at a time.
 */
import { adjustCredits, getCreditBalance, listCreditMovements, setCreditEnforcement } from "../src/features/billing/credits.service";
import { prisma } from "../src/infrastructure/database/prisma-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOrganization(selector: string | undefined) {
  if (!selector) throw new Error("Falta la organización (slug o id público).");
  const organization = await prisma.organizacion.findFirst({
    where: UUID.test(selector) ? { UIdentificadorPublico: selector } : { SSlug: selector },
    select: { IdOrganizacion: true, SNombre: true, SSlug: true, BCobroPorAvaluo: true },
  });
  if (!organization) throw new Error(`No existe la organización "${selector}".`);
  return organization;
}

async function main() {
  const [command, selector, ...rest] = process.argv.slice(2);
  if (!["balance", "adjust", "enforce"].includes(command ?? "")) {
    throw new Error("Comando: balance <org> | adjust <org> <créditos> <motivo> | enforce <org> on|off");
  }
  const organization = await findOrganization(selector);
  const header = `${organization.SNombre} (${organization.SSlug}) — cobro por avalúo ${organization.BCobroPorAvaluo ? "activo" : "inactivo"}`;

  switch (command) {
    case "balance": {
      console.log(header);
      console.log(`Saldo: ${await getCreditBalance(organization.IdOrganizacion)} avalúos`);
      for (const movement of await listCreditMovements(organization.IdOrganizacion, 20)) {
        console.log(`  ${movement.createdAt}  ${movement.credits > 0 ? "+" : ""}${movement.credits}  ${movement.typeLabel}  ${movement.valuation?.folio ?? movement.description ?? ""}`);
      }
      return;
    }
    case "adjust": {
      const credits = Number(rest[0]);
      const reason = rest.slice(1).join(" ");
      if (!Number.isInteger(credits) || credits === 0) throw new Error("Los créditos deben ser un entero distinto de cero.");
      if (!reason.trim()) throw new Error("Falta el motivo del ajuste.");
      const { balance } = await adjustCredits({ organizationId: organization.IdOrganizacion, credits, reason });
      console.log(header);
      console.log(`Ajuste de ${credits > 0 ? "+" : ""}${credits} registrado. Saldo: ${balance} avalúos`);
      return;
    }
    case "enforce": {
      const value = rest[0];
      if (value !== "on" && value !== "off") throw new Error("Indica on u off.");
      await setCreditEnforcement(organization.IdOrganizacion, value === "on");
      console.log(`${organization.SNombre} (${organization.SSlug}) — cobro por avalúo ${value === "on" ? "activado" : "desactivado"}`);
      return;
    }
    default:
      throw new Error("Comando: balance <org> | adjust <org> <créditos> <motivo> | enforce <org> on|off");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

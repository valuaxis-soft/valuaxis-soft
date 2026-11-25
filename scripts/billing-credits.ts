/**
 * Credit ledger administration for one organization, until there is a UI
 * for it. The organization is named by slug or by public id (UUID).
 *   pnpm billing:credits balance <org>
 *   pnpm billing:credits adjust <org> <credits> "<reason>"   (positive grants, negative removes)
 *   pnpm billing:credits enforce <org> on|off                (BCobroPorAvaluo: block creating without balance)
 *   pnpm billing:credits payment <org> <avalúos> transferencia|deposito "<referencia>"
 *       (a transfer or cash deposit confirmed in the bank: credits the Avalúos Disponibles at the
 *        current unit price, once per reference, and emails the confirmation with the balance)
 * Works against any database: it is the way to grant courtesy credits, record
 * offline payments and turn the per-appraisal charge on in production, one
 * organization at a time.
 */
import { recordOfflinePayment } from "../src/features/billing/credit-packages.service";
import { adjustCredits, getCreditSummary, listCreditMovements, PAYMENT_METHODS, setCreditEnforcement } from "../src/features/billing/credits.service";
import { prisma } from "../src/infrastructure/database/prisma-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = 'Comando: balance <org> | adjust <org> <créditos> <motivo> | enforce <org> on|off | payment <org> <avalúos> transferencia|deposito "<referencia>"';

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
  if (!["balance", "adjust", "enforce", "payment"].includes(command ?? "")) throw new Error(USAGE);
  const organization = await findOrganization(selector);
  const header = `${organization.SNombre} (${organization.SSlug}) — cobro por avalúo ${organization.BCobroPorAvaluo ? "activo" : "inactivo"}`;

  switch (command) {
    case "balance": {
      const summary = await getCreditSummary(organization.IdOrganizacion);
      console.log(header);
      console.log(`Saldo: ${summary.balance} avalúos (pagados: ${summary.paid})`);
      if (summary.trial) {
        console.log(`Prueba: ${summary.trial.available} de ${summary.trial.granted} disponibles, ${summary.trial.expired ? "venció" : "vence"} ${summary.trial.expiresAt.toISOString()}`);
      }
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
    case "payment": {
      const credits = Number(rest[0]);
      const method = rest[1]?.toLowerCase() === "transferencia" ? PAYMENT_METHODS.transfer : rest[1]?.toLowerCase() === "deposito" ? PAYMENT_METHODS.deposit : null;
      const reference = rest.slice(2).join(" ");
      if (!method) throw new Error("La forma de pago es transferencia o deposito.");
      const result = await recordOfflinePayment({ organizationId: organization.IdOrganizacion, credits, method, reference });
      console.log(header);
      console.log(
        result.credited
          ? `Pago registrado: +${credits} avalúos por $${result.purchase.amount.toFixed(2)} (${method}, ${reference}). Saldo: ${result.balance} avalúos. Se envió la confirmación por correo.`
          : `Ese pago (${method}, ${reference}) ya estaba registrado: no se abonó de nuevo. Saldo: ${result.balance} avalúos.`,
      );
      return;
    }
    default:
      throw new Error(USAGE);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

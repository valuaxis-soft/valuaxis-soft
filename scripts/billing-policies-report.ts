/**
 * What the commercial policies (cobro al crear, prueba gratuita) mean for
 * each organization already in the database, before and after deploying
 * them. Read-only by default: it grants nothing and removes nothing.
 *
 *   pnpm billing:policies-report            (simulación: un renglón por organización)
 *   pnpm billing:policies-report --apply    (solo escribe el vencimiento de pruebas ya vencidas)
 *
 * Per organization: the charge flag, the balance, the free trial (only
 * accounts registered since the policies have one), the open valuations
 * created before the change and never charged (they are charged when
 * concluded, as before) and the valuations concluded before the credit
 * ledger existed (never charged; reopening them does not charge either).
 * Inside the production container:
 *   node --import tsx scripts/billing-policies-report.ts [--apply]
 */
import { CREDIT_MOVEMENT_TYPES } from "../src/features/billing/credit-rules";
import { getCreditSummary, writeTrialExpiry } from "../src/features/billing/credits.service";
import { prisma } from "../src/infrastructure/database/prisma-client";

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--apply");
  if (unknown.length) throw new Error(`Opción desconocida: ${unknown.join(" ")}. Usa --apply para escribir vencimientos; sin opciones solo muestra.`);
  const apply = args.includes("--apply");
  const now = new Date();

  const organizations = await prisma.organizacion.findMany({
    where: { DFechaEliminacion: null },
    select: { IdOrganizacion: true, SNombre: true, SSlug: true, BCobroPorAvaluo: true, BActivo: true },
    orderBy: { IdOrganizacion: "asc" },
  });
  console.log(`${apply ? "APLICAR" : "SIMULACIÓN"} · ${now.toISOString()} · ${organizations.length} organizaciones`);
  console.log("Nadie recibe ni pierde avalúos disponibles por el cambio. La prueba gratuita es solo para cuentas nuevas.");

  let pendingAtConclusion = 0;
  let expiries = 0;
  for (const organization of organizations) {
    const uncharged = { IdOrganizacion: organization.IdOrganizacion, DFechaEliminacion: null, movimientosCreditos: { none: { STipo: CREDIT_MOVEMENT_TYPES.consumption } } };
    const [summary, openUncharged, concludedUncharged] = await Promise.all([
      getCreditSummary(organization.IdOrganizacion, prisma, now),
      // Never concluded and never charged: the first conclusion charges, as before the change.
      prisma.avaluo.count({ where: { ...uncharged, BActivo: true, IdVersionFinal: null, DFechaConclusion: null } }),
      // Concluded before the ledger: never charged, and reopening does not charge.
      prisma.avaluo.count({ where: { ...uncharged, OR: [{ IdVersionFinal: { not: null } }, { DFechaConclusion: { not: null } }] } }),
    ]);
    pendingAtConclusion += openUncharged;
    const trial = summary.trial
      ? `prueba ${summary.trial.available}/${summary.trial.granted} ${summary.trial.expired ? "vencida" : "vigente"} hasta ${summary.trial.expiresAt.toISOString().slice(0, 10)}`
      : "sin prueba (cuenta anterior)";
    console.log(
      [
        `${organization.SNombre} (${organization.SSlug})${organization.BActivo ? "" : " [inactiva]"}`,
        `cobro ${organization.BCobroPorAvaluo ? "ACTIVO: sin saldo no puede crear" : "inactivo: nada se bloquea"}`,
        `saldo ${summary.balance} (pagados ${summary.paid})`,
        trial,
        `${openUncharged} abiertos sin cobrar → se cobran al concluir`,
        `${concludedUncharged} concluidos antes del libro → no se cobran`,
      ].join(" · "),
    );
    const pending = summary.trial?.pendingExpiry ?? 0;
    if (pending > 0) {
      expiries += pending;
      if (apply) await writeTrialExpiry(organization.IdOrganizacion, now);
      console.log(`    ${apply ? "Escrito" : "Por escribir"}: vencimiento de ${pending} avalúos de prueba sin usar (el saldo mostrado ya los descuenta).`);
    }
  }
  console.log(`Total: ${pendingAtConclusion} avalúos abiertos se cobrarán al concluirse; ${expiries} avalúos de prueba vencidos ${apply ? "dados de baja" : "por dar de baja"}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

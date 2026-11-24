/**
 * Says, per folio, what the change of format would do to the valuations that
 * are not concluded (src/features/valuations/services/layout-refresh.ts),
 * without writing anything. The change itself is made by the editor when the
 * valuation is opened (or with «Actualizar formato»): there it is one step of
 * «Deshacer» and the calculation writes its pages again with the current
 * format. Prints folios and what changes, never the client's data.
 *
 *   pnpm valuations:refresh-layout --dry-run         every organization
 *   pnpm valuations:refresh-layout --org <id>        only that organization
 *   pnpm valuations:refresh-layout --policy new      as VALUATION_LAYOUT_REFRESH=new would do it
 *
 * Inside the production container: node --import tsx scripts/ops/actualizar-formato.ts --dry-run
 */
import { LAYOUT_VERSION, layoutRefreshPolicy } from "../../src/features/valuations/services/layout-refresh";
import { planLayoutRefreshes } from "../../src/features/valuations/services/layout-refresh.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

function parseArgs(argv: string[]) {
  let organizationId: number | null = null;
  let policy = process.env.VALUATION_LAYOUT_REFRESH;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--org") organizationId = Number.parseInt(argv[++index] ?? "", 10) || null;
    else if (arg === "--policy") policy = argv[++index];
    else if (arg === "--apply") {
      console.error("No hay --apply: el cambio lo hace el editor al abrir el avalúo (con «Deshacer»). Ver docs/OPERACION.md.");
      process.exit(2);
    }
  }
  return { organizationId, policy: layoutRefreshPolicy(policy) };
}

async function main() {
  const { organizationId, policy } = parseArgs(process.argv.slice(2));
  console.log(`Formato actual: versión ${LAYOUT_VERSION}. Política: ${policy === "all" ? "all (todos los no concluidos al abrir)" : "new (solo los creados después de cada cambio)"}.\n`);
  const { plans, concluded } = await planLayoutRefreshes({ policy, organizationId });
  let onOpen = 0;
  let withButton = 0;
  for (const plan of plans) {
    const name = `[org ${plan.organizationId}] ${plan.folio} (formato v${plan.version})`;
    if (!plan.withButton.length) {
      console.log(`${name}: al día.`);
      continue;
    }
    const counts = `${plan.withButton.filter((change) => change.kind === "concept-added").length} concepto(s) agregado(s), ${plan.withButton.filter((change) => change.kind === "concept-keyed").length} ligado(s) al cálculo, ${plan.withButton.filter((change) => change.kind === "block-added").length} bloque(s) agregado(s)`;
    const when = plan.onOpen.length ? "al abrirlo" : "solo con «Actualizar formato»";
    if (plan.onOpen.length) onOpen += 1;
    else withButton += 1;
    console.log(`${name}: ${when} — ${plan.summary.join(" ")} (${counts}).`);
  }
  console.log(`\nDry run: ${plans.length} avalúo(s) no concluido(s) revisado(s); ${onOpen} cambiarían al abrirse, ${withButton} solo con el botón. ${concluded} concluido(s) no se tocan.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

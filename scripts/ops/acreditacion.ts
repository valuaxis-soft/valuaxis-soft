/**
 * Manual review of professional accreditations (docs/ACREDITACION.md), until
 * there is a platform administrator role with a screen for it. Every decision
 * is a dry run unless --apply is given.
 *
 *   pnpm accreditation:review pendientes
 *   pnpm accreditation:review estado   <correo>
 *   pnpm accreditation:review aprobar  <correo>             [--por "<quién>"] [--apply]
 *   pnpm accreditation:review rechazar <correo> "<motivo>"  [--por "<quién>"] [--apply]
 *   pnpm accreditation:review revocar  <correo> "<motivo>"  [--por "<quién>"] [--apply]
 *
 * Inside the production container: node --import tsx scripts/ops/acreditacion.ts <comando> …
 *
 * "pendientes" prints the SEP link of each request: open it in a browser (the
 * SEP shows the result after its reCAPTCHA) and compare the name and the
 * cédula with the account before approving. Approving or rejecting erases
 * the link from the database.
 */
import {
  getAccreditation,
  listPendingAccreditations,
  resolveAccreditation,
  type AccreditationDecisionKind,
} from "../../src/features/accreditation/accreditation.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

const DECISIONS: Record<string, AccreditationDecisionKind> = { aprobar: "approve", rechazar: "reject", revocar: "revoke" };
const USAGE = "Comando: pendientes | estado <correo> | aprobar <correo> | rechazar <correo> <motivo> | revocar <correo> <motivo>  [--por <quién>] [--apply]";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let apply = false;
  let by = "operador";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--por") by = argv[++index] ?? by;
    else positional.push(arg);
  }
  return { positional, apply, by };
}

async function main() {
  const { positional, apply, by } = parseArgs(process.argv.slice(2));
  const [command, email, ...reasonWords] = positional;

  if (command === "pendientes") {
    const pending = await listPendingAccreditations();
    if (!pending.length) console.log("No hay solicitudes en revisión.");
    for (const item of pending) {
      console.log(`${item.email} — ${item.name}`);
      console.log(`  Folio ${item.folio ?? "?"} · enviada ${item.requestedAt?.toISOString() ?? "?"} · automática: ${item.automatic ?? "?"}`);
      if (item.reason) console.log(`  Motivo de revisión: ${item.reason}`);
      console.log(`  Verificar en la SEP: ${item.url ?? "(sin enlace)"}`);
    }
    return;
  }

  if (!email) throw new Error(USAGE);

  if (command === "estado") {
    const user = await prisma.usuario.findFirst({ where: { SCorreo: { equals: email.trim(), mode: "insensitive" } }, select: { IdUsuario: true } });
    if (!user) throw new Error(`No existe un usuario con el correo ${email}.`);
    console.log(JSON.stringify(await getAccreditation(user.IdUsuario), null, 2));
    return;
  }

  const decision = DECISIONS[command ?? ""];
  if (!decision) throw new Error(USAGE);
  const reason = reasonWords.join(" ").trim();
  if (decision !== "approve" && !reason) throw new Error("Falta el motivo.");

  const result = await resolveAccreditation({ email, decision, reason, resolvedBy: by, apply });
  const line = `${email} (${result.userName}): ${result.before} → ${result.after}`;
  console.log(result.applied ? `Aplicado. ${line}` : `SIMULACIÓN (--apply para escribir). ${line}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

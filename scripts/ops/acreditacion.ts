/**
 * Manual review of professional accreditations (docs/ACREDITACION.md), until
 * there is a platform administrator role with a screen for it. Every decision
 * is a dry run unless --apply is given.
 *
 *   pnpm accreditation:review pendientes
 *   pnpm accreditation:review estado   <correo>
 *   pnpm accreditation:review aprobar  <correo> --nivel <nivel> --programa "<programa>" [--valuacion si|no] [--por "<quién>"] [--apply]
 *   pnpm accreditation:review rechazar <correo> "<motivo>"  [--por "<quién>"] [--apply]
 *   pnpm accreditation:review revocar  <correo> "<motivo>"  [--por "<quién>"] [--apply]
 *   pnpm accreditation:review sin-nivel
 *   pnpm accreditation:review confirmar-nivel <correo> --nivel <nivel> --programa "<programa>" [--valuacion si|no] [--por "<quién>"] [--apply]
 *
 * Inside the production container: node --import tsx scripts/ops/acreditacion.ts <comando> …
 *
 * "pendientes" prints the SEP link of each request: open it in a browser (the
 * SEP shows the result after its reCAPTCHA) and compare the name, the cédula
 * and the grade with the account before approving. Approving or rejecting
 * erases the link from the database.
 *
 * The notice is removed only by a specialty, master's or doctorate in
 * valuation (WA-03): approving records the level (licenciatura, especialidad,
 * maestria, doctorado) and the program; a licenciatura or a program in
 * another field is refused, to be rejected with that reason. "sin-nivel"
 * lists the accounts accredited before that rule and "confirmar-nivel"
 * records their grade; neither changes their state.
 */
import {
  ACADEMIC_LEVELS,
  ACADEMIC_LEVEL_LABELS,
  looksLikeValuationProgram,
  parseAcademicLevel,
  type AcademicGrade,
} from "../../src/features/accreditation/accreditation-rules";
import {
  confirmAccreditationLevel,
  getAccreditation,
  listAccreditedWithoutLevel,
  listPendingAccreditations,
  resolveAccreditation,
  type AccreditationDecisionKind,
} from "../../src/features/accreditation/accreditation.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

const DECISIONS: Record<string, AccreditationDecisionKind> = { aprobar: "approve", rechazar: "reject", revocar: "revoke" };
const LEVELS = ACADEMIC_LEVELS.map((level) => level.toLowerCase()).join(" | ");
const USAGE = [
  "Comando: pendientes | estado <correo> | aprobar <correo> --nivel <nivel> --programa <programa> | rechazar <correo> <motivo>",
  "         | revocar <correo> <motivo> | sin-nivel | confirmar-nivel <correo> --nivel <nivel> --programa <programa>",
  `         [--valuacion si|no] [--por <quién>] [--apply]   (nivel: ${LEVELS})`,
].join("\n");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let apply = false;
  let by = "operador";
  let level: string | null = null;
  let program: string | null = null;
  let valuation: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--por") by = argv[++index] ?? by;
    else if (arg === "--nivel") level = argv[++index] ?? null;
    else if (arg === "--programa") program = argv[++index] ?? null;
    else if (arg === "--valuacion") valuation = argv[++index] ?? null;
    else positional.push(arg);
  }
  return { positional, apply, by, level, program, valuation };
}

/** The grade as typed: the level, the program, and whether it is in valuation (said, or read from the program's name). */
function gradeOf(args: { level: string | null; program: string | null; valuation: string | null }): AcademicGrade {
  const level = parseAcademicLevel(args.level);
  if (!level) throw new Error(`Falta --nivel (${LEVELS}).`);
  const program = args.program?.trim() || null;
  if (!program) throw new Error("Falta --programa con el nombre del programa como lo dice la constancia.");
  const said = args.valuation?.trim().toLowerCase();
  if (said && !["si", "sí", "no"].includes(said)) throw new Error("--valuacion es si o no.");
  return { level, program, valuationProgram: said ? said !== "no" : looksLikeValuationProgram(program) };
}

const describe = (grade: AcademicGrade) =>
  `${ACADEMIC_LEVEL_LABELS[grade.level]} · «${grade.program ?? ""}» · ${grade.valuationProgram ? "en valuación" : "no es en valuación"}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { positional, apply, by } = args;
  const [command, email, ...reasonWords] = positional;

  if (command === "pendientes") {
    const pending = await listPendingAccreditations();
    if (!pending.length) console.log("No hay solicitudes en revisión.");
    for (const item of pending) {
      console.log(`${item.email} — ${item.name}`);
      console.log(`  Folio ${item.folio ?? "?"} · enviada ${item.requestedAt?.toISOString() ?? "?"} · automática: ${item.automatic ?? "?"}`);
      if (item.reason) console.log(`  Motivo de revisión: ${item.reason}`);
      console.log(`  Verificar en la SEP: ${item.url ?? "(sin enlace)"}`);
      console.log("  Al aprobar, registra el nivel y el programa: solo especialidad, maestría o doctorado en valuación quitan la leyenda.");
    }
    return;
  }

  if (command === "sin-nivel") {
    const accounts = await listAccreditedWithoutLevel();
    if (!accounts.length) console.log("Todas las cuentas acreditadas tienen su nivel registrado.");
    else console.log(`${accounts.length} cuenta(s) acreditada(s) con el nivel pendiente de confirmar (siguen acreditadas y sin leyenda):`);
    for (const item of accounts) {
      console.log(`${item.email} — ${item.name}`);
      console.log(`  Folio ${item.folio ?? "?"} · cédula ${item.cedulaNumber ?? "?"} · acreditada ${item.verifiedAt?.toISOString() ?? "?"} por ${item.resolvedBy ?? "?"}`);
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

  if (command === "confirmar-nivel") {
    const grade = gradeOf(args);
    const result = await confirmAccreditationLevel({ email, grade, resolvedBy: by, apply });
    if (result.problem) {
      console.log(`Sin cambios. ${email} (${result.userName}): ${describe(grade)}.`);
      console.log(`  ${result.problem}`);
      console.log("  La cuenta sigue acreditada: qué hacer con ella lo decide el cliente (revocar <correo> <motivo> --apply).");
      return;
    }
    const line = `${email} (${result.userName}): nivel ${describe(grade)}`;
    console.log(result.applied ? `Aplicado. ${line}` : `SIMULACIÓN (--apply para escribir). ${line}`);
    return;
  }

  const decision = DECISIONS[command ?? ""];
  if (!decision) throw new Error(USAGE);
  const reason = reasonWords.join(" ").trim();
  if (decision !== "approve" && !reason) throw new Error("Falta el motivo.");
  const grade = decision === "approve" ? gradeOf(args) : null;

  const result = await resolveAccreditation({ email, decision, reason, grade, resolvedBy: by, apply });
  const line = `${email} (${result.userName}): ${result.before} → ${result.after}${grade ? ` · ${describe(grade)}` : ""}`;
  console.log(result.applied ? `Aplicado. ${line}` : `SIMULACIÓN (--apply para escribir). ${line}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

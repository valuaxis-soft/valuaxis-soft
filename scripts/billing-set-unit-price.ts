/**
 * Publishes the price of one valuation agreed with the owner: the package
 * "1 avalúo" (SClave AVALUO_1), 1 credit, $170.00 MXN before tax + 16% IVA,
 * active and public. Idempotent: it creates the row or brings it back to
 * these values, and leaves everything else alone (other packages, the Stripe
 * price id). It never calls Stripe: `pnpm stripe:sync` (or the next purchase)
 * creates the Stripe price once there are keys (docs/COBRO.md).
 *
 *   pnpm billing:set-unit-price             (dry run: prints what it would do)
 *   pnpm billing:set-unit-price --apply     (writes)
 *
 * Inside the production container:
 *   node --import tsx scripts/billing-set-unit-price.ts [--apply]
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma-client";

const UNIT_PACKAGE = {
  SClave: "AVALUO_1",
  SNombre: "1 avalúo",
  SDescripcion: "Un avalúo: se descuenta al concluirlo por primera vez. $170.00 MXN + IVA (16%).",
  ICreditos: 1,
  SMoneda: "MXN",
  NImporte: new Prisma.Decimal("170.00"),
  NImpuestoPorcentaje: new Prisma.Decimal("16"),
  BActivo: true,
  BEsPublico: true,
  IOrden: 10,
} as const;

type Row = Awaited<ReturnType<typeof prisma.paqueteCreditos.findUnique>>;

const FIELDS = ["SNombre", "SDescripcion", "ICreditos", "SMoneda", "NImporte", "NImpuestoPorcentaje", "BActivo", "BEsPublico", "IOrden"] as const;

const show = (value: unknown) => (value instanceof Prisma.Decimal ? value.toFixed(2) : JSON.stringify(value));

function differences(row: NonNullable<Row>) {
  return FIELDS.filter((field) => {
    const current = row[field];
    const wanted = UNIT_PACKAGE[field];
    return wanted instanceof Prisma.Decimal ? !(current instanceof Prisma.Decimal && current.equals(wanted)) : current !== wanted;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length) throw new Error(`Opción desconocida: ${unknown.join(" ")}. Usa --apply para escribir; sin opciones solo muestra lo que haría.`);
  const apply = args.includes("--apply") && !args.includes("--dry-run");

  const total = UNIT_PACKAGE.NImporte.mul(UNIT_PACKAGE.NImpuestoPorcentaje.div(100).plus(1)).toFixed(2);
  console.log(`${apply ? "APLICAR" : "SIMULACIÓN (--apply para escribir)"}: ${UNIT_PACKAGE.SClave} = ${UNIT_PACKAGE.ICreditos} avalúo por $${UNIT_PACKAGE.NImporte.toFixed(2)} MXN + ${UNIT_PACKAGE.NImpuestoPorcentaje.toFixed(0)}% IVA (total $${total})`);

  const current = await prisma.paqueteCreditos.findUnique({ where: { SClave: UNIT_PACKAGE.SClave } });
  if (!current) {
    console.log("No existe: se creará.");
  } else {
    const changed = differences(current);
    if (!changed.length) {
      console.log("Ya existe con estos valores: no hay nada que cambiar.");
    } else {
      console.log("Existe; se actualizará:");
      for (const field of changed) console.log(`  ${field}: ${show(current[field])} → ${show(UNIT_PACKAGE[field])}`);
      if (changed.includes("NImporte") && current.SIdentificadorExterno) {
        console.log("  (El precio de Stripe guardado se reemplaza en la siguiente sincronización: se crea uno nuevo y se archiva el anterior.)");
      }
    }
  }

  const others = await prisma.paqueteCreditos.findMany({
    where: { SClave: { not: UNIT_PACKAGE.SClave }, BActivo: true, BEsPublico: true },
    orderBy: [{ IOrden: "asc" }],
    select: { SClave: true, ICreditos: true, NImporte: true },
  });
  if (others.length) {
    console.log("Otros paquetes activos y públicos (no se tocan):");
    for (const other of others) console.log(`  ${other.SClave}: ${other.ICreditos} avalúos por $${other.NImporte.toFixed(2)}`);
  }

  if (!apply) return;
  if (current && !differences(current).length) return;
  const { SClave, ...data } = UNIT_PACKAGE;
  await prisma.paqueteCreditos.upsert({ where: { SClave }, create: { SClave, ...data }, update: data });
  console.log("Listo. Falta crear su precio en Stripe con `pnpm stripe:sync` cuando haya llaves (docs/COBRO.md).");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * DEVELOPMENT ONLY. Inserts the four tentative credit packages (prices in MXN
 * before tax, as the owner quoted them on 9 Oct 2026) so the purchase flow
 * can be tried before the real prices are decided. Refuses to run against
 * anything but a local database. Idempotent.
 *   pnpm billing:example-packages
 */
import { prisma } from "../src/infrastructure/database/prisma-client";

const EXAMPLES = [
  { key: "EJEMPLO_1_AVALUO", name: "1 avalúo (solo pruebas)", credits: 1, amount: "150.00", order: 10 },
  { key: "EJEMPLO_10_AVALUOS", name: "Paquete de 10 (solo pruebas)", credits: 10, amount: "1400.00", order: 20 },
  { key: "EJEMPLO_30_AVALUOS", name: "Paquete de 30 (solo pruebas)", credits: 30, amount: "3750.00", order: 30 },
  { key: "EJEMPLO_100_AVALUOS", name: "Paquete de 100 (solo pruebas)", credits: 100, amount: "11000.00", order: 40 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Los paquetes de ejemplo solo se insertan en una base local (DATABASE_URL debe apuntar a localhost).");
  }
  for (const example of EXAMPLES) {
    const data = {
      SNombre: example.name,
      SDescripcion: "Paquete de ejemplo para probar el cobro. No es un precio real.",
      ICreditos: example.credits,
      SMoneda: "MXN",
      NImporte: example.amount,
      NImpuestoPorcentaje: "16",
      BActivo: true,
      BEsPublico: true,
      IOrden: example.order,
    };
    await prisma.paqueteCreditos.upsert({ where: { SClave: example.key }, create: { SClave: example.key, ...data }, update: data });
    console.log(`${example.key}: ${example.credits} avalúos por $${example.amount} MXN + 16% IVA`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

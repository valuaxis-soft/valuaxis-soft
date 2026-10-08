/**
 * DEVELOPMENT ONLY. Inserts two example plans with monthly prices in MXN so
 * the billing flow can be tried before the real plans and prices are decided.
 * Refuses to run against anything but a local database. Idempotent.
 *   pnpm billing:example-plans
 */
import { prisma } from "../src/infrastructure/database/prisma-client";

const EXAMPLES = [
  {
    key: "EJEMPLO_BASICO",
    name: "Ejemplo Básico (solo pruebas)",
    description: "Plan de ejemplo para probar el cobro. No es un plan real.",
    order: 90,
    trialDays: null,
    priceKey: "EJEMPLO_BASICO_MXN_MES",
    amount: "499.00",
  },
  {
    key: "EJEMPLO_DESPACHO",
    name: "Ejemplo Despacho (solo pruebas)",
    description: "Plan de ejemplo con 7 días de prueba. No es un plan real.",
    order: 91,
    trialDays: 7,
    priceKey: "EJEMPLO_DESPACHO_MXN_MES",
    amount: "1499.00",
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Los planes de ejemplo solo se insertan en una base local (DATABASE_URL debe apuntar a localhost).");
  }
  for (const example of EXAMPLES) {
    const planData = {
      SNombre: example.name,
      SDescripcion: example.description,
      BEsGratuito: false,
      BEsPublico: true,
      BPermitePrueba: example.trialDays !== null,
      IDiasPrueba: example.trialDays,
      BActivo: true,
      IOrden: example.order,
    };
    const plan = await prisma.plan.upsert({ where: { SClave: example.key }, create: { SClave: example.key, ...planData }, update: planData });
    const priceData = { IdPlan: plan.IdPlan, SMoneda: "MXN", SIntervaloCobro: "MES", IIntervalos: 1, NImporte: example.amount, NImpuestoPorcentaje: "16", BActivo: true };
    await prisma.precioPlan.upsert({ where: { SClave: example.priceKey }, create: { SClave: example.priceKey, ...priceData }, update: priceData });
    console.log(`${example.key}: $${example.amount} MXN + 16% IVA al mes`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

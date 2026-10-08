/**
 * Publishes the sellable plans to Stripe (products and prices) and keeps
 * Valuaxis' customer portal configuration up to date. Idempotent: run it after
 * creating or changing a plan or a price.
 *   pnpm stripe:sync
 * Prints ids only, never keys.
 */
import { ensurePortalConfiguration, syncBillingCatalog } from "../src/features/billing/billing-catalog.service";
import { getBillingGateway } from "../src/features/billing/billing-gateway-provider";
import { BILLING_PAGE_PATH } from "../src/features/billing/billing.service";
import { prisma } from "../src/infrastructure/database/prisma-client";
import { buildPublicAppUrl } from "../src/lib/public-url";

async function main() {
  const gateway = await getBillingGateway();
  if (!gateway) throw new Error("Falta STRIPE_SECRET_KEY: no hay nada que sincronizar.");

  const report = await syncBillingCatalog(gateway);
  if (report.products.length === 0) console.log("No hay planes de pago publicados con precio vigente en MXN.");
  for (const product of report.products) console.log(`Plan ${product.plan}: producto ${product.productId} (${product.action})`);
  for (const price of report.prices) console.log(`Precio ${price.price}: ${price.priceId} (${price.action})`);

  const configured = process.env.STRIPE_PORTAL_CONFIGURATION?.trim() || null;
  const portal = await ensurePortalConfiguration(gateway, configured, buildPublicAppUrl(BILLING_PAGE_PATH).toString());
  console.log(`Portal de clientes: ${portal.id} (${portal.action})`);
  if (!configured) console.log(`Agrega a las variables de entorno: STRIPE_PORTAL_CONFIGURATION="${portal.id}"`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * The plans an organization can buy, and their mirror in Stripe. Plans and
 * prices are rows of the database (Plan, PrecioPlan); nothing here is
 * hardcoded. A plan is sold when it is active, public and not free, and has
 * an active recurring price in MXN that is in force today.
 */
import { prisma } from "@/infrastructure/database/prisma-client";
import type { BillingGateway, GatewayPrice } from "./billing-gateway";
import {
  BILLING_CURRENCY,
  BILLING_STATEMENT_DESCRIPTOR,
  billingPeriodLabel,
  isValuaxisObject,
  priceBreakdown,
  priceSyncDecision,
  stripeInterval,
  stripeLookupKey,
  stripeProductId,
  valuaxisMetadata,
  type DesiredPrice,
} from "./billing-rules";

export async function findSellablePlans(options: { planId?: number } = {}, now = new Date()) {
  const plans = await prisma.plan.findMany({
    where: { BActivo: true, BEsPublico: true, BEsGratuito: false, DFechaEliminacion: null, ...(options.planId ? { IdPlan: options.planId } : {}) },
    include: {
      precios: {
        where: {
          BActivo: true,
          SMoneda: BILLING_CURRENCY,
          SIntervaloCobro: { in: ["DIA", "SEMANA", "MES", "ANO"] },
          DFechaVigenciaInicio: { lte: now },
          OR: [{ DFechaVigenciaFin: null }, { DFechaVigenciaFin: { gt: now } }],
        },
        orderBy: [{ NImporte: "asc" }, { IdPrecioPlan: "asc" }],
      },
    },
    orderBy: [{ IOrden: "asc" }, { IdPlan: "asc" }],
  });
  return plans.filter((plan) => plan.precios.length > 0);
}

export type CatalogSyncReport = {
  products: Array<{ plan: string; productId: string; action: "created" | "updated" | "unchanged" }>;
  prices: Array<{ price: string; priceId: string; action: "created" | "replaced" | "unchanged" }>;
};

/** Stripe objects that hold our id or key but not our tag belong to someone else: stop instead of touching them. */
class ForeignStripeObjectError extends Error {
  constructor(kind: string, id: string) {
    super(`Stripe ${kind} ${id} is not tagged app=valuaxis; refusing to modify it.`);
    this.name = "ForeignStripeObjectError";
  }
}

/**
 * Makes Stripe match the sellable plans: one Product per plan and one Price
 * per PrecioPlan, whose id is stored in PrecioPlan.SIdentificadorExterno.
 * Idempotent: a second run changes nothing. An existing Price is never
 * edited; a changed amount, tax, currency or interval creates a new Price and
 * archives the old one (subscriptions already on it keep it).
 */
export async function syncBillingCatalog(gateway: BillingGateway, options: { planId?: number } = {}): Promise<CatalogSyncReport> {
  const report: CatalogSyncReport = { products: [], prices: [] };

  for (const plan of await findSellablePlans(options)) {
    const productId = stripeProductId(plan.UIdentificadorPublico);
    const wanted = { name: plan.SNombre, description: plan.SDescripcion?.trim() || null, statementDescriptor: BILLING_STATEMENT_DESCRIPTOR };
    const product = await gateway.retrieveProduct(productId);
    if (!product) {
      await gateway.createProduct({ id: productId, ...wanted, metadata: valuaxisMetadata({ plan: plan.SClave }) });
      report.products.push({ plan: plan.SClave, productId, action: "created" });
    } else {
      if (!isValuaxisObject(product.metadata)) throw new ForeignStripeObjectError("product", productId);
      const same =
        product.active && product.name === wanted.name && product.description === wanted.description && product.statementDescriptor === wanted.statementDescriptor;
      if (!same) await gateway.updateProduct(productId, { ...wanted, active: true });
      report.products.push({ plan: plan.SClave, productId, action: same ? "unchanged" : "updated" });
    }

    for (const price of plan.precios) {
      const interval = stripeInterval(price.SIntervaloCobro);
      if (!interval) continue;
      const desired: DesiredPrice = {
        productId,
        currency: price.SMoneda.toLowerCase(),
        unitAmount: priceBreakdown(price.NImporte, price.NImpuestoPorcentaje).unitAmount,
        interval,
        intervalCount: price.IIntervalos,
      };
      const lookupKey = stripeLookupKey(price.UIdentificadorPublico);
      let existing: GatewayPrice | null = price.SIdentificadorExterno ? await gateway.retrievePrice(price.SIdentificadorExterno) : null;
      existing ??= await gateway.findPriceByLookupKey(lookupKey);
      if (existing && !isValuaxisObject(existing.metadata)) throw new ForeignStripeObjectError("price", existing.id);

      const decision = priceSyncDecision(
        existing && existing.unitAmount !== null && existing.interval && existing.intervalCount
          ? { ...existing, unitAmount: existing.unitAmount, interval: existing.interval, intervalCount: existing.intervalCount }
          : null,
        desired,
      );
      let priceId = existing?.id ?? "";
      if (decision !== "keep") {
        const created = await gateway.createPrice({
          ...desired,
          lookupKey,
          nickname: `${plan.SNombre} ${billingPeriodLabel(price.SIntervaloCobro, price.IIntervalos)}`.trim(),
          metadata: valuaxisMetadata({
            plan: plan.SClave,
            precio: price.UIdentificadorPublico,
            importe: price.NImporte.toFixed(2),
            impuesto_porcentaje: price.NImpuestoPorcentaje.toString(),
          }),
        });
        if (existing?.active) await gateway.archivePrice(existing.id);
        priceId = created.id;
      }
      if (price.SIdentificadorExterno !== priceId) {
        await prisma.precioPlan.update({ where: { IdPrecioPlan: price.IdPrecioPlan }, data: { SIdentificadorExterno: priceId } });
      }
      report.prices.push({ price: price.SClave, priceId, action: !existing ? "created" : decision === "keep" ? "unchanged" : "replaced" });
    }
  }
  return report;
}

/**
 * Valuaxis' own customer portal configuration: update the card, see the
 * invoices, switch between the sellable prices and cancel at the end of the
 * period. The account's default configuration belongs to whoever set it up in
 * the dashboard (the shop), so it is left alone. Returns the id to put in
 * STRIPE_PORTAL_CONFIGURATION.
 */
export async function ensurePortalConfiguration(gateway: BillingGateway, configurationId: string | null, returnUrl: string) {
  const plans = await findSellablePlans();
  const input = {
    headline: "Valuaxis: administra tu suscripción",
    returnUrl,
    products: plans
      .map((plan) => ({
        productId: stripeProductId(plan.UIdentificadorPublico),
        priceIds: plan.precios.flatMap((price) => (price.SIdentificadorExterno ? [price.SIdentificadorExterno] : [])),
      }))
      .filter((product) => product.priceIds.length > 0),
    metadata: valuaxisMetadata(),
  };
  if (!configurationId) return { id: (await gateway.createPortalConfiguration(input)).id, action: "created" as const };
  const existing = await gateway.retrievePortalConfiguration(configurationId);
  if (!existing) throw new Error(`Portal configuration ${configurationId} does not exist in this Stripe account.`);
  if (!isValuaxisObject(existing.metadata)) throw new ForeignStripeObjectError("portal configuration", configurationId);
  await gateway.updatePortalConfiguration(configurationId, input);
  return { id: configurationId, action: "updated" as const };
}

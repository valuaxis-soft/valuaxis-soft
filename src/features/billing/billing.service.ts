/**
 * Plan y facturación: what the organization has, what it can buy, and the two
 * doors into Stripe (hosted Checkout to subscribe, the customer portal to
 * manage the card, the invoices and the cancellation).
 *
 * Nothing here blocks the app: plan limits and paid-only features are not
 * enforced yet. `paidUse` only tells the page which notice to show.
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { env } from "@/lib/env";
import { buildPublicAppUrl } from "@/lib/public-url";
import { findSellablePlans, syncBillingCatalog } from "./billing-catalog.service";
import type { BillingGateway } from "./billing-gateway";
import {
  BILLING_PROVIDER,
  allowsPaidUse,
  billingPeriodLabel,
  isValuaxisObject,
  priceBreakdown,
  subscriptionStateLabel,
  valuaxisMetadata,
} from "./billing-rules";
import { findBillingCustomer, findBillingProvider, refreshOrganizationSubscription } from "./subscription-sync.service";

export const BILLING_PAGE_PATH = "/organizacion/facturacion";

/** A failure the user can read and act on; anything else is an internal error. */
export class BillingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export type BillingPriceDto = {
  id: string;
  /** Before tax, the tax and what is charged each period, in MXN. */
  subtotal: number;
  tax: number;
  total: number;
  taxPercent: number;
  periodLabel: string;
  /** The price the organization is subscribed to right now. */
  current: boolean;
};

export type BillingPlanDto = {
  id: string;
  name: string;
  description: string | null;
  /** Free trial days a first subscription gets, or null. */
  trialDays: number | null;
  prices: BillingPriceDto[];
};

export type BillingOverviewDto = {
  /** False when Stripe is not configured: the page explains it and offers nothing to buy. */
  enabled: boolean;
  current: {
    planName: string;
    stateKey: string;
    stateLabel: string;
    /** A subscription paid through Stripe, as opposed to the free base plan. */
    paid: boolean;
    paidUse: boolean;
    priceLabel: string | null;
    trialEndsAt: string | null;
    periodEndsAt: string | null;
    /** Set when the subscription will end instead of renewing. */
    cancelsAt: string | null;
    graceEndsAt: string | null;
  } | null;
  plans: BillingPlanDto[];
};

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

async function findCurrentSubscription(organizationId: number) {
  return prisma.suscripcion.findFirst({
    where: { IdOrganizacion: organizationId, DFechaFinalizacion: null },
    include: { plan: true, precioPlan: true, estadoSuscripcion: true },
    orderBy: { DFechaInicio: "desc" },
  });
}

/** A current subscription Stripe is still charging (or trying to). */
const isLiveStripeSubscription = (subscription: { SProveedorPago: string | null; SIdentificadorExterno: string | null } | null) =>
  subscription?.SProveedorPago === BILLING_PROVIDER && Boolean(subscription.SIdentificadorExterno);

/** A first subscription gets the plan's trial; an organization that already subscribed once does not get another. */
async function trialDaysFor(organizationId: number, plan: { BPermitePrueba: boolean; IDiasPrueba: number | null }) {
  if (!plan.BPermitePrueba || !plan.IDiasPrueba || plan.IDiasPrueba < 1) return null;
  const previous = await prisma.suscripcion.count({ where: { IdOrganizacion: organizationId, SProveedorPago: BILLING_PROVIDER } });
  return previous === 0 ? plan.IDiasPrueba : null;
}

export async function getBillingOverview(organizationId: number, gateway: BillingGateway | null, now = new Date()): Promise<BillingOverviewDto> {
  const [subscription, plans] = await Promise.all([findCurrentSubscription(organizationId), findSellablePlans({}, now)]);
  const paid = isLiveStripeSubscription(subscription);
  const cancelsAt = (subscription?.JMetadatos as { stripe?: { cancelAt?: string | null } } | null)?.stripe?.cancelAt ?? null;
  const currentPrice = subscription?.precioPlan;

  return {
    enabled: gateway !== null,
    current: subscription && {
      planName: subscription.plan.SNombre,
      stateKey: subscription.estadoSuscripcion.SClave,
      stateLabel: subscriptionStateLabel(subscription.estadoSuscripcion.SClave),
      paid,
      paidUse: allowsPaidUse(
        {
          stateAllowsPaidUse: subscription.estadoSuscripcion.BPermiteUsoPagado,
          stateKey: subscription.estadoSuscripcion.SClave,
          graceEndsAt: subscription.DFechaGraciaFin,
          finalizedAt: subscription.DFechaFinalizacion,
        },
        now,
      ),
      priceLabel: currentPrice
        ? `${money.format(priceBreakdown(currentPrice.NImporte, currentPrice.NImpuestoPorcentaje).total)} ${billingPeriodLabel(currentPrice.SIntervaloCobro, currentPrice.IIntervalos)}`
        : null,
      trialEndsAt: subscription.BEsPrueba ? subscription.DFechaFinPrueba?.toISOString() ?? null : null,
      periodEndsAt: subscription.DFechaPeriodoActualFin?.toISOString() ?? null,
      cancelsAt: subscription.BCancelarAlFinalPeriodo ? cancelsAt ?? subscription.DFechaPeriodoActualFin?.toISOString() ?? null : null,
      graceEndsAt: subscription.DFechaGraciaFin?.toISOString() ?? null,
    },
    plans: await Promise.all(
      plans.map(async (plan) => ({
        id: plan.UIdentificadorPublico,
        name: plan.SNombre,
        description: plan.SDescripcion,
        trialDays: await trialDaysFor(organizationId, plan),
        prices: plan.precios.map((price) => ({
          id: price.UIdentificadorPublico,
          ...priceBreakdown(price.NImporte, price.NImpuestoPorcentaje),
          taxPercent: price.NImpuestoPorcentaje.toNumber(),
          periodLabel: billingPeriodLabel(price.SIntervaloCobro, price.IIntervalos),
          current: paid && subscription?.IdPrecioPlan === price.IdPrecioPlan,
        })),
      })),
    ),
  };
}

function requireGateway(gateway: BillingGateway | null): BillingGateway {
  if (!gateway) throw new BillingError(503, "Los pagos no están habilitados en este momento.");
  return gateway;
}

/**
 * The organization's Stripe customer, created on its first checkout. A stored
 * id that Stripe no longer has is replaced; one that is not tagged as this
 * organization's is never used.
 */
async function ensureCustomer(gateway: BillingGateway, user: AuthUser) {
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: user.organizationId } });
  const stored = await findBillingCustomer(organization.IdOrganizacion);
  if (stored) {
    const customer = await gateway.retrieveCustomer(stored.SIdentificadorExterno);
    if (customer) {
      if (!isValuaxisObject(customer.metadata) || customer.metadata.organizacion !== organization.UIdentificadorPublico) {
        throw new BillingError(409, "El cliente de pago de la organización no es válido. Contacta a soporte.");
      }
      return { organization, customerId: customer.id };
    }
  }

  const name = organization.SRazonSocial?.trim() || organization.SNombre;
  const email = organization.SCorreo?.trim() || user.email;
  const customer = await gateway.createCustomer({
    name,
    email,
    metadata: valuaxisMetadata({ organizacion: organization.UIdentificadorPublico }),
    // Two simultaneous first checkouts get the same customer instead of two.
    idempotencyKey: `valuaxis-customer-${organization.UIdentificadorPublico}-${stored?.SIdentificadorExterno ?? "new"}`,
  });
  const provider = await findBillingProvider();
  const key = { IdOrganizacion: organization.IdOrganizacion, IdProveedorPago: provider.IdProveedorPago };
  const data = { SIdentificadorExterno: customer.id, SNombreFacturacion: name, SCorreoFacturacion: email, BActivo: true };
  await prisma.clientePago.upsert({ where: { IdOrganizacion_IdProveedorPago: key }, create: { ...key, ...data }, update: data });
  return { organization, customerId: customer.id };
}

async function portalUrl(gateway: BillingGateway, customerId: string) {
  const session = await gateway.createPortalSession({
    customerId,
    returnUrl: buildPublicAppUrl(BILLING_PAGE_PATH).toString(),
    configurationId: env.STRIPE_PORTAL_CONFIGURATION?.trim() || null,
  });
  return session.url;
}

/**
 * "Contratar": a hosted Checkout session for one price. An organization has
 * one paid subscription at most: with one alive, changing plan happens in the
 * portal, on that same subscription, instead of buying a second one.
 */
export async function startCheckout(
  user: AuthUser,
  pricePublicId: string,
  gatewayOrNull: BillingGateway | null,
): Promise<{ url: string; destination: "checkout" | "portal" }> {
  const gateway = requireGateway(gatewayOrNull);
  const price = await prisma.precioPlan.findUnique({ where: { UIdentificadorPublico: pricePublicId } });
  const plan = price && (await findSellablePlans({ planId: price.IdPlan })).find((item) => item.precios.some((row) => row.IdPrecioPlan === price.IdPrecioPlan));
  if (!price || !plan) throw new BillingError(404, "El plan elegido ya no está disponible.");

  // Stripe is asked first: a subscription cancelled there may not have reached us yet.
  await refreshOrganizationSubscription(gateway, user.organizationId);
  const { organization, customerId } = await ensureCustomer(gateway, user);
  if (isLiveStripeSubscription(await findCurrentSubscription(user.organizationId))) {
    return { url: await portalUrl(gateway, customerId), destination: "portal" };
  }

  await syncBillingCatalog(gateway, { planId: plan.IdPlan });
  const synced = await prisma.precioPlan.findUniqueOrThrow({ where: { IdPrecioPlan: price.IdPrecioPlan } });
  if (!synced.SIdentificadorExterno) throw new Error(`Price ${price.SClave} has no Stripe price after the catalog sync.`);

  const page = buildPublicAppUrl(BILLING_PAGE_PATH).toString();
  const session = await gateway.createCheckoutSession({
    customerId,
    priceId: synced.SIdentificadorExterno,
    clientReferenceId: organization.UIdentificadorPublico,
    trialDays: await trialDaysFor(user.organizationId, plan),
    // Stripe replaces the placeholder; the page reconciles with that session.
    successUrl: `${page}?checkout=exito&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${page}?checkout=cancelado`,
    metadata: valuaxisMetadata({ organizacion: organization.UIdentificadorPublico, plan: plan.SClave, precio: price.UIdentificadorPublico }),
  });
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL.`);

  await recordAuditEvent({
    typeKey: "CREACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Suscripcion",
    entityId: session.id,
    action: "BILLING_CHECKOUT_STARTED",
    metadata: { plan: plan.SClave, price: price.SClave },
  });
  return { url: session.url, destination: "checkout" };
}

/** "Administrar pago": Stripe's customer portal for the organization's own customer. */
export async function openPortal(user: AuthUser, gatewayOrNull: BillingGateway | null): Promise<{ url: string }> {
  const gateway = requireGateway(gatewayOrNull);
  const noCustomer = () => new BillingError(409, "Tu organización todavía no tiene una suscripción de pago que administrar.");
  const [stored, organization] = await Promise.all([
    findBillingCustomer(user.organizationId),
    prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: user.organizationId }, select: { UIdentificadorPublico: true } }),
  ]);
  if (!stored) throw noCustomer();
  const customer = await gateway.retrieveCustomer(stored.SIdentificadorExterno);
  if (!customer || !isValuaxisObject(customer.metadata) || customer.metadata.organizacion !== organization.UIdentificadorPublico) throw noCustomer();
  const customerId = customer.id;
  const url = await portalUrl(gateway, customerId);
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Suscripcion",
    entityId: customerId,
    action: "BILLING_PORTAL_OPENED",
  });
  return { url };
}

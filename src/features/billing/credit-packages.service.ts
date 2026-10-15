/**
 * Credit packages: what an organization can buy (PaqueteCreditos rows), their
 * mirror in Stripe (one Product and one one-time Price each), the hosted
 * Checkout in payment mode, and the reconciliation that credits the ledger
 * from the paid session. As with subscriptions, the success page and the
 * webhook both reconcile from the session as Stripe has it, and the ledger
 * credits a session once whichever comes first.
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { buildPublicAppUrl } from "@/lib/public-url";
import { ForeignStripeObjectError } from "./billing-catalog.service";
import { ensureCustomer } from "./billing-customer.service";
import { BillingError, requireGateway } from "./billing-errors";
import type { BillingGateway, GatewayCheckoutSession, GatewayPrice } from "./billing-gateway";
import {
  BILLING_CURRENCY,
  BILLING_PAGE_PATH,
  BILLING_STATEMENT_DESCRIPTOR,
  isValuaxisObject,
  priceSyncDecision,
  valuaxisMetadata,
  type DesiredPrice,
} from "./billing-rules";
import { packagePricing, stripePackageLookupKey, stripePackageProductId } from "./credit-rules";
import { creditPurchase } from "./credits.service";
import { findBillingCustomer } from "./subscription-sync.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findSellablePackages(options: { packageId?: number } = {}) {
  return prisma.paqueteCreditos.findMany({
    where: { BActivo: true, BEsPublico: true, SMoneda: BILLING_CURRENCY, ...(options.packageId ? { IdPaqueteCreditos: options.packageId } : {}) },
    orderBy: [{ IOrden: "asc" }, { ICreditos: "asc" }, { IdPaqueteCreditos: "asc" }],
  });
}

export type PackageSyncReport = Array<{ package: string; productId: string; priceId: string; action: "created" | "replaced" | "unchanged" }>;

/**
 * Makes Stripe match the sellable packages: a Product and a one-time Price
 * per package, the price id stored in SIdentificadorExterno. Idempotent, and
 * a Price is never edited: a changed amount creates a new one and archives
 * the old one.
 */
export async function syncCreditPackages(gateway: BillingGateway, options: { packageId?: number } = {}): Promise<PackageSyncReport> {
  const report: PackageSyncReport = [];
  for (const pkg of await findSellablePackages(options)) {
    const productId = stripePackageProductId(pkg.UIdentificadorPublico);
    const wanted = { name: pkg.SNombre, description: pkg.SDescripcion?.trim() || null, statementDescriptor: BILLING_STATEMENT_DESCRIPTOR };
    const product = await gateway.retrieveProduct(productId);
    if (!product) {
      await gateway.createProduct({ id: productId, ...wanted, metadata: valuaxisMetadata({ paquete: pkg.SClave, creditos: String(pkg.ICreditos) }) });
    } else {
      if (!isValuaxisObject(product.metadata)) throw new ForeignStripeObjectError("product", productId);
      const same =
        product.active && product.name === wanted.name && product.description === wanted.description && product.statementDescriptor === wanted.statementDescriptor;
      if (!same) await gateway.updateProduct(productId, { ...wanted, active: true });
    }

    const desired: DesiredPrice = {
      productId,
      currency: pkg.SMoneda.toLowerCase(),
      unitAmount: packagePricing(pkg).unitAmount,
      interval: null,
      intervalCount: null,
    };
    const lookupKey = stripePackageLookupKey(pkg.UIdentificadorPublico);
    let existing: GatewayPrice | null = pkg.SIdentificadorExterno ? await gateway.retrievePrice(pkg.SIdentificadorExterno) : null;
    existing ??= await gateway.findPriceByLookupKey(lookupKey);
    if (existing && !isValuaxisObject(existing.metadata)) throw new ForeignStripeObjectError("price", existing.id);

    const decision = priceSyncDecision(existing && existing.unitAmount !== null ? { ...existing, unitAmount: existing.unitAmount } : null, desired);
    let priceId = existing?.id ?? "";
    if (decision !== "keep") {
      const created = await gateway.createPrice({
        ...desired,
        lookupKey,
        nickname: `${pkg.SNombre} (${pkg.ICreditos} ${pkg.ICreditos === 1 ? "avalúo" : "avalúos"})`,
        metadata: valuaxisMetadata({
          paquete: pkg.UIdentificadorPublico,
          creditos: String(pkg.ICreditos),
          importe: pkg.NImporte.toFixed(2),
          impuesto_porcentaje: pkg.NImpuestoPorcentaje.toString(),
        }),
      });
      if (existing?.active) await gateway.archivePrice(existing.id);
      priceId = created.id;
    }
    if (pkg.SIdentificadorExterno !== priceId) {
      await prisma.paqueteCreditos.update({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos }, data: { SIdentificadorExterno: priceId } });
    }
    report.push({ package: pkg.SClave, productId, priceId, action: !existing ? "created" : decision === "keep" ? "unchanged" : "replaced" });
  }
  return report;
}

/** "Comprar": a hosted Checkout in payment mode for one package. */
export async function startPackageCheckout(user: AuthUser, packagePublicId: string, gatewayOrNull: BillingGateway | null): Promise<{ url: string }> {
  const gateway = requireGateway(gatewayOrNull);
  const found = await prisma.paqueteCreditos.findUnique({ where: { UIdentificadorPublico: packagePublicId } });
  const pkg = found && (await findSellablePackages({ packageId: found.IdPaqueteCreditos }))[0];
  if (!pkg) throw new BillingError(404, "El paquete elegido ya no está disponible.");

  const { organization, customerId } = await ensureCustomer(gateway, user);
  await syncCreditPackages(gateway, { packageId: pkg.IdPaqueteCreditos });
  const synced = await prisma.paqueteCreditos.findUniqueOrThrow({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos } });
  if (!synced.SIdentificadorExterno) throw new Error(`Package ${pkg.SClave} has no Stripe price after the catalog sync.`);

  const page = buildPublicAppUrl(BILLING_PAGE_PATH).toString();
  const session = await gateway.createPaymentCheckoutSession({
    customerId,
    priceId: synced.SIdentificadorExterno,
    clientReferenceId: organization.UIdentificadorPublico,
    description: `Valuaxis: ${pkg.SNombre} (${pkg.ICreditos} ${pkg.ICreditos === 1 ? "avalúo" : "avalúos"})`,
    // Stripe replaces the placeholder; the page reconciles with that session.
    successUrl: `${page}?compra=exito&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${page}?compra=cancelado`,
    metadata: valuaxisMetadata({ organizacion: organization.UIdentificadorPublico, paquete: pkg.UIdentificadorPublico, creditos: String(pkg.ICreditos) }),
  });
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL.`);

  await recordAuditEvent({
    typeKey: "CREACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "MovimientoCreditos",
    entityId: session.id,
    action: "BILLING_PACKAGE_CHECKOUT_STARTED",
    metadata: { package: pkg.SClave, credits: pkg.ICreditos },
  });
  return { url: session.url };
}

export type PurchaseReconcileResult =
  | { applied: true; organizationId: number; credits: number; credited: boolean; balance: number }
  | { applied: false; reason: "NOT_FOUND" | "NOT_VALUAXIS" | "NOT_PACKAGE" | "UNKNOWN_ORGANIZATION" | "CUSTOMER_MISMATCH" | "UNKNOWN_PACKAGE" | "NOT_PAID" };

type Ignored = Extract<PurchaseReconcileResult, { applied: false }>;
const ignored = (reason: Ignored["reason"]): Ignored => ({ applied: false, reason });

/**
 * Credits the ledger from a paid payment-mode session. Like a subscription,
 * it only accepts a session tagged as Valuaxis, of a known organization,
 * held by the customer stored for that same organization, for a package we
 * know; an unpaid session (a delayed payment method) is left for the
 * async_payment_succeeded event.
 */
export async function applyPackagePurchase(session: GatewayCheckoutSession): Promise<PurchaseReconcileResult> {
  if (!isValuaxisObject(session.metadata)) return ignored("NOT_VALUAXIS");
  if (session.mode !== "payment" || session.subscriptionId) return ignored("NOT_PACKAGE");
  const organizationPublicId = session.metadata.organizacion ?? "";
  const packagePublicId = session.metadata.paquete ?? "";
  if (!UUID.test(organizationPublicId) || session.clientReferenceId !== organizationPublicId) return ignored("UNKNOWN_ORGANIZATION");
  if (!UUID.test(packagePublicId)) return ignored("UNKNOWN_PACKAGE");
  const organization = await prisma.organizacion.findUnique({ where: { UIdentificadorPublico: organizationPublicId }, select: { IdOrganizacion: true } });
  if (!organization) return ignored("UNKNOWN_ORGANIZATION");
  const customer = await findBillingCustomer(organization.IdOrganizacion);
  if (!customer || customer.SIdentificadorExterno !== session.customerId) return ignored("CUSTOMER_MISMATCH");
  const pkg = await prisma.paqueteCreditos.findUnique({ where: { UIdentificadorPublico: packagePublicId } });
  if (!pkg) return ignored("UNKNOWN_PACKAGE");
  if (session.paymentStatus !== "paid") return ignored("NOT_PAID");

  // What was sold is what the session says; the row's credits only if the tag is unusable.
  const tagged = Number(session.metadata.creditos);
  const credits = Number.isInteger(tagged) && tagged > 0 ? tagged : pkg.ICreditos;
  const result = await creditPurchase({
    organizationId: organization.IdOrganizacion,
    packageId: pkg.IdPaqueteCreditos,
    credits,
    reference: session.id,
    description: `${pkg.SNombre}: ${credits} ${credits === 1 ? "avalúo" : "avalúos"}`,
    metadata: { stripe: { session: session.id, paymentIntent: session.paymentIntentId, amountTotal: session.amountTotal } },
  });
  if (result.credited) {
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: organization.IdOrganizacion,
      entity: "MovimientoCreditos",
      entityId: session.id,
      action: "BILLING_CREDITS_PURCHASED",
      metadata: { package: pkg.SClave, credits, balance: result.balance },
    });
  }
  return { applied: true, organizationId: organization.IdOrganizacion, credits, ...result };
}

/**
 * Reads the session from Stripe and credits it. From the success page,
 * `organizationId` is the signed-in organization: any other session (another
 * organization's, the shop's, a made-up id) is not found.
 */
export async function reconcilePackageCheckout(gateway: BillingGateway, sessionId: string, options: { organizationId?: number } = {}): Promise<PurchaseReconcileResult> {
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) return ignored("NOT_FOUND");
  const session = await gateway.retrieveCheckoutSession(sessionId);
  if (!session) return ignored("NOT_FOUND");
  if (options.organizationId !== undefined) {
    const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: options.organizationId }, select: { UIdentificadorPublico: true } });
    if (!isValuaxisObject(session.metadata) || session.metadata.organizacion !== organization.UIdentificadorPublico) return ignored("NOT_FOUND");
  }
  const result = await applyPackagePurchase(session);
  return result.applied && options.organizationId !== undefined && result.organizationId !== options.organizationId ? ignored("NOT_FOUND") : result;
}

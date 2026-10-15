/**
 * The organization's customer in Stripe, shared by the subscription checkout
 * and the credit package checkout: one customer per organization, whatever it
 * buys, so the portal shows every receipt in one place.
 */
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { BillingError } from "./billing-errors";
import type { BillingGateway } from "./billing-gateway";
import { isValuaxisObject, valuaxisMetadata } from "./billing-rules";
import { findBillingCustomer, findBillingProvider } from "./subscription-sync.service";

/**
 * The organization's Stripe customer, created on its first checkout. A stored
 * id that Stripe no longer has is replaced; one that is not tagged as this
 * organization's is never used.
 */
export async function ensureCustomer(gateway: BillingGateway, user: AuthUser) {
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

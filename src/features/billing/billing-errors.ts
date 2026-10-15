import type { BillingGateway } from "./billing-gateway";

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

export function requireGateway(gateway: BillingGateway | null): BillingGateway {
  if (!gateway) throw new BillingError(503, "Los pagos no están habilitados en este momento.");
  return gateway;
}

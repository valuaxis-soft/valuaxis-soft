/**
 * What invoicing needs from the CFDI provider, in plain objects. The Facturapi
 * implementation lives in src/infrastructure/invoicing/facturapi-gateway.ts;
 * tests point it at a local fake server.
 */
import { env } from "@/lib/env";
import type { CfdiInvoicePayload } from "./invoice-rules";

export type IssuedCfdi = {
  id: string;
  /** "valid" once stamped; "pending" while the provider retries the stamp (its HTTP 202); "canceled". */
  status: string;
  uuid: string | null;
  series: string | null;
  folioNumber: number | null;
  total: number;
  date: Date | null;
};

/** A refusal of the provider (validation, the SAT, the key): its message is kept and shown to the admin. */
export class InvoicingProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "InvoicingProviderError";
  }
}

export interface InvoicingGateway {
  /** Creates and stamps the CFDI. The payload's idempotency_key makes a repeated request answer 409 instead of a second invoice. */
  createInvoice(payload: CfdiInvoicePayload): Promise<IssuedCfdi>;
  /** Null when it does not exist. */
  retrieveInvoice(id: string): Promise<IssuedCfdi | null>;
  /** The invoice created with that external_id, if any: what a lost or conflicting request left behind. */
  findInvoiceByExternalId(externalId: string): Promise<IssuedCfdi | null>;
  downloadInvoice(id: string, format: "pdf" | "xml"): Promise<Buffer>;
}

let cached: InvoicingGateway | undefined;

/** Null when FACTURAPI_KEY is not set: invoicing is off and nothing is issued. */
export async function getInvoicingGateway(): Promise<InvoicingGateway | null> {
  const key = env.FACTURAPI_KEY?.trim();
  if (!key) return null;
  if (!cached) {
    const { createFacturapiGateway } = await import("@/infrastructure/invoicing/facturapi-gateway");
    cached = createFacturapiGateway(key, env.FACTURAPI_BASE_URL?.trim() || undefined);
  }
  return cached;
}

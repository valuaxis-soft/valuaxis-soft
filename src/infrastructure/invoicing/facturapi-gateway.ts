/**
 * Facturapi (https://docs.facturapi.io) through its REST API with the
 * platform fetch, so no SDK is needed. The secret key decides the issuer and
 * the environment (sk_test_… or sk_live_…); it only travels in the
 * Authorization header and is never logged. Neither are the RFCs of the
 * payloads: errors keep the provider's message, not the request.
 */
import {
  InvoicingProviderError,
  type InvoicingGateway,
  type IssuedCfdi,
} from "@/features/billing/invoicing-gateway";
import type { CfdiInvoicePayload } from "@/features/billing/invoice-rules";

const DEFAULT_BASE_URL = "https://www.facturapi.io/v2";
/** Stamping waits on the SAT's certifier; Facturapi answers 202 itself when it takes too long. */
const TIMEOUT_MS = 60_000;

type FacturapiInvoice = {
  id: string;
  status?: string;
  uuid?: string | null;
  series?: string | null;
  folio_number?: number | null;
  total?: number;
  date?: string | null;
};

const toIssued = (invoice: FacturapiInvoice): IssuedCfdi => ({
  id: invoice.id,
  status: invoice.status ?? "pending",
  uuid: invoice.uuid || null,
  series: invoice.series || null,
  folioNumber: typeof invoice.folio_number === "number" ? invoice.folio_number : null,
  total: typeof invoice.total === "number" ? invoice.total : 0,
  date: invoice.date ? new Date(invoice.date) : null,
});

export function createFacturapiGateway(secretKey: string, baseUrl = DEFAULT_BASE_URL, fetchImpl: typeof fetch = fetch): InvoicingGateway {
  const root = baseUrl.replace(/\/+$/, "");

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetchImpl(`${root}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return response;
    const body = (await response.json().catch(() => null)) as { message?: unknown; code?: unknown } | null;
    const message = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : `Facturapi respondió ${response.status}.`;
    throw new InvoicingProviderError(response.status, typeof body?.code === "string" ? body.code : null, message);
  }

  return {
    async createInvoice(payload: CfdiInvoicePayload) {
      const response = await call("/invoices", { method: "POST", body: JSON.stringify(payload) });
      return toIssued((await response.json()) as FacturapiInvoice);
    },

    async retrieveInvoice(id) {
      try {
        const response = await call(`/invoices/${encodeURIComponent(id)}`);
        return toIssued((await response.json()) as FacturapiInvoice);
      } catch (error) {
        if (error instanceof InvoicingProviderError && error.status === 404) return null;
        throw error;
      }
    },

    async findInvoiceByExternalId(externalId) {
      const response = await call(`/invoices?external_id=${encodeURIComponent(externalId)}&limit=5`);
      const page = (await response.json()) as { data?: FacturapiInvoice[] };
      // A cancelled one does not count: the payment still needs its invoice.
      const found = (page.data ?? []).find((invoice) => invoice.status !== "canceled");
      return found ? toIssued(found) : null;
    },

    async downloadInvoice(id, format) {
      const response = await call(`/invoices/${encodeURIComponent(id)}/${format}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

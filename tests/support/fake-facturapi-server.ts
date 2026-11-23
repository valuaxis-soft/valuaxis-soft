/**
 * A local stand-in for Facturapi's invoice endpoints (POST /invoices, GET
 * /invoices/:id, GET /invoices?external_id=, GET /invoices/:id/pdf|xml), so
 * the real gateway runs over HTTP without the network or a key. It honours
 * the idempotency key as Facturapi documents it (a key tied to an invoice
 * answers 409), keeps every invoice and request, and can be told to refuse
 * the next creations with a message, as the SAT validation would.
 */
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_FACTURAPI_KEY = "sk_test_fake_facturapi_key";

type StoredInvoice = {
  id: string;
  status: string;
  uuid: string;
  series: string;
  folio_number: number;
  total: number;
  date: string;
  external_id: string | null;
  body: Record<string, unknown>;
};

type Received = { method: string; path: string; authorization: string | undefined; body: Record<string, unknown> | null };

export async function startFakeFacturapiServer() {
  const invoices: StoredInvoice[] = [];
  const requests: Received[] = [];
  const keys = new Map<string, string>();
  /** Messages for the next creations to refuse with 400, in order. */
  const refusals: string[] = [];
  /** The next creation is stamped late: Facturapi's 202 with status "pending". */
  let nextPending = false;
  let folio = 0;

  const totalOf = (body: Record<string, unknown>) => {
    const items = (body.items as Array<{ quantity: number; product: { price: number; tax_included: boolean; taxes: Array<{ rate: number }> } }>) ?? [];
    let cents = 0;
    for (const item of items) {
      const price = Math.round(item.product.price * 100) * item.quantity;
      const rate = item.product.taxes.reduce((sum, tax) => sum + tax.rate, 0);
      cents += item.product.tax_included ? price : price + Math.round(price * rate);
    }
    return cents / 100;
  };

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://fake");
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      requests.push({ method: request.method ?? "GET", path: url.pathname + url.search, authorization: request.headers.authorization, body });
      const json = (status: number, payload: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      const strip = ({ body: _body, ...invoice }: StoredInvoice) => invoice;

      if (request.headers.authorization !== `Bearer ${FAKE_FACTURAPI_KEY}`) return json(401, { ok: false, status: 401, message: "API key inválida." });

      if (request.method === "POST" && url.pathname === "/invoices") {
        const key = typeof body?.idempotency_key === "string" ? body.idempotency_key : "";
        if (key && keys.has(key)) {
          return json(409, { ok: false, status: 409, code: "idempotency_key_in_use", message: "La clave de idempotencia (idempotency_key) ya está siendo usada." });
        }
        const refusal = refusals.shift();
        if (refusal) return json(400, { ok: false, status: 400, code: "invalid_request", message: refusal });
        folio += 1;
        const pending = nextPending;
        nextPending = false;
        const invoice: StoredInvoice = {
          id: `inv_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          status: pending ? "pending" : "valid",
          uuid: pending ? "" : randomUUID().toUpperCase(),
          series: "VX",
          folio_number: folio,
          total: totalOf(body ?? {}),
          date: new Date().toISOString(),
          external_id: typeof body?.external_id === "string" ? body.external_id : null,
          body: body ?? {},
        };
        invoices.push(invoice);
        if (key) keys.set(key, invoice.id);
        return json(pending ? 202 : 200, strip(invoice));
      }

      if (request.method === "GET" && url.pathname === "/invoices") {
        const externalId = url.searchParams.get("external_id");
        const data = invoices.filter((invoice) => externalId === null || invoice.external_id === externalId).map(strip);
        return json(200, { page: 1, total_pages: 1, total_results: data.length, data });
      }

      const file = /^\/invoices\/([^/]+)(?:\/(pdf|xml))?$/.exec(url.pathname);
      if (request.method === "GET" && file) {
        const invoice = invoices.find((item) => item.id === file[1]);
        if (!invoice) return json(404, { ok: false, status: 404, message: "No se encontró la factura." });
        if (!file[2]) return json(200, strip(invoice));
        response.writeHead(200, { "content-type": file[2] === "pdf" ? "application/pdf" : "application/xml" });
        return response.end(file[2] === "pdf" ? `%PDF-fake ${invoice.uuid}` : `<cfdi:Comprobante UUID="${invoice.uuid}"/>`);
      }

      json(404, { ok: false, status: 404, message: "Ruta desconocida." });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    invoices,
    requests,
    refuseNext(message: string) {
      refusals.push(message);
    },
    stampNextLate() {
      nextPending = true;
    },
    /** Facturapi finishes a late stamp. */
    stamp(id: string) {
      const invoice = invoices.find((item) => item.id === id)!;
      invoice.status = "valid";
      invoice.uuid = randomUUID().toUpperCase();
    },
    creations: () => requests.filter((request) => request.method === "POST" && request.path === "/invoices").length,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * The monthly global invoice (CFDI to the general public, RFC XAXX010101000)
 * of the package payments that were not invoiced to an RFC: organizations
 * without fiscal data, or payments made while invoicing was off. One concept
 * per payment. A dry run by default; --apply issues it with Facturapi.
 * Running it again after a failure retries the same payments; payments
 * already in an issued global invoice are never included again.
 *
 *   pnpm invoices:global --month 2026-11            (dry run)
 *   pnpm invoices:global --month 2026-11 --apply    (issues)
 *
 * Inside the production container:
 *   node --import tsx scripts/invoices-global.ts --month 2026-11 [--apply]
 *
 * Prints amounts and payment ids, never RFCs or keys.
 */
import { getInvoicingGateway } from "../src/features/billing/invoicing-gateway";
import { issueGlobalInvoice } from "../src/features/billing/invoicing.service";
import { prisma } from "../src/infrastructure/database/prisma-client";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function parseArgs(args: string[]) {
  let month: string | null = null;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--month") month = args[++index] ?? null;
    else if (arg.startsWith("--month=")) month = arg.slice("--month=".length);
    else throw new Error(`Opción desconocida: ${arg}. Uso: --month AAAA-MM [--apply]`);
  }
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Indica el mes con --month AAAA-MM, por ejemplo --month 2026-11.");
  return { month, apply };
}

async function main() {
  const { month, apply } = parseArgs(process.argv.slice(2));
  const gateway = await getInvoicingGateway();
  if (apply && !gateway) throw new Error("Falta FACTURAPI_KEY: no se puede emitir nada.");
  console.log(`${apply ? "EMITIR" : "SIMULACIÓN (--apply para emitir)"}: factura global de ${month}`);

  const report = await issueGlobalInvoice(gateway, month, { apply });
  if (report.failedIndividual > 0) {
    console.log(`Atención: ${report.failedIndividual} factura(s) individual(es) de este mes fallaron y no entran en la global; reinténtalas desde Plan y facturación.`);
  }
  if (report.payments.length === 0) {
    console.log("No hay pagos de ese mes pendientes de factura.");
    return;
  }
  for (const payment of report.payments) console.log(`  ${payment.paidAt.slice(0, 10)}  ${payment.reference}  ${money.format(payment.total)}  (${payment.organization})`);
  console.log(`${report.payments.length} pago(s): subtotal ${money.format(report.subtotal)} + IVA ${money.format(report.tax)} = ${money.format(report.total)}`);
  if (!apply) return;
  if (report.error) {
    console.error(`No se emitió: ${report.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Emitida: UUID ${report.issued?.uuid ?? "(pendiente)"} · Facturapi ${report.issued?.facturapiId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

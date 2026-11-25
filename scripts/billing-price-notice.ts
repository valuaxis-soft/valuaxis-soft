/**
 * Announces a future price of one Avalúo Disponible (commercial policies,
 * section 7.1): at least a month ahead, with a banner in the platform and an
 * email to every user before it applies. From that date the next purchase
 * charges the new price; what was already paid is not touched.
 *
 *   pnpm billing:price-notice list
 *   pnpm billing:price-notice announce <precio con IVA> <AAAA-MM-DD>            (simulación)
 *   pnpm billing:price-notice announce <precio con IVA> <AAAA-MM-DD> --apply    (registra y envía los correos)
 *   pnpm billing:price-notice send <id> --apply      (reintenta los correos de un aviso que no salieron)
 *   pnpm billing:price-notice cancel <id> --apply
 *
 * The date is the start of that day in Mexico City. Only the owner decides a
 * price (AGENTS.md): run it when he asks for it.
 * Inside the production container:
 *   node --import tsx scripts/billing-price-notice.ts <comando> …
 */
import { prisma } from "../src/infrastructure/database/prisma-client";
import {
  PriceNoticeError,
  announcePriceChange,
  cancelPriceNotice,
  priceNoticeRecipients,
  priceNoticeSentence,
  sendPriceNoticeEmails,
} from "../src/features/billing/unit-price.service";

const USAGE = "Comando: list | announce <precio con IVA> <AAAA-MM-DD> [--apply] | send <id> --apply | cancel <id> --apply";

/** «2027-01-15» → the start of that day in Mexico City (UTC−6, no daylight saving since 2022). */
function startOfDayInMexico(text: string | undefined) {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PriceNoticeError("La fecha va como AAAA-MM-DD.");
  const date = new Date(`${text}T00:00:00-06:00`);
  if (Number.isNaN(date.getTime())) throw new PriceNoticeError("La fecha no es válida.");
  return date;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const [command, first, second] = args.filter((arg) => arg !== "--apply");

  switch (command) {
    case "list": {
      const notices = await prisma.avisoPrecio.findMany({ orderBy: { DFechaCreacion: "desc" }, take: 20 });
      if (!notices.length) console.log("No hay avisos de cambio de precio.");
      for (const notice of notices) {
        const state = notice.DFechaCancelacion ? "cancelado" : notice.DFechaAplicacion ? `aplicado ${notice.DFechaAplicacion.toISOString()}` : "pendiente";
        console.log(
          `${notice.UIdentificadorPublico}  $${notice.NPrecioAnterior.toFixed(2)} → $${notice.NPrecioNuevo.toFixed(2)}  rige ${notice.DFechaVigencia.toISOString()}  ${state}  correos: ${notice.DFechaCorreos ? `${notice.ICorreosEnviados} el ${notice.DFechaCorreos.toISOString()}` : "sin enviar"}`,
        );
      }
      return;
    }
    case "announce": {
      const effectiveAt = startOfDayInMexico(second);
      const result = await announcePriceChange({ newPrice: first ?? "", effectiveAt, apply });
      const recipients = await priceNoticeRecipients();
      const sentence = priceNoticeSentence({ currentPrice: result.draft.NPrecioAnterior.toNumber(), newPrice: result.draft.NPrecioNuevo.toNumber(), effectiveAt });
      if (!result.recorded) {
        console.log("SIMULACIÓN (--apply para registrar y enviar):");
        console.log(`  ${sentence}`);
        console.log(`  Se enviaría el correo a ${recipients.length} usuarios y el aviso se vería en la plataforma desde hoy.`);
        return;
      }
      console.log(`Aviso registrado: ${result.notice.UIdentificadorPublico}`);
      console.log(`  ${sentence}`);
      const sent = await sendPriceNoticeEmails(result.notice.UIdentificadorPublico);
      console.log(`  Correos enviados: ${sent.sent}${sent.failed ? `, fallidos: ${sent.failed} (revisa el registro)` : ""}.`);
      return;
    }
    case "send": {
      if (!apply) throw new PriceNoticeError("Agrega --apply para enviar los correos.");
      const sent = await sendPriceNoticeEmails(first ?? "");
      console.log(sent.alreadySent ? "Los correos de ese aviso ya se habían enviado." : `Correos enviados: ${sent.sent}${sent.failed ? `, fallidos: ${sent.failed}` : ""}.`);
      return;
    }
    case "cancel": {
      if (!apply) throw new PriceNoticeError("Agrega --apply para cancelar el aviso.");
      await cancelPriceNotice(first ?? "");
      console.log("Aviso cancelado: el precio vigente no cambia.");
      return;
    }
    default:
      throw new PriceNoticeError(USAGE);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

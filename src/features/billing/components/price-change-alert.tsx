import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PriceNoticeDto } from "../unit-price.service";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/**
 * The announced price (commercial policies 7.1), on the dashboard and in Plan
 * y facturación from the announcement until it is in force. The same words
 * as the email (unit-price.service.ts).
 */
export function PriceChangeAlert({ notice, withLink = false }: { notice: PriceNoticeDto; withLink?: boolean }) {
  return (
    <Alert data-price-notice={notice.id}>
      <CalendarClock />
      <AlertTitle>Aviso de cambio de precio</AlertTitle>
      <AlertDescription>
        <p>
          A partir del {formatDate(notice.effectiveAt)}, el precio de cada Avalúo Disponible será de {money.format(notice.newPrice)} MXN con IVA incluido (hoy{" "}
          {money.format(notice.currentPrice)}). Los Avalúos Disponibles que ya pagaste no cambian: se respetan y no vencen.
        </p>
        {withLink ? (
          <Link href="/organizacion/facturacion" className="font-medium text-primary underline underline-offset-4">
            Ver Plan y facturación
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

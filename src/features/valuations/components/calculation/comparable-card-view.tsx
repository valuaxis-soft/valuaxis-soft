import { AlertTriangle, ExternalLink, ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  ADDRESS_LABELS,
  ADDRESS_PARTS,
  DATA_VERIFIED_LABELS,
  OPERATION_TYPE_LABELS,
  UNIT_BASIS_LABELS,
  URBAN_PROXIMITY_LABELS,
  formatComparableId,
} from "@/features/valuations/calculation/comparable-card";
import type { ComparableCardDto } from "@/features/valuations/calculation/comparable-card.service";
import { REVIEW_CHECKS, REVIEW_CHECK_LABELS, REVIEW_STATUS_LABELS } from "@/features/valuations/calculation/comparable-review";
import {
  COMPARABLE_TYPE_LABELS,
  defaultCharacteristicFields,
  isBuiltComparableType,
  isRentComparableType,
  type ComparableType,
} from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";
import { ComparableValidityLine } from "./comparable-validity-badge";
import { SheetSection, SheetTable, type SheetItem } from "./comparable-sheet";
import { REVIEW_STATUS_STYLES } from "./review-status-style";

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 4 });
/** "2026-10-07" → "07/10/2026". */
export const dayText = (value: string | null | undefined) => (value ? value.split("-").reverse().join("/") : "—");
const orDash = (value: string | null | undefined) => (value?.trim() ? value : "—");

const AREA_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Superficie de terreno (m²)",
  TERRENO_RENTA: "Superficie de terreno (m²)",
  INMUEBLE_VENTA: "Superficie construida (m²)",
  INMUEBLE_RENTA: "Superficie rentable (m²)",
};

/** A link to the listing that stays active in a printed PDF. */
function ListingLink({ href, printable }: { href: string; printable: boolean }) {
  return (
    <a
      className={cn("inline-flex items-center gap-1 break-all underline-offset-2 hover:underline", printable ? "text-[#1d4ed8] underline" : "text-primary")}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ExternalLink className="size-3.5 shrink-0" /> {href}
    </a>
  );
}

/**
 * "Ficha del comparable": what the appraiser checks against the listing —
 * the photos and the screenshot of the listing, the offer, where it is, who
 * offers it, its land and construction, and the valuations it was used in.
 * Grouped as the tables of the dictamen. In the calculation memory
 * (`printable`) it leaves out the review, the warnings and the uses.
 */
export function ComparableCardView({ card, printable = false }: { card: ComparableCardDto; printable?: boolean }) {
  const { comparable, type } = card;
  const rent = isRentComparableType(type);
  const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
  const operation = comparable.operationType ?? (rent ? "RENTA" : "VENTA");
  const id = formatComparableId(comparable.folio);
  const builtins = defaultCharacteristicFields(type);
  const extra = Object.entries(comparable.extra ?? {});
  const review = comparable.review;
  const built = isBuiltComparableType(type);

  const offer: SheetItem[] = [
    { label: rent ? "Renta mensual" : "Precio de oferta", value: <span className="font-semibold tabular-nums">{money(comparable.price)}</span> },
    ...(rent ? [{ label: "Renta anual", value: <span className="tabular-nums">{money(comparable.price === null ? null : comparable.price * 12)}</span> }] : []),
    { label: rent ? "$/m²/mes" : "$/m²", value: <span className="tabular-nums">{money(unitValue)}</span> },
    { label: AREA_LABELS[type], value: <span className="tabular-nums">{number(comparable.area)}</span> },
    { label: "Operación", value: OPERATION_TYPE_LABELS[operation] },
    { label: "Fecha de la oferta", value: dayText(comparable.offerDate) },
  ];
  const location: SheetItem[] = [
    { label: "Ubicación", value: orDash(comparable.location), wide: true },
    ...ADDRESS_PARTS.map((part) => ({ label: ADDRESS_LABELS[part], value: orDash(comparable.address?.[part]) })),
    { label: "Proximidad urbana", value: comparable.urbanProximity ? URBAN_PROXIMITY_LABELS[comparable.urbanProximity] : "—" },
    {
      label: "Latitud, longitud",
      value: comparable.latitude !== null && comparable.latitude !== undefined && comparable.longitude !== null && comparable.longitude !== undefined
        ? `${comparable.latitude}, ${comparable.longitude}` : "—",
    },
  ];
  const source: SheetItem[] = [
    { label: "Fuente o portal", value: orDash(comparable.sourceName) },
    { label: "Anunciante", value: orDash(comparable.contactName) },
    { label: "Teléfono", value: orDash(comparable.contactPhone) },
    { label: "Fecha de consulta", value: dayText(comparable.consultedOn) },
    { label: "Vigencia de la oferta", value: dayText(comparable.validUntil) },
    { label: "ID de publicación", value: orDash(comparable.listingDetails?.publicationId) },
    { label: "Liga del anuncio", value: comparable.url ? <ListingLink href={comparable.url} printable={printable} /> : "—", wide: true },
  ];
  const land: SheetItem[] = [
    { label: "Uso de suelo", value: orDash(comparable.landUse) },
    ...builtins.filter((field) => !["area", "price", "notes", "conservation", "quality"].includes(field.key)).map((field) => {
      const value = comparable[field.key as keyof typeof comparable];
      // The format's tag of the zoning key reads "USO DE SUELO", like the description above it.
      const label = field.key === "landUseKey" ? "Clave de uso de suelo" : field.label.charAt(0) + field.label.slice(1).toLowerCase();
      return { label, value: value === null || value === undefined || value === "" ? "—" : String(value) };
    }),
    { label: "Pavimento / acceso", value: orDash(comparable.propertyDetails?.paving) },
    { label: "Posición en manzana", value: orDash(comparable.propertyDetails?.blockPosition) },
  ];
  const construction: SheetItem[] = built ? [
    { label: "Tipo de construcción", value: orDash(comparable.constructionType) },
    { label: "Superficie de terreno (m²)", value: <span className="tabular-nums">{number(comparable.landArea)}</span> },
    { label: "Calidad", value: orDash(comparable.quality) },
    { label: "Conservación", value: orDash(comparable.conservation) },
    { label: "Edad (años)", value: number(comparable.propertyDetails?.age) },
    { label: "Niveles", value: number(comparable.propertyDetails?.levels) },
    { label: "Recámaras", value: number(comparable.bedrooms) },
    { label: "Baños", value: number(comparable.bathrooms) },
    { label: "Estacionamientos", value: number(comparable.propertyDetails?.parking) },
  ] : [];
  const characteristics: SheetItem[] = [
    ...extra.map(([key, value]) => ({ label: key.replace(/^custom:/, ""), value })),
    ...(comparable.attributes ?? []).map((attribute) => ({ label: attribute.name, value: attribute.value })),
    ...(comparable.characteristicsText ? [{ label: "Texto de características", value: comparable.characteristicsText, wide: true }] : []),
    { label: "Observaciones", value: orDash(comparable.notes), wide: true },
  ];
  const details: SheetItem[] = comparable.propertyDetails || comparable.listingDetails ? [
    { label: "Moneda", value: comparable.listingDetails?.currency ?? "MXN" },
    { label: "Base del unitario", value: comparable.propertyDetails?.unitBasis ? UNIT_BASIS_LABELS[comparable.propertyDetails.unitBasis] : "—" },
    { label: "Origen del dato", value: orDash(comparable.listingDetails?.dataOrigin) },
    { label: "Datos verificados", value: comparable.listingDetails?.dataVerified ? DATA_VERIFIED_LABELS[comparable.listingDetails.dataVerified] : "—" },
    { label: "Cambio de precio", value: dayText(comparable.listingDetails?.priceChangedOn) },
    { label: "Confianza de la extracción", value: orDash(comparable.listingDetails?.extractionConfidence) },
    ...(comparable.listingDetails?.photoUrl ? [{ label: "URL de la fotografía", value: <ListingLink href={comparable.listingDetails.photoUrl} printable={printable} />, wide: true }] : []),
  ] : [];

  return (
    <article className={cn("grid gap-3 text-sm", printable && "text-black")} data-comparable-card={id ?? comparable.id}>
      <header className="flex flex-wrap items-center gap-2 rounded-sm bg-[#003B73] px-3 py-2 text-white">
        <span className="font-mono text-base font-semibold">{id ?? "Sin número"}</span>
        <span className="rounded-sm bg-white/15 px-1.5 py-0.5 text-xs">{COMPARABLE_TYPE_LABELS[type]}</span>
        <span className="rounded-sm bg-white/15 px-1.5 py-0.5 text-xs">Comparable {comparable.reference}</span>
        {review && !printable ? (
          <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", REVIEW_STATUS_STYLES[review.status].solid)}>{REVIEW_STATUS_LABELS[review.status]}</span>
        ) : null}
        <span className="ml-auto text-xs text-white/80">
          {card.valuation ? `Capturado en el avalúo ${card.valuation.folio}` : "En la base general, sin avalúo"}
        </span>
      </header>
      {printable ? null : <ComparableValidityLine validity={card.validity} />}

      {!printable && card.warnings.length ? (
        <ul className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" aria-label="Avisos">
          {card.warnings.map((warning) => (
            <li key={warning.key} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warning.message}</li>
          ))}
        </ul>
      ) : null}

      <div className={cn("grid gap-3", printable ? "grid-cols-2" : "sm:grid-cols-2")}>
        <SheetSection title="Fotografías" printable={printable}>
          {comparable.photos.length ? (
            <div className="grid grid-cols-3 gap-1.5 p-1.5">
              {comparable.photos.map((photo) => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-sm border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.title} className="size-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1 p-2 text-xs text-muted-foreground"><ImageOff className="size-4" /> Sin fotografías.</p>
          )}
        </SheetSection>
        <SheetSection title="Pantalla de referencia" printable={printable}>
          {comparable.screenshot ? (
            <a href={comparable.screenshot.url} target="_blank" rel="noopener noreferrer" className="block p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={comparable.screenshot.url} alt="Pantalla de referencia del anuncio" className="max-h-64 w-full object-contain" />
            </a>
          ) : (
            <p className="flex items-center gap-1 p-2 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" /> Sin pantalla de referencia.</p>
          )}
        </SheetSection>
      </div>

      <SheetSection title="Oferta" printable={printable}><SheetTable items={offer} printable={printable} /></SheetSection>
      <SheetSection title="Ubicación" printable={printable}><SheetTable items={location} printable={printable} /></SheetSection>
      <SheetSection title="Fuente de información" printable={printable}>
        <SheetTable items={source} printable={printable} />
        {comparable.listingText && !printable ? (
          <details className="border-t p-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">Texto del anuncio como se pegó</summary>
            <p className="mt-2 text-xs whitespace-pre-wrap">{comparable.listingText}</p>
          </details>
        ) : null}
      </SheetSection>
      <SheetSection title="Terreno" printable={printable}><SheetTable items={land} printable={printable} /></SheetSection>
      {construction.length ? (
        <SheetSection title="Construcción" printable={printable}><SheetTable items={construction} printable={printable} /></SheetSection>
      ) : null}
      <SheetSection title="Características y observaciones" printable={printable}><SheetTable items={characteristics} printable={printable} /></SheetSection>
      {details.length ? (
        <SheetSection title="Más datos del anuncio" printable={printable}><SheetTable items={details} printable={printable} /></SheetSection>
      ) : null}

      {!printable && review && review.status !== "POR_REVISAR" ? (
        <SheetSection title="Revisión">
          <div className="grid gap-2 p-2 text-xs">
            <p>
              {REVIEW_STATUS_LABELS[review.status]}
              {review.reviewedBy ? ` por ${review.reviewedBy}` : ""}
              {review.reviewedAt ? ` el ${new Date(review.reviewedAt).toLocaleString("es-MX")}` : ""}
            </p>
            <ul className="flex flex-wrap gap-1">
              {REVIEW_CHECKS.filter((check) => review.checks[check] !== undefined).map((check) => (
                <li key={check}><Badge variant={review.checks[check] ? "secondary" : "destructive"}>{review.checks[check] ? "✓" : "✗"} {REVIEW_CHECK_LABELS[check]}</Badge></li>
              ))}
            </ul>
            {review.notes ? <p className="whitespace-pre-wrap">{review.notes}</p> : null}
          </div>
        </SheetSection>
      ) : null}

      {!printable ? (
        <SheetSection title="Avalúos en que se usó">
          <ul className="grid gap-1 p-2 text-xs">
            {card.uses.map((use) => (
              <li key={`${use.valuationId}:${use.type}:${use.reference}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{use.folio}</span>
                <span className="text-muted-foreground">{use.title ?? ""}</span>
                {use.client ? <span className="text-muted-foreground">· cliente {use.client}</span> : null}
                <span className="text-muted-foreground">· {COMPARABLE_TYPE_LABELS[use.type]}, comparable {use.reference}, agregado el {dayText(use.addedOn)}</span>
                <a className="text-primary underline-offset-2 hover:underline" href={`/workspace?id=${use.valuationId}`} target="_blank" rel="noopener noreferrer">Abrir avalúo</a>
              </li>
            ))}
            {!card.uses.length ? <li className="text-muted-foreground">Todavía no se usa en un avalúo.</li> : null}
          </ul>
        </SheetSection>
      ) : null}
    </article>
  );
}

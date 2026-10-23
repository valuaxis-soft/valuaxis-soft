import { AlertTriangle, ExternalLink, ImageOff } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  ADDRESS_LABELS,
  ADDRESS_PARTS,
  OPERATION_TYPE_LABELS,
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
import { ComparableValidityLine } from "./comparable-validity-badge";

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 4 });
/** "2026-10-07" → "07/10/2026". */
export const dayText = (value: string | null | undefined) => (value ? value.split("-").reverse().join("/") : "—");

function Item(props: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={props.wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="wrap-break-word">{props.children}</dd>
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2" aria-label={props.title}>
      <h3 className="text-sm font-semibold">{props.title}</h3>
      {props.children}
    </section>
  );
}

const AREA_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Superficie de terreno (m²)",
  TERRENO_RENTA: "Superficie de terreno (m²)",
  INMUEBLE_VENTA: "Superficie construida (m²)",
  INMUEBLE_RENTA: "Superficie rentable (m²)",
};

/**
 * "Ficha del comparable": what the appraiser checks against the listing —
 * the photos and the screenshot of the listing, the offer, where it is, who
 * offers it, its land and construction, and the valuations it was used in.
 */
export function ComparableCardView({ card }: { card: ComparableCardDto }) {
  const { comparable, type } = card;
  const rent = isRentComparableType(type);
  const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
  const operation = comparable.operationType ?? (rent ? "RENTA" : "VENTA");
  const id = formatComparableId(comparable.folio);
  const builtins = defaultCharacteristicFields(type);
  const extra = Object.entries(comparable.extra ?? {});
  const review = comparable.review;

  return (
    <article className="grid gap-5 text-sm" data-comparable-card={id ?? comparable.id}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-semibold">{id ?? "Sin número"}</span>
        <Badge variant="secondary">{COMPARABLE_TYPE_LABELS[type]}</Badge>
        <Badge variant="outline">{OPERATION_TYPE_LABELS[operation]}</Badge>
        {review ? <Badge variant={review.status === "VERIFICADO" ? "default" : "outline"}>{REVIEW_STATUS_LABELS[review.status]}</Badge> : null}
        <span className="text-xs text-muted-foreground">Capturado en el avalúo {card.valuation.folio}, comparable {comparable.reference}</span>
      </header>
      <ComparableValidityLine validity={card.validity} />

      {card.warnings.length ? (
        <ul className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" aria-label="Avisos">
          {card.warnings.map((warning) => (
            <li key={warning.key} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warning.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Fotografías">
          {comparable.photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {comparable.photos.map((photo) => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.title} className="size-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1 text-muted-foreground"><ImageOff className="size-4" /> Sin fotografías.</p>
          )}
        </Section>
        <Section title="Pantalla de referencia">
          {comparable.screenshot ? (
            <a href={comparable.screenshot.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={comparable.screenshot.url} alt="Pantalla de referencia del anuncio" className="max-h-64 w-full object-contain" />
            </a>
          ) : (
            <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" /> Sin pantalla de referencia.</p>
          )}
        </Section>
      </div>

      <Section title="Oferta">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-4">
          <Item label={rent ? "Renta mensual" : "Precio de oferta"}><span className="text-base font-semibold tabular-nums">{money(comparable.price)}</span></Item>
          <Item label={rent ? "$/m²/mes" : "$/m²"}><span className="tabular-nums">{money(unitValue)}</span></Item>
          <Item label={AREA_LABELS[type]}><span className="tabular-nums">{number(comparable.area)}</span></Item>
          <Item label="Fecha de la oferta">{dayText(comparable.offerDate)}</Item>
        </dl>
      </Section>

      <Section title="Ubicación">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-4">
          <Item label="Ubicación (como la imprime el dictamen)" wide>{comparable.location || "—"}</Item>
          {ADDRESS_PARTS.map((part) => (
            <Item key={part} label={ADDRESS_LABELS[part]}>{comparable.address?.[part] || "—"}</Item>
          ))}
          <Item label="Proximidad urbana">{comparable.urbanProximity ? URBAN_PROXIMITY_LABELS[comparable.urbanProximity] : "—"}</Item>
          <Item label="Latitud, longitud">
            {comparable.latitude !== null && comparable.latitude !== undefined && comparable.longitude !== null && comparable.longitude !== undefined
              ? `${comparable.latitude}, ${comparable.longitude}` : "—"}
          </Item>
        </dl>
      </Section>

      <Section title="Fuente de información">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-4">
          <Item label="Fuente o portal">{comparable.sourceName || "—"}</Item>
          <Item label="Anunciante">{comparable.contactName || "—"}</Item>
          <Item label="Teléfono">{comparable.contactPhone || "—"}</Item>
          <Item label="Fecha de consulta">{dayText(comparable.consultedOn)}</Item>
          <Item label="Liga del anuncio" wide>
            {comparable.url ? (
              <a className="inline-flex items-center gap-1 break-all text-primary underline-offset-2 hover:underline" href={comparable.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5 shrink-0" /> {comparable.url}
              </a>
            ) : "—"}
          </Item>
          <Item label="Vigencia de la oferta">{dayText(comparable.validUntil)}</Item>
        </dl>
        {comparable.listingText ? (
          <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">Texto del anuncio como se pegó</summary>
            <p className="mt-2 text-xs whitespace-pre-wrap">{comparable.listingText}</p>
          </details>
        ) : null}
      </Section>

      <Section title="Terreno, construcción y características">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-4">
          <Item label="Uso de suelo">{comparable.landUse || "—"}</Item>
          {builtins.filter((field) => !["area", "price", "notes"].includes(field.key)).map((field) => {
            const value = comparable[field.key as keyof typeof comparable];
            // The format's tag of the zoning key reads "USO DE SUELO", like the description above it.
            const label = field.key === "landUseKey" ? "Clave de uso de suelo" : field.label.charAt(0) + field.label.slice(1).toLowerCase();
            return <Item key={field.key} label={label}>{value === null || value === undefined || value === "" ? "—" : String(value)}</Item>;
          })}
          {isBuiltComparableType(type) ? (
            <>
              <Item label="Tipo de construcción">{comparable.constructionType || "—"}</Item>
              <Item label="Superficie de terreno (m²)"><span className="tabular-nums">{number(comparable.landArea)}</span></Item>
              <Item label="Recámaras">{number(comparable.bedrooms)}</Item>
              <Item label="Baños">{number(comparable.bathrooms)}</Item>
            </>
          ) : null}
          {extra.map(([key, value]) => <Item key={key} label={key.replace(/^custom:/, "")}>{value}</Item>)}
          <Item label="Observaciones" wide>{comparable.notes || "—"}</Item>
        </dl>
      </Section>

      {review && review.status !== "POR_REVISAR" ? (
        <Section title="Revisión">
          <p>
            {REVIEW_STATUS_LABELS[review.status]}
            {review.reviewedBy ? ` por ${review.reviewedBy}` : ""}
            {review.reviewedAt ? ` el ${new Date(review.reviewedAt).toLocaleString("es-MX")}` : ""}
          </p>
          <ul className="flex flex-wrap gap-1 text-xs">
            {REVIEW_CHECKS.filter((check) => review.checks[check] !== undefined).map((check) => (
              <li key={check}><Badge variant={review.checks[check] ? "secondary" : "destructive"}>{review.checks[check] ? "✓" : "✗"} {REVIEW_CHECK_LABELS[check]}</Badge></li>
            ))}
          </ul>
          {review.notes ? <p className="text-xs whitespace-pre-wrap">{review.notes}</p> : null}
        </Section>
      ) : null}

      <Section title="Avalúos en que se usó">
        <ul className="grid gap-1">
          {card.uses.map((use) => (
            <li key={`${use.valuationId}:${use.type}:${use.reference}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{use.folio}</span>
              <span className="text-muted-foreground">{use.title ?? ""}</span>
              {use.client ? <span className="text-xs text-muted-foreground">· cliente {use.client}</span> : null}
              <span className="text-xs text-muted-foreground">· {COMPARABLE_TYPE_LABELS[use.type]}, comparable {use.reference}, agregado el {dayText(use.addedOn)}</span>
              <a className="text-xs text-primary underline-offset-2 hover:underline" href={`/workspace?id=${use.valuationId}`} target="_blank" rel="noopener noreferrer">Abrir avalúo</a>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}

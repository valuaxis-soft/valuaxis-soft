/**
 * The hover card of a pin, as HTML the map's own info window shows: the
 * photo, the type, the value, the surface and the validity. Light colors,
 * like the map's popups; the same look as the demonstration.
 */
import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { isLandComparableType, isRentComparableType } from "@/features/valuations/calculation/market-types";

import { baseMapLayer } from "./layers";
import type { ComparablePinDto, ValuationPinDto } from "./types";

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export const formatMoney = (value: number) => "$" + Math.round(value).toLocaleString("es-MX");
const formatArea = (value: number) => `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²`;

/** "180 m² · 3 rec · 2.5 baños" for a building, "250 m² de terreno" for land; empty without an area. */
export function pinFeatures(pin: Pick<ComparablePinDto, "type" | "area" | "landArea" | "builtArea" | "bedrooms" | "bathrooms">) {
  if (isLandComparableType(pin.type)) return pin.area === null ? "" : `${formatArea(pin.area)} de terreno`;
  const parts = [
    pin.builtArea !== null ? formatArea(pin.builtArea) : pin.area !== null ? formatArea(pin.area) : null,
    pin.bedrooms !== null ? `${pin.bedrooms} rec` : null,
    pin.bathrooms !== null ? `${pin.bathrooms} baños` : null,
    pin.landArea !== null && pin.builtArea !== null ? `terreno ${formatArea(pin.landArea)}` : null,
  ];
  return parts.filter((part): part is string => part !== null).join(" · ");
}

/** The price and, when there is an area, the unit value: "$3,200,000 · $17,778/m²"; "/mes" for a rent. */
export function pinPriceLine(pin: Pick<ComparablePinDto, "type" | "area" | "price">) {
  if (pin.price === null) return "Sin precio";
  const rent = isRentComparableType(pin.type);
  const unit = pin.area ? ` · ${formatMoney(pin.price / pin.area)}/m²${rent ? " al mes" : ""}` : "";
  return `${formatMoney(pin.price)}${rent ? " /mes" : ""}${unit}`;
}

const photo = (pin: ComparablePinDto) =>
  pin.thumbnailUrl
    ? `<img src="${escapeHtml(pin.thumbnailUrl)}" alt="" style="display:block;width:100%;height:96px;object-fit:cover;border-radius:8px 8px 0 0">`
    : `<div style="height:48px;border-radius:8px 8px 0 0;background:#e9eef2"></div>`;

const line = (text: string) => `<span style="font-size:11.5px;color:#5a6b7b">${escapeHtml(text)}</span>`;

export function comparablePinCardHtml(pin: ComparablePinDto) {
  const layer = baseMapLayer(pin.type);
  const features = pinFeatures(pin);
  return `<div style="width:240px;display:grid;color:#12212f;font-family:inherit;white-space:normal">${photo(pin)}<div style="padding:8px 10px 10px;display:grid;gap:3px">`
    + `<span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:${layer.color};font-weight:600">${escapeHtml(`${formatComparableId(pin.folio) ?? "Sin número"} · ${layer.title}`)}</span>`
    + `<span style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">${escapeHtml(pinPriceLine(pin))}</span>`
    + (features ? line(features) : "")
    + line(pin.location)
    + line(`${pin.expired ? "Vencido" : "Vigente"} hasta ${formatDay(pin.validUntil)}${pin.sourceName ? ` · ${pin.sourceName}` : ""}`)
    + `</div></div>`;
}

export function valuationPinCardHtml(pin: ValuationPinDto) {
  const date = new Date(pin.updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  return `<div style="width:220px;display:grid;gap:3px;padding:4px 2px;color:#12212f;font-family:inherit;white-space:normal">`
    + `<strong style="font-size:13px">${escapeHtml(pin.folio)}</strong>`
    + line(pin.title)
    + (pin.client ? line(`Cliente: ${pin.client}`) : "")
    + line(`${pin.statusName}${pin.archived ? " · archivado" : ""} · ${date}`)
    + `</div>`;
}

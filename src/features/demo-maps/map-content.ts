/**
 * HTML the map libraries show by themselves (hover card, street labels) and
 * the colors of the drawn base map. Both renderers share them.
 */
import { comparableType, formatMoney, type DemoComparable } from "./geo";

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** A drawn stand-in for the listing's photo. */
function photo(c: DemoComparable) {
  const sky = c.land ? "#cfe3c4" : "#d6e6f5";
  const body = c.land
    ? `<rect x="0" y="62" width="240" height="34" fill="#9bbf7a"/><path d="M20 70 L80 64 L140 72 L220 66" stroke="#7a9a5c" stroke-width="3" fill="none"/><rect x="150" y="40" width="4" height="30" fill="#6b4f2a"/><rect x="128" y="38" width="48" height="16" fill="#fff" stroke="#c0392b"/><text x="152" y="50" font-size="8" text-anchor="middle" fill="#c0392b" font-family="sans-serif">${c.rent ? "RENTA" : "VENTA"}</text>`
    : `<rect x="0" y="76" width="240" height="20" fill="#b8c2b0"/><rect x="66" y="34" width="108" height="46" fill="#f3e3c3" stroke="#a7916a"/><path d="M58 38 L120 10 L182 38 Z" fill="#a0522d"/><rect x="108" y="54" width="20" height="26" fill="#6b4f2a"/><rect x="78" y="46" width="20" height="14" fill="#9cc3e6"/><rect x="142" y="46" width="20" height="14" fill="#9cc3e6"/>`;
  return `<svg viewBox="0 0 240 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display:block;width:100%;height:96px;border-radius:8px 8px 0 0"><rect width="240" height="96" fill="${sky}"/>${body}</svg>`;
}

/** Hover card of a comparable. Light colors, like the map's own popups. */
export function comparableCardHtml(c: DemoComparable) {
  const unit = c.rent ? `${formatMoney(c.price / c.area)}/m² al mes` : `${formatMoney(c.price / c.area)}/m²`;
  const features = c.land ? `${c.area} m² de terreno` : `${c.area} m² · ${c.bedrooms} rec · ${c.bathrooms} baños`;
  const date = c.date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  const line = (text: string) => `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#5a6b7b">${escapeHtml(text)}</span>`;
  return `<div style="width:240px;display:grid;color:#12212f;font-family:inherit;white-space:normal">${photo(c)}<div style="padding:8px 10px 10px;display:grid;gap:3px">`
    + `<span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5a6b7b;font-weight:600">${escapeHtml(`${c.ref} · ${comparableType(c.kind).name}`)}</span>`
    + `<span style="font-size:16px;font-weight:700;font-variant-numeric:tabular-nums">${escapeHtml(formatMoney(c.price) + (c.rent ? " /mes" : ""))}</span>`
    + line(features) + line(unit) + line(`${c.street}, ${c.colonia}`)
    + line(`${c.source} · ${date} · ${c.current ? "vigente" : "vencido"}`)
    + `<span style="font-size:10.5px;color:#b06d10;font-weight:600">Anuncio ficticio de ejemplo</span>`
    + `</div></div>`;
}

export interface BasePalette {
  ground: string;
  park: string;
  road: string;
  roadCase: string;
  avenue: string;
  avenueCase: string;
  label: string;
}

const LIGHT: BasePalette = {
  ground: "#eef1ea",
  park: "#cfe3c4",
  road: "#ffffff",
  roadCase: "#c4ccd4",
  avenue: "#fbe7b4",
  avenueCase: "#d9b766",
  label: "#3b4b5a",
};

const DARK: BasePalette = {
  ground: "#1b2620",
  park: "#24402c",
  road: "#3a4652",
  roadCase: "#26313b",
  avenue: "#6b5a2c",
  avenueCase: "#4a3f20",
  label: "#c4d0db",
};

/** The printed croquis always uses the light palette, like the PDF. */
export function basePalette(dark: boolean) {
  return dark ? DARK : LIGHT;
}

export const SUBJECT_COLOR = "#c0392b";
export const VALUATION_COLOR = "#0b3a5b";

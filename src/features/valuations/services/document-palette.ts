/**
 * The colours of the dictamen: a strong one for titles, bars and the headers
 * that print filled, and a pastel one for the header band and the shaded rows
 * of its tables. One choice for the whole document, kept on its carátula
 * section like the title bars; the firm keeps the one its new valuations
 * start with. The document reads them as CSS variables set at its root, each
 * with the colour it always printed as its fallback: a document that chose
 * nothing prints exactly as before.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { z } from "zod";

export type DocumentPalette = {
  /** Titles, bars, frames and the filled boxes: "#RRGGBB". */
  strong: string;
  /** The header band and the shaded rows of the tables: "#RRGGBB". */
  pastel: string;
};

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Escribe el color como #RRGGBB.")
  .transform((value) => value.toUpperCase());

/** Only two "#RRGGBB" colours: they end up in the style of the document. */
export const documentPaletteSchema = z.object({ strong: hexColor, pastel: hexColor });

/** What the document always printed: its dark blue and the light blue of its tables. */
export const DEFAULT_DOCUMENT_PALETTE: DocumentPalette = { strong: "#00285A", pastel: "#BDD7EE" };

export type DocumentPalettePreset = DocumentPalette & { key: string; name: string };

/** The palettes offered: each strong colour takes white text and each pastel dark text at AA or better. */
export const DOCUMENT_PALETTE_PRESETS: readonly DocumentPalettePreset[] = [
  { key: "azul", name: "Azul clásico", ...DEFAULT_DOCUMENT_PALETTE },
  { key: "marino", name: "Marino", strong: "#011541", pastel: "#D6DEEE" },
  { key: "acero", name: "Azul acero", strong: "#1F4E79", pastel: "#DDEBF7" },
  { key: "bosque", name: "Verde bosque", strong: "#1E5631", pastel: "#D5E8D4" },
  { key: "petroleo", name: "Verde petróleo", strong: "#0F5257", pastel: "#CFE8E6" },
  { key: "vino", name: "Vino", strong: "#6B1F2E", pastel: "#F2D7DB" },
  { key: "terracota", name: "Terracota", strong: "#8A3B1E", pastel: "#F6DCCB" },
  { key: "morado", name: "Morado", strong: "#4B2A6B", pastel: "#E3D7F0" },
  { key: "grafito", name: "Gris grafito", strong: "#2F3640", pastel: "#DFE3E8" },
  { key: "cafe", name: "Café", strong: "#6B4A16", pastel: "#F1E3C4" },
];

/** A stored palette read back; anything else is no palette. */
export function readDocumentPalette(value: unknown): DocumentPalette | undefined {
  const parsed = documentPaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const sameDocumentPalette = (a: DocumentPalette, b: DocumentPalette) =>
  a.strong.toUpperCase() === b.strong.toUpperCase() && a.pastel.toUpperCase() === b.pastel.toUpperCase();

/** The preset a palette is, or undefined for one of the appraiser's own. */
export const documentPalettePreset = (palette: DocumentPalette) =>
  DOCUMENT_PALETTE_PRESETS.find((preset) => sameDocumentPalette(preset, palette));

/* ── Contrast (WCAG 2) ─────────────────────────────────────────── */

const WHITE = "#FFFFFF";
/** The dark text of the document. */
const DARK = "#1A1A1A";
/** AA for text of normal size. */
export const AA_TEXT_CONTRAST = 4.5;

const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** Relative luminance of "#RRGGBB", 0 (black) to 1 (white). */
export function relativeLuminance(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** White or dark text, whichever reads better over a background. */
export const readableTextOn = (background: string) =>
  contrastRatio(WHITE, background) >= contrastRatio(DARK, background) ? WHITE : DARK;

/** `weight` of `hex` over white (1: the colour itself, 0: white). */
function tint(hex: string, weight: number) {
  const mixed = channels(hex).map((channel) => Math.round(channel * weight + 255 * (1 - weight)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** A lighter tint of the pastel that still takes the document's dark text. */
function softTint(pastel: string) {
  return [0.5, 0.3, 0.15].map((weight) => tint(pastel, weight)).find((color) => contrastRatio(DARK, color) >= AA_TEXT_CONTRAST) ?? tint(pastel, 0.08);
}

export type DocumentPaletteContrast = {
  /** White text over the strong colour (the same ratio as the strong colour as text on the paper). */
  strong: { ratio: number; passes: boolean };
  /** Dark text over the pastel colour. */
  pastel: { ratio: number; passes: boolean };
};

export function documentPaletteContrast(palette: DocumentPalette): DocumentPaletteContrast {
  const strong = contrastRatio(WHITE, palette.strong);
  const pastel = contrastRatio(DARK, palette.pastel);
  return {
    strong: { ratio: strong, passes: strong >= AA_TEXT_CONTRAST },
    pastel: { ratio: pastel, passes: pastel >= AA_TEXT_CONTRAST },
  };
}

const ratioText = (ratio: number) => `${ratio.toFixed(1)}:1`;

/**
 * What the appraiser is told of a palette that reads poorly. It never stops
 * the choice: the document turns the text over each colour dark or white by
 * itself, and this says what will still read badly.
 */
export function documentPaletteWarnings(palette: DocumentPalette): string[] {
  const contrast = documentPaletteContrast(palette);
  const warnings: string[] = [];
  if (!contrast.strong.passes) {
    warnings.push(
      `El color fuerte es muy claro: el texto blanco sobre él tiene un contraste de ${ratioText(contrast.strong.ratio)} (se recomienda 4.5:1 o más). Las barras se imprimirán con letra oscura, pero los títulos de ese color sobre el papel se leerán poco.`,
    );
  }
  if (!contrast.pastel.passes) {
    warnings.push(
      `El color pastel es muy oscuro: el texto oscuro sobre él tiene un contraste de ${ratioText(contrast.pastel.ratio)} (se recomienda 4.5:1 o más). Los encabezados de las tablas se imprimirán con letra clara.`,
    );
  }
  return warnings;
}

/* ── CSS variables ─────────────────────────────────────────────── */

/** The two blues every root of the document has always set. */
const DEFAULT_VARS: Readonly<Record<string, string>> = { "--caratula-blue": "#003B73", "--caratula-dark-blue": "#00285A" };

/**
 * The CSS variables the root of a document sets. Without a palette (or with
 * the default one) only the two blues it always set, so every other colour
 * falls back to the value written beside its `var()`; with a palette, the
 * strong and pastel colours, the text that reads over each one and the tints
 * derived from them.
 */
export function documentPaletteVars(palette?: DocumentPalette | null): Record<string, string> {
  const chosen = palette ? readDocumentPalette(palette) : undefined;
  if (!chosen || sameDocumentPalette(chosen, DEFAULT_DOCUMENT_PALETTE)) return { ...DEFAULT_VARS };
  const { strong, pastel } = chosen;
  return {
    "--caratula-blue": strong,
    "--caratula-dark-blue": strong,
    "--doc-apartado": strong,
    "--doc-on-strong": readableTextOn(strong),
    "--doc-strong-soft": tint(strong, 0.45),
    "--doc-rule": tint(strong, 0.35),
    "--doc-pastel": pastel,
    // The strong colour over the pastel when it reads; otherwise white or dark.
    "--doc-on-pastel": contrastRatio(strong, pastel) >= AA_TEXT_CONTRAST ? strong : readableTextOn(pastel),
    "--doc-ink-on-pastel": readableTextOn(pastel),
    "--doc-pastel-soft": softTint(pastel),
    "--doc-on-pastel-soft": contrastRatio(strong, softTint(pastel)) >= AA_TEXT_CONTRAST ? strong : DARK,
    // The shaded rows of the tables and the boxes of a value (the cover's concluded value among them) follow the pastel
    // too, one tint for all of them: grey-blue rows under green or terracotta titles read as another document.
    "--doc-zebra": tint(pastel, 0.35),
    "--doc-zebra-strong": tint(pastel, 0.6),
  };
}

/** The colours a palette prints with, for a sample of it beside its choice. */
export function documentPaletteSample(palette?: DocumentPalette | null) {
  const vars = documentPaletteVars(palette);
  return {
    strong: vars["--caratula-dark-blue"],
    onStrong: vars["--doc-on-strong"] ?? WHITE,
    pastel: vars["--doc-pastel"] ?? DEFAULT_DOCUMENT_PALETTE.pastel,
    onPastel: vars["--doc-on-pastel"] ?? DEFAULT_DOCUMENT_PALETTE.strong,
  };
}

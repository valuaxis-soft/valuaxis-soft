/**
 * The north arrow as SVG markup: the three symbols the client sent, in a
 * 40×64 box over a translucent white card. The React component lays the
 * markup over the interactive map and the server composes it onto the
 * croquis image with sharp, so both draw exactly the same symbol.
 */
import type { MapCorner, NorthArrowStyle } from "./map-styles";

export const NORTH_ARROW_BOX = { width: 40, height: 64 } as const;

const TEXT = 'font-family="Arial, Helvetica, sans-serif" font-weight="700"';

const SYMBOLS: Record<NorthArrowStyle, string> = {
  flecha: `<text x="20" y="22" text-anchor="middle" font-size="24" ${TEXT}>N</text><path d="M20 26 L31 61 L20 53 L9 61 Z"/>`,
  aguja:
    `<text x="20" y="18" text-anchor="middle" font-size="20" ${TEXT}>N</text>` +
    `<circle cx="20" cy="43" r="17.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="17.5" y="25.5" width="5" height="18.5"/>`,
  punta:
    `<path d="M20 2 L3 44 L20 35 Z" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M20 2 L37 44 L20 35 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<text x="20" y="62" text-anchor="middle" font-size="20" ${TEXT}>N</text>`,
};

/** The card and the symbol, without the <svg> element: the component and the server wrap it as each needs. */
export function northArrowMarkup(style: NorthArrowStyle) {
  return `<rect x="-4" y="-2" width="48" height="68" rx="4" fill="rgba(255,255,255,0.85)"/>${SYMBOLS[style]}`;
}

/** A complete SVG document of the symbol, `height` pixels tall, for the server to compose over an image. */
export function northArrowSvg(style: NorthArrowStyle, height: number) {
  const width = Math.round((height * NORTH_ARROW_BOX.width) / NORTH_ARROW_BOX.height);
  // The card overflows the box by 4 px on each side: the viewBox takes it in so nothing is cut.
  const scale = height / NORTH_ARROW_BOX.height;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width + 8 * scale)}" height="${Math.round(height + 8 * scale)}" viewBox="-4 -2 48 68" fill="#000" color="#000">` +
    `${northArrowMarkup(style)}</svg>`
  );
}

/** Where a symbol of `symbol` pixels goes over an image of `image` pixels, `margin` pixels from the chosen corner. */
export function northArrowPlacement(corner: MapCorner, image: { width: number; height: number }, symbol: { width: number; height: number }, margin: number) {
  return {
    left: corner.endsWith("left") ? margin : image.width - symbol.width - margin,
    top: corner.startsWith("top") ? margin : image.height - symbol.height - margin,
  };
}

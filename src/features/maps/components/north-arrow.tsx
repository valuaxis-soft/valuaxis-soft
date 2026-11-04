import type { MapCorner, NorthArrow as NorthArrowConfig } from "../map-styles";
import { NORTH_ARROW_BOX, northArrowMarkup } from "../north-arrow-symbols";

const CORNER_CLASS: Record<MapCorner, string> = {
  "top-left": "top-2.5 left-2.5",
  "top-right": "top-2.5 right-2.5",
  "bottom-left": "bottom-2.5 left-2.5",
  "bottom-right": "bottom-2.5 right-2.5",
};

interface NorthArrowProps extends NorthArrowConfig {
  /** Height in pixels. */
  size?: number;
  /** Over the maps the symbol must not swallow clicks. */
  className?: string;
}

/** North arrow laid over a map or a croquis, in the chosen corner. Inline SVG, so it prints as drawn. */
export function NorthArrow({ style, corner, size = 48, className = "" }: NorthArrowProps) {
  return (
    <svg
      viewBox={`0 0 ${NORTH_ARROW_BOX.width} ${NORTH_ARROW_BOX.height}`}
      width={(size * NORTH_ARROW_BOX.width) / NORTH_ARROW_BOX.height}
      height={size}
      role="img"
      aria-label="Norte"
      className={`pointer-events-none absolute z-[500] overflow-visible fill-current text-black ${CORNER_CLASS[corner]} ${className}`}
      // Markup of our own (north-arrow-symbols.ts), the same the server composes onto the croquis image.
      dangerouslySetInnerHTML={{ __html: northArrowMarkup(style) }}
    />
  );
}

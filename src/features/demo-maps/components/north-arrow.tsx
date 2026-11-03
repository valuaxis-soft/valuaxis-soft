import type { MapCorner, NorthArrow as NorthArrowConfig, NorthArrowStyle } from "../map-styles";

const CORNER_CLASS: Record<MapCorner, string> = {
  "top-left": "top-2.5 left-2.5",
  "top-right": "top-2.5 right-2.5",
  "bottom-left": "bottom-2.5 left-2.5",
  "bottom-right": "bottom-2.5 right-2.5",
};

const TEXT = { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700 } as const;

/** The three symbols the client sent, in a 40×64 box. */
const SYMBOLS: Record<NorthArrowStyle, React.ReactNode> = {
  flecha: (
    <>
      <text x="20" y="22" textAnchor="middle" fontSize="24" style={TEXT}>
        N
      </text>
      <path d="M20 26 L31 61 L20 53 L9 61 Z" />
    </>
  ),
  aguja: (
    <>
      <text x="20" y="18" textAnchor="middle" fontSize="20" style={TEXT}>
        N
      </text>
      <circle cx="20" cy="43" r="17.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="17.5" y="25.5" width="5" height="18.5" />
    </>
  ),
  punta: (
    <>
      <path d="M20 2 L3 44 L20 35 Z" fill="#fff" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 2 L37 44 L20 35 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="20" y="62" textAnchor="middle" fontSize="20" style={TEXT}>
        N
      </text>
    </>
  ),
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
      viewBox="0 0 40 64"
      width={(size * 40) / 64}
      height={size}
      role="img"
      aria-label="Norte"
      className={`pointer-events-none absolute z-[500] overflow-visible fill-current text-black ${CORNER_CLASS[corner]} ${className}`}
    >
      <rect x="-4" y="-2" width="48" height="68" rx="4" fill="rgba(255,255,255,0.85)" />
      {SYMBOLS[style]}
    </svg>
  );
}

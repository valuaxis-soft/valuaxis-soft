import type { CSSProperties } from "react";

/**
 * Small drawings for the approach cards. They use the theme tokens so they
 * follow light and dark; all are decorative. Each one builds itself when its
 * card scrolls into view (sequence classes in motion.css), starting `base` ms
 * after the trigger.
 */

type VisualProps = { base?: number };

/** Delay variables for one element of a sequence. */
const at = (base: number, index = 0, stagger?: number): CSSProperties =>
  ({
    ["--vx-base" as string]: `${base}ms`,
    ["--vx-i" as string]: index,
    ...(stagger === undefined ? {} : { ["--vx-stagger" as string]: `${stagger}ms` }),
  }) as CSSProperties;

function MarketVisual({ base = 0 }: VisualProps) {
  // Offer prices (navy) pulled to the homologated value (green line).
  const bars = [62, 78, 66, 74, 70];
  return (
    <svg viewBox="0 0 200 90" className="h-full w-full" aria-hidden="true">
      {bars.map((height, index) => (
        <rect
          key={index}
          x={18 + index * 36}
          y={84 - height}
          width="20"
          height={height}
          rx="3"
          className="vx-seq-grow-y fill-primary/80"
          style={at(base, index)}
        />
      ))}
      <line x1="10" x2="190" y1="16" y2="16" className="vx-seq-grow-x stroke-success" strokeWidth="2.5" strokeDasharray="5 4" style={at(base + 550)} />
      <circle cx="190" cy="16" r="4" className="vx-seq-pop fill-success" style={at(base + 1000)} />
    </svg>
  );
}

function CostVisual({ base = 0 }: VisualProps) {
  // Replacement cost depreciated with age: 1 − (E/VUT)^1.4.
  const points = Array.from({ length: 21 }, (_, i) => {
    const age = i / 20;
    const factor = 1 - Math.pow(age, 1.4) * 0.85;
    return `${12 + age * 176},${10 + (1 - factor) * 70}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 200 90" className="h-full w-full" aria-hidden="true">
      <path d="M12 84h176M12 6v78" className="stroke-border" strokeWidth="1.5" />
      <g className="vx-seq-draw" style={{ ...at(base), ["--vx-len" as string]: 1 }}>
        <polyline points={points} pathLength={1} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="35" r="4.5" className="vx-seq-pop fill-highlight stroke-card" strokeWidth="2" style={at(base + 700)} />
    </svg>
  );
}

function IncomeVisual({ base = 0 }: VisualProps) {
  // Twelve monthly rents feeding a capitalized value.
  return (
    <svg viewBox="0 0 200 90" className="h-full w-full" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x={10 + i * 11}
          y={i === 3 || i === 8 ? 62 : 50}
          width="7"
          height={i === 3 || i === 8 ? 22 : 34}
          rx="2"
          className={i === 3 || i === 8 ? "vx-seq-grow-y fill-muted-foreground/30" : "vx-seq-grow-y fill-primary/75"}
          style={at(base, i, 55)}
        />
      ))}
      <g className="vx-seq-fade" style={at(base + 750)}>
        <path d="M146 67h14" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
        <path d="m156 62 5 5-5 5" fill="none" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="166" y="20" width="24" height="64" rx="4" className="vx-seq-grow-y fill-success" style={at(base + 950)} />
    </svg>
  );
}

export const APPROACH_VISUALS = {
  mercado: MarketVisual,
  costos: CostVisual,
  ingresos: IncomeVisual,
} as const;

/** A scatter of comparables with the fitted regression line drawn on entry. */
export function RegressionVisual() {
  const dots = [
    [30, 150], [52, 138], [70, 142], [92, 118], [108, 124], [130, 100], [148, 106], [170, 84], [186, 90], [206, 70], [226, 74], [244, 52],
  ];
  return (
    <svg viewBox="0 0 270 180" className="h-auto w-full" aria-hidden="true">
      <path d="M18 168h240M18 12v156" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      {[48, 88, 128].map((y) => (
        <path key={y} d={`M18 ${y}h240`} stroke="currentColor" strokeOpacity="0.08" />
      ))}
      {dots.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="4.5" className="vx-seq-pop fill-ink-foreground/85" style={at(100, index, 60)} />
      ))}
      <path d="M22 158 252 46" className="vx-draw stroke-success" strokeWidth="3" strokeLinecap="round" style={{ ["--vx-draw-length" as string]: 260 }} />
      <circle cx="196" cy="73" r="7" className="vx-seq-pop fill-highlight stroke-ink" strokeWidth="2.5" style={at(1300)} />
    </svg>
  );
}

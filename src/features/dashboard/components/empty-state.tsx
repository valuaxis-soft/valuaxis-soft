import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Illustration = "valuations" | "search" | "comparables" | "activity" | "all-clear";

/**
 * Small line drawings for the empty states. Only theme tokens (fill-/stroke-
 * primary, success, highlight, muted, border), so they follow the palette and dark mode.
 */
function Drawing({ kind }: { kind: Illustration }) {
  const common = { viewBox: "0 0 160 120", "aria-hidden": true, focusable: false, className: "h-28 w-auto" } as const;
  switch (kind) {
    case "valuations":
      // A house over a document with a check: the first valuation.
      return (
        <svg {...common}>
          <ellipse cx="80" cy="108" rx="54" ry="6" className="fill-muted" />
          <rect x="44" y="26" width="64" height="78" rx="8" className="fill-card stroke-border" strokeWidth="2" />
          <rect x="54" y="72" width="34" height="5" rx="2.5" className="fill-muted" />
          <rect x="54" y="83" width="44" height="5" rx="2.5" className="fill-muted" />
          <path d="M58 58V45l18-14 18 14v13z" className="fill-primary/10 stroke-primary" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="70" y="48" width="12" height="10" rx="1.5" className="fill-primary/25" />
          <circle cx="110" cy="34" r="14" className="fill-success/20 stroke-success" strokeWidth="2.5" />
          <path d="m104 34 4.5 4.5L117 30" fill="none" className="stroke-success" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "search":
      // A magnifier over a list with no match.
      return (
        <svg {...common}>
          <ellipse cx="80" cy="108" rx="50" ry="6" className="fill-muted" />
          <rect x="34" y="24" width="70" height="72" rx="8" className="fill-card stroke-border" strokeWidth="2" />
          {[38, 52, 66].map((y) => (
            <g key={y}>
              <circle cx="48" cy={y} r="4" className="fill-muted" />
              <rect x="58" y={y - 3} width="34" height="6" rx="3" className="fill-muted" />
            </g>
          ))}
          <circle cx="104" cy="66" r="20" className="fill-background/60 stroke-primary" strokeWidth="3" />
          <path d="m119 81 14 14" className="stroke-primary" strokeWidth="6" strokeLinecap="round" />
          <path d="m97 59 14 14m0-14-14 14" className="stroke-muted-foreground" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "comparables":
      // A folded map with three pins.
      return (
        <svg {...common}>
          <ellipse cx="80" cy="108" rx="56" ry="6" className="fill-muted" />
          <path d="M28 32l34-10 36 10 34-10v70l-34 10-36-10-34 10z" className="fill-card stroke-border" strokeWidth="2" strokeLinejoin="round" />
          <path d="M62 22v70M98 32v70" className="stroke-border" strokeWidth="2" />
          <path d="M40 76c14-8 26 4 40-4s24-14 40-6" fill="none" className="stroke-primary/30" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" />
          {[
            [48, 56, "fill-highlight"],
            [80, 44, "fill-primary"],
            [114, 60, "fill-success"],
          ].map(([x, y, fill]) => (
            <g key={`${x}`}>
              <path d={`M${x} ${Number(y) + 14}c-6-8-10-12-10-18a10 10 0 0 1 20 0c0 6-4 10-10 18z`} className={String(fill)} />
              <circle cx={x} cy={Number(y) - 4} r="3.5" className="fill-background" />
            </g>
          ))}
        </svg>
      );
    case "activity":
      // A timeline with three quiet dots.
      return (
        <svg {...common} className="h-20 w-auto">
          <path d="M44 20v80" className="stroke-border" strokeWidth="2" strokeDasharray="4 6" />
          {[30, 60, 90].map((y, index) => (
            <g key={y}>
              <circle cx="44" cy={y} r="7" className={index === 0 ? "fill-primary/20 stroke-primary" : "fill-card stroke-border"} strokeWidth="2" />
              <rect x="60" y={y - 7} width={index === 0 ? 64 : 52} height="6" rx="3" className="fill-muted" />
              <rect x="60" y={y + 3} width="36" height="4" rx="2" className="fill-muted/70" />
            </g>
          ))}
        </svg>
      );
    case "all-clear":
      // A shield with a check: nothing waiting.
      return (
        <svg {...common} className="h-20 w-auto">
          <ellipse cx="80" cy="108" rx="36" ry="5" className="fill-muted" />
          <path d="M80 14l34 12v26c0 24-15 40-34 48-19-8-34-24-34-48V26z" className="fill-success/15 stroke-success" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="m66 56 10 10 20-22" fill="none" className="stroke-success" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

/** An empty list that says why it is empty and what to do next. */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  illustration: Illustration;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Inside a card of the dashboard: less vertical room. */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12 sm:py-16", className)}>
      <Drawing kind={illustration} />
      <p className={cn("font-semibold text-balance", compact ? "text-sm" : "text-base")}>{title}</p>
      {description ? <p className="max-w-md text-sm text-pretty text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

import { cn } from "@/lib/utils";

/**
 * Valuaxis mark: a roof outline over a "V". The tile takes the primary color
 * and the "V" the accent color, so it follows the theme tokens.
 */
export function ValuaxisMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M7.5 15.5 16 8.5l8.5 7"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <path
        d="m11 15.5 5 8 5-8"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-chart-2"
      />
    </svg>
  );
}

/** Mark plus the "Valuaxis" wordmark. */
export function ValuaxisLogo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground", className)}>
      <ValuaxisMark className={markClassName} />
      <span>
        Valu<span className="text-primary">axis</span>
      </span>
    </span>
  );
}

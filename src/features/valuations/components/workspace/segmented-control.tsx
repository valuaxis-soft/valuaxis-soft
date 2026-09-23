"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SegmentedControlOption<T extends string> = {
  icon: LucideIcon;
  label: string;
  value: T;
};

/**
 * Always-visible single choice control built on native radio inputs: Tab
 * enters the group, arrow keys move the selection and taps/clicks work on the
 * whole segment. The label text is the accessible name; `labelClassName` can
 * hide it visually (e.g. `sr-only`) for icon-only segments, and the `title`
 * gives mouse users a tooltip.
 */
export function SegmentedControl<T extends string>({
  "aria-label": ariaLabel,
  className,
  labelClassName,
  onValueChange,
  options,
  segmentClassName,
  value,
}: {
  "aria-label": string;
  className?: string;
  labelClassName?: string;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  segmentClassName?: string;
  value: T;
}) {
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5", className)}
    >
      {options.map((option) => {
        const Icon = option.icon;

        return (
          <label
            key={option.value}
            title={option.label}
            className={cn(
              "relative inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[min(var(--radius-md),12px)] px-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors select-none hover:bg-muted hover:text-foreground has-checked:bg-secondary has-checked:text-secondary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
              segmentClassName,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            <Icon aria-hidden="true" />
            <span className={labelClassName}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

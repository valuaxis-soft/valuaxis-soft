"use client";

import { Settings } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * What the appraiser sets and the dictamen does not print, set apart from the
 * content that prints: a dashed border, its own background, a gear and the
 * label "Configuración — no se imprime".
 */
export function EditorConfigPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("grid gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/60 p-3 sm:p-4 dark:bg-muted/40", className)}
      data-editor-config=""
      aria-label={title}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Configuración — no se imprime
        </span>
      </header>
      {description ? <p className="-mt-1 text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}

/** An on/off switch with its label beside it. */
export function ConfigSwitch({
  checked,
  disabled,
  label,
  description,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          checked ? "border-primary bg-primary" : "border-input bg-input/60",
        )}
      >
        <span className={cn("inline-block size-4 rounded-full bg-background shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
      <span className="grid gap-0.5 text-sm">
        <span className="font-medium">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

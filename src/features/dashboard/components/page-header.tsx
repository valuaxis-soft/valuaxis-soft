import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Lists that need room: the comparables table. */
  wide: "max-w-[1760px]",
  /** The dashboard and the valuations list. */
  default: "max-w-7xl",
  /** Settings and forms. */
  narrow: "max-w-4xl",
} as const;

/** The main element of a private page: one width per kind of page, the same gutters everywhere. */
export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={cn("mx-auto w-full px-4 pt-6 pb-16 outline-none sm:pt-8 lg:px-6", WIDTHS[width], className)}>
      {children}
    </main>
  );
}

/** Title, one line of context and the page's actions; the actions wrap below the title on a phone. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A small line above the title (the section the page belongs to). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-sm font-medium text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {description ? <div className="mt-2 max-w-3xl text-sm text-pretty text-muted-foreground sm:text-base">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

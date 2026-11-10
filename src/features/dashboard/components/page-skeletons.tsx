import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading states of the private pages. Each one reserves the space of the real
 * page (same bar, same widths, same blocks) so nothing jumps when it arrives.
 */
export function PageSkeleton({
  label,
  width = "default",
  children,
}: {
  /** What is loading, for screen readers. */
  label: string;
  width?: "wide" | "default" | "narrow";
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-16 border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center gap-3 px-4 lg:px-6">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
          <div className="ml-6 hidden gap-2 lg:flex">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-24 rounded-md" />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg xl:w-64" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>
      <div
        className={cn(
          "mx-auto w-full px-4 pt-6 pb-16 sm:pt-8 lg:px-6",
          width === "wide" ? "max-w-[1760px]" : width === "narrow" ? "max-w-4xl" : "max-w-7xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {withAction ? <Skeleton className="h-10 w-36 rounded-lg" /> : null}
    </div>
  );
}

/** Rows of a list: a search, a line of filters and `rows` rows. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
      <Skeleton className="h-11 w-full rounded-lg sm:h-9 sm:max-w-md" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

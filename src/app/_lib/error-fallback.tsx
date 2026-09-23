"use client";

import Link from "next/link";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Next.js 16.2+: re-fetches and re-renders the segment, which also recovers server errors. */
  unstable_retry?: () => void;
};

/** Friendly error screen shared by error.tsx and global-error.tsx. It never shows the stack. */
export function ErrorFallback({ error, reset, unstable_retry }: ErrorBoundaryProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12 text-center">
      <ValuaxisLogo className="text-2xl" markClassName="size-10" />
      <div className="grid max-w-md gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Algo salió mal</h1>
        <p className="text-muted-foreground">
          No pudimos cargar esta pantalla por un problema inesperado. Intenta de nuevo; si el problema continúa, vuelve
          más tarde.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">Referencia del error: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => (unstable_retry ?? reset)()}
          className={cn(buttonVariants({ size: "lg" }), "px-4")}
        >
          Reintentar
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}>
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}

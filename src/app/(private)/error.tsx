"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ErrorBoundaryProps } from "../_lib/error-fallback";

/** An unexpected error in a private page: a calm message, "Intentar de nuevo" and the way home. */
export default function PrivateError({ error, reset, unstable_retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("[PRIVATE_PAGE_ERROR]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex h-16 items-center border-b border-border px-4 lg:px-6">
        <Link href="/dashboard" aria-label="Valuaxis, ir al inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ValuaxisLogo markClassName="size-8" className="text-base" />
        </Link>
      </div>
      <main id="contenido" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <svg viewBox="0 0 160 120" aria-hidden="true" focusable="false" className="h-28 w-auto">
          <ellipse cx="80" cy="108" rx="50" ry="6" className="fill-muted" />
          <path d="M36 60l44-36 44 36v44H36z" className="fill-card stroke-border" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M80 24l8 18-10 8 8 14-6 10" fill="none" className="stroke-chart-3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="66" y="78" width="28" height="26" rx="2" className="fill-primary/10 stroke-primary" strokeWidth="2" />
        </svg>
        <h1 className="text-2xl font-semibold tracking-tight">Algo no salió como esperábamos</h1>
        <p className="text-pretty text-muted-foreground">
          No pudimos mostrar esta página. Tu trabajo guardado está a salvo; intenta de nuevo en un momento y, si sigue pasando, avísanos.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => (unstable_retry ?? reset)()} className="h-11 gap-2 px-4 sm:h-10">
            <RotateCcw className="size-4" aria-hidden="true" />
            Intentar de nuevo
          </Button>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 sm:h-10")}>
            Ir al inicio
          </Link>
        </div>
        {error.digest ? <p className="text-xs text-muted-foreground">Referencia: {error.digest}</p> : null}
      </main>
    </div>
  );
}

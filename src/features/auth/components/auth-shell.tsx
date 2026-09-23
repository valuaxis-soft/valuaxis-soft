import type { ReactNode } from "react";
import Link from "next/link";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="grid w-full max-w-md gap-5">
        <div className="grid justify-items-center gap-2 text-center">
          <Link href="/" aria-label="Valuaxis, ir al inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ValuaxisLogo className="text-2xl" markClassName="size-10" />
          </Link>
          <p className="text-sm text-muted-foreground">Plataforma de avalúos inmobiliarios en línea</p>
        </div>
        {children}
      </div>
    </main>
  );
}

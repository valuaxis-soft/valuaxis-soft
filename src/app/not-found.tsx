import type { Metadata } from "next";
import Link from "next/link";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12 text-center">
      <Link href="/" aria-label="Valuaxis, ir al inicio">
        <ValuaxisLogo className="text-2xl" markClassName="size-10" />
      </Link>
      <div className="grid max-w-md gap-3">
        <p className="text-sm font-semibold text-primary">Error 404</p>
        <h1 className="text-3xl font-bold tracking-tight">No encontramos esta página</h1>
        <p className="text-muted-foreground">
          Es posible que el enlace esté incompleto o que la página se haya movido. Revisa la dirección o vuelve a un
          lugar conocido.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
          Ir al inicio
        </Link>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}>
          Ir al panel
        </Link>
      </div>
    </main>
  );
}

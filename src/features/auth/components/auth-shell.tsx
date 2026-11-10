import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { ValuaxisLogo, ValuaxisMark } from "@/components/brand/valuaxis-logo";
import { ContourLines } from "@/components/brand/contour-lines";

const highlights = [
  "Mercado, costos e ingresos con las fórmulas de tus libros",
  "Comparables de tu despacho con mapa y croquis",
  "Dictamen en PDF con numeración, anexos y firmas",
];

/**
 * Frame for the sign-in, sign-up and recovery pages: the brand panel on wide
 * screens and the form on paper. Layout only; each page keeps its own logic.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        aria-label="Valuaxis"
        className="relative isolate hidden overflow-hidden bg-ink p-10 text-ink-foreground lg:flex lg:flex-col xl:p-14"
      >
        {/* Stock photo (docs/DISENO.md, "Imágenes") under an ink veil that keeps the text at AA. */}
        <Image
          src="/marketing/acceso-fachada.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 48vw, 1px"
          className="-z-20 object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/85 via-ink/75 to-ink/95" />
        <ContourLines className="absolute inset-0 -z-10 h-full w-full text-ink-foreground/[0.08]" />
        <Link
          href="/"
          aria-label="Valuaxis, ir al inicio"
          className="flex w-fit items-center gap-2.5 rounded-lg text-xl font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ValuaxisMark className="size-9 rounded-lg ring-1 ring-white/25" />
          Valuaxis
        </Link>
        <div className="my-auto grid max-w-md gap-6 py-12">
          <p className="font-display text-4xl leading-[1.1] font-semibold text-balance xl:text-5xl">
            Del comparable al dictamen, <span className="text-success">en un solo lugar.</span>
          </p>
          <ul className="grid gap-3 text-ink-foreground/85">
            {highlights.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-ink-foreground/70">Software de avalúos inmobiliarios para valuadores en México.</p>
      </aside>

      {/* Touch-sized fields and full-width buttons (44 px) on these pages only. */}
      <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 [&_.w-full[data-slot=button]]:h-11 [&_[data-slot=input]]:h-11 [&_[data-slot=input]~[data-slot=button]]:size-10">

        <div className="grid w-full max-w-md gap-6">
          <div className="grid justify-items-center gap-2 text-center lg:hidden">
            <Link href="/" aria-label="Valuaxis, ir al inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <ValuaxisLogo className="text-2xl" markClassName="size-10" />
            </Link>
            <p className="text-sm text-muted-foreground">Software de avalúos inmobiliarios en línea</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

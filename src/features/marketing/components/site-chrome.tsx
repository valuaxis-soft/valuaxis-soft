import Link from "next/link";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "../content";

/** Sticky header of the public page. No client JavaScript: anchors and links only. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Valuaxis, inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ValuaxisLogo />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 text-sm lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link href="/iniciar-sesion" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-3")}>
            <span className="sm:hidden">Entrar</span>
            <span className="hidden sm:inline">Iniciar sesión</span>
          </Link>
          <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}>
            Crear cuenta
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <ValuaxisLogo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Software de avalúos inmobiliarios y de maquinaria para valuadores y despachos en México.
          </p>
        </div>
        <nav aria-label="Producto" className="grid content-start gap-1 text-sm">
          <p className="mb-1 font-semibold">Producto</p>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="w-fit py-1.5 text-muted-foreground hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Cuenta" className="grid content-start gap-1 text-sm">
          <p className="mb-1 font-semibold">Cuenta</p>
          <Link href="/registro" className="w-fit py-1.5 text-muted-foreground hover:text-foreground">
            Crear cuenta
          </Link>
          <Link href="/iniciar-sesion" className="w-fit py-1.5 text-muted-foreground hover:text-foreground">
            Iniciar sesión
          </Link>
          <Link href="/recuperar-contrasena" className="w-fit py-1.5 text-muted-foreground hover:text-foreground">
            Recuperar contraseña
          </Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Valuaxis · valuaxissoft.com · Hecho en México
        </p>
      </div>
    </footer>
  );
}

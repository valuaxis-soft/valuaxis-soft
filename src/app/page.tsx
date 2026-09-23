import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Blocks,
  Camera,
  CheckCircle2,
  FileStack,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/features/auth/session";
import { cn } from "@/lib/utils";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl, nonceFromContentSecurityPolicy } from "./_lib/site";

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const reportSections = [
  { name: "Carátula", detail: "Portada del informe con imagen principal y encabezado del documento." },
  { name: "Datos generales", detail: "Información general del inmueble y del avalúo, con fotografías." },
  { name: "Terreno", detail: "Descripción del terreno y su croquis." },
  { name: "Construcciones", detail: "Descripción de las construcciones del inmueble." },
  { name: "Consideraciones", detail: "Consideraciones previas a la conclusión del avalúo." },
  { name: "Enfoques", detail: "Espacio para documentar los enfoques de valor." },
  { name: "Anexos", detail: "Material de soporte que acompaña al informe." },
];

const features = [
  {
    icon: Blocks,
    title: "Bloques, conceptos y tablas configurables",
    description:
      "Arma cada sección con bloques y conceptos que puedes reordenar, y usa tablas con fórmulas para los cuadros del informe.",
  },
  {
    icon: Camera,
    title: "Fotografías y croquis",
    description: "Sube las fotografías del inmueble y los croquis del terreno directamente al avalúo.",
  },
  {
    icon: FileStack,
    title: "Vista previa paginada tamaño carta",
    description: "Revisa mientras capturas cómo queda el informe, página por página, en tamaño carta.",
  },
  {
    icon: GitBranch,
    title: "Versiones: concluir y reabrir",
    description:
      "Concluye el avalúo cuando esté listo. Si necesitas corregirlo, reábrelo: se crea una nueva versión de trabajo a partir de la final.",
  },
  {
    icon: Users,
    title: "Equipos con roles y permisos",
    description:
      "Tu despacho trabaja como una organización. Cada integrante tiene un rol (administrador, valuador, revisor o consulta) con permisos para capturar, revisar, concluir o solo consultar.",
  },
  {
    icon: ShieldCheck,
    title: "Acceso seguro",
    description: "Entra con tu correo y contraseña o con tu cuenta de Google. Tus avalúos solo los ve tu organización.",
  },
];

const upcoming = [
  {
    title: "Cálculo de homologación y enfoques",
    description: "Apoyo para homologar comparables y calcular los enfoques de valor dentro de la plataforma.",
  },
  {
    title: "Dictamen en PDF con anexos",
    description: "Generación del dictamen final en PDF, con sus anexos, a partir de lo capturado.",
  },
];

function jsonLd(siteUrl: string) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: `${siteUrl}/`,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Avalúos inmobiliarios",
    operatingSystem: "Web",
    inLanguage: "es-MX",
    audience: { "@type": "Audience", audienceType: "Despachos de avalúos y peritos valuadores", geographicArea: "MX" },
  };
  // "<" escaped so the JSON can never close the script element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const nonce = nonceFromContentSecurityPolicy((await headers()).get("content-security-policy"));

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd(getSiteUrl()) }} />

      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Valuaxis, inicio" className="rounded-lg">
            <ValuaxisLogo />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#secciones" className="hover:text-foreground">Secciones</a>
            <a href="#funciones" className="hover:text-foreground">Funciones</a>
            <a href="#proximamente" className="hover:text-foreground">Próximamente</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/iniciar-sesion" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Iniciar sesión
            </Link>
            <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "hidden px-3 sm:inline-flex")}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section aria-labelledby="hero-title" className="border-b bg-gradient-to-b from-secondary/60 to-background">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
            <div className="grid gap-6">
              <p className="w-fit rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                Para despachos de avalúos y peritos valuadores en México
              </p>
              <h1 id="hero-title" className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
                Captura, organiza y emite tus avalúos inmobiliarios en línea
              </h1>
              <p className="max-w-xl text-lg text-pretty text-muted-foreground">
                Valuaxis es la plataforma web donde tu equipo integra el informe de avalúo sección por sección, con
                fotografías, tablas y una vista previa paginada, todo en un mismo lugar y desde el navegador.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
                  Crear cuenta
                </Link>
                <Link
                  href="/iniciar-sesion"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
                >
                  Iniciar sesión
                </Link>
              </div>
            </div>

            <div aria-hidden="true" className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b pb-3">
                <div className="grid gap-1">
                  <span className="text-sm font-semibold">Avalúo · Casa habitación</span>
                  <span className="text-xs text-muted-foreground">Versión de trabajo</span>
                </div>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  Borrador
                </span>
              </div>
              <ol className="grid gap-2 text-sm">
                {reportSections.map((section, index) => (
                  <li key={section.name} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="font-medium">{section.name}</span>
                    {index < 3 ? <CheckCircle2 className="ml-auto size-4 text-chart-2" /> : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="secciones" aria-labelledby="secciones-title" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mb-10 grid max-w-2xl gap-3">
              <h2 id="secciones-title" className="text-3xl font-bold tracking-tight">
                Todo el informe, sección por sección
              </h2>
              <p className="text-muted-foreground">
                El avalúo se captura en las mismas secciones que integran el informe, para que nada quede fuera.
              </p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {reportSections.map((section, index) => (
                <li key={section.name} className="rounded-xl border bg-card p-5">
                  <span className="text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-1 font-semibold">{section.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{section.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="funciones" aria-labelledby="funciones-title" className="scroll-mt-20 border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mb-10 grid max-w-2xl gap-3">
              <h2 id="funciones-title" className="text-3xl font-bold tracking-tight">
                Hecho para el trabajo diario del valuador
              </h2>
              <p className="text-muted-foreground">
                Herramientas para capturar con orden, revisar en equipo y mantener el control de cada avalúo.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="rounded-xl border bg-card p-6">
                  <feature.icon aria-hidden="true" className="size-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="proximamente" aria-labelledby="proximamente-title" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mb-10 grid max-w-2xl gap-3">
              <h2 id="proximamente-title" className="text-3xl font-bold tracking-tight">
                Próximamente
              </h2>
              <p className="text-muted-foreground">Lo que estamos construyendo para las siguientes versiones.</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {upcoming.map((item) => (
                <li key={item.title} className="flex gap-4 rounded-xl border border-dashed p-6">
                  <Sparkles aria-hidden="true" className="size-5 shrink-0 text-chart-2" />
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="grid gap-6 rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-2">
                <h2 id="cta-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Lleva tus avalúos a la web
                </h2>
                <p className="text-primary-foreground/80">
                  Crea la cuenta de tu despacho y empieza a capturar tu primer avalúo.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/registro"
                  className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 px-5 text-base")}
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/iniciar-sesion"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "h-11 px-5 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
                  )}
                >
                  Iniciar sesión
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <ValuaxisLogo className="text-base" markClassName="size-6" />
          <p>© {new Date().getFullYear()} Valuaxis · valuaxissoft.com</p>
          <nav aria-label="Cuenta" className="flex gap-4">
            <Link href="/iniciar-sesion" className="hover:text-foreground">
              Iniciar sesión
            </Link>
            <Link href="/registro" className="hover:text-foreground">
              Crear cuenta
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

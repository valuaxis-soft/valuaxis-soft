import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  FileSpreadsheet,
  FileText,
  GitBranch,
  LockKeyhole,
  MapPinned,
  Plus,
  QrCode,
  ScrollText,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/features/auth/session";
import { AiMockup } from "@/features/marketing/components/ai-mockup";
import { APPROACH_VISUALS, RegressionVisual } from "@/features/marketing/components/approach-visuals";
import { ContourLines } from "@/components/brand/contour-lines";
import { DictamenMockup } from "@/features/marketing/components/dictamen-mockup";
import { HeroMockup } from "@/features/marketing/components/hero-mockup";
import { MapMockup } from "@/features/marketing/components/map-mockup";
import { SectionHeading } from "@/features/marketing/components/section-heading";
import { SiteFooter, SiteHeader } from "@/features/marketing/components/site-chrome";
import {
  APPROACHES,
  BEFORE_AFTER,
  DICTAMEN_POINTS,
  FAQS,
  PRICE_INCLUDES,
  PRICE_PER_VALUATION_MXN,
  PROOF_POINTS,
  STEPS,
  TEAM_FEATURES,
} from "@/features/marketing/content";
import { landingStructuredData } from "@/features/marketing/structured-data";
import { cn } from "@/lib/utils";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, getSiteUrl, nonceFromContentSecurityPolicy } from "./_lib/site";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const TEAM_ICONS = [Users, GitBranch, LockKeyhole, ScrollText];

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const ctaPrimary = cn(buttonVariants({ size: "lg" }), "h-12 gap-2 px-6 text-base");

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const nonce = nonceFromContentSecurityPolicy((await headers()).get("content-security-policy"));
  const structuredData = landingStructuredData({ name: SITE_NAME, description: SITE_DESCRIPTION, url: getSiteUrl() });

  return (
    <div className="vx-smooth-scroll flex min-h-dvh flex-col bg-background text-foreground">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: structuredData }} />
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>

      <SiteHeader />

      <main id="contenido" className="flex-1">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink text-ink-foreground">
          <ContourLines className="absolute inset-0 -z-10 h-full w-full text-ink-foreground/[0.07]" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_85%_20%,oklch(0.649_0.11_165/0.22),transparent_70%),radial-gradient(50%_60%_at_10%_90%,oklch(0.55_0.11_240/0.35),transparent_70%)]"
          />
          <div className={cn(container, "grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1fr_1.08fr] lg:gap-12 lg:pt-20 lg:pb-28")}>
            <div className="grid gap-7">
              <p className="inline-flex w-fit items-center gap-2 rounded-full bg-ink-foreground/10 px-3 py-1.5 text-xs font-medium text-ink-foreground ring-1 ring-ink-foreground/15">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                Software de avalúos para valuadores en México
              </p>
              <h1
                id="hero-title"
                className="font-display text-[2.6rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[3.75rem]"
              >
                Avalúos inmobiliarios del comparable al dictamen,{" "}
                <span className="relative whitespace-nowrap text-success">
                  sin copiar y pegar
                  <svg
                    viewBox="0 0 300 12"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="absolute -bottom-1.5 left-0 h-2.5 w-full text-success/70"
                  >
                    <path d="M2 9C60 3 140 2 298 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
                .
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-ink-foreground/80">
                Valuaxis reúne en el navegador lo que hoy repartes entre Excel y Word: comparables con mapa, los enfoques de
                mercado, costos e ingresos, y un dictamen de avalúo en PDF listo para firmar.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/registro"
                  className={cn(ctaPrimary, "bg-success text-ink hover:bg-success/85 focus-visible:ring-success/50")}
                >
                  Crear cuenta
                  <ArrowRight className="size-4 transition-transform group-hover/button:translate-x-0.5" aria-hidden="true" />
                </Link>
                <a
                  href="#como-funciona"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 border-ink-foreground/25 bg-transparent px-6 text-base text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground dark:bg-transparent",
                  )}
                >
                  Ver cómo funciona
                </a>
              </div>
              <ul className="grid gap-2 text-sm text-ink-foreground/80 sm:grid-cols-2">
                {[
                  `$${PRICE_PER_VALUATION_MXN} MXN por avalúo, IVA incluido`,
                  "Sin instalar nada",
                  "Mercado, costos e ingresos",
                  "Solo tu despacho ve tus datos",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <HeroMockup />
          </div>
        </section>

        {/* Proof points */}
        <section aria-label="Valuaxis en cifras" className="border-b bg-card">
          <dl className={cn(container, "grid grid-cols-2 gap-x-6 gap-y-8 py-12 lg:grid-cols-4")}>
            {PROOF_POINTS.map((point, index) => (
              <div key={point.label} className="vx-reveal grid gap-1 border-l-2 border-success/60 pl-4">
                <dt className="order-2 text-sm text-muted-foreground">{point.label}</dt>
                <dd
                  className={cn(
                    "order-1 font-display text-5xl font-semibold tracking-tight tabular-nums",
                    index % 2 === 0 ? "text-primary" : "text-success-strong",
                  )}
                >
                  {point.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Before / after */}
        <section aria-labelledby="antes-title" className="scroll-mt-20">
          <div className={cn(container, "grid gap-12 py-20 lg:py-28")}>
            <SectionHeading id="antes-title" eyebrow="Ahorra horas en cada avalúo" title="Deja de ser el capturista de tu propio Excel.">
              El valor lo decides tú. Valuaxis se encarga de que cada cifra llegue completa y bien numerada hasta el dictamen.
            </SectionHeading>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="vx-reveal rounded-2xl border border-dashed bg-muted/50 p-6 sm:p-8">
                <h3 className="flex items-center gap-2 font-semibold text-muted-foreground">
                  <FileSpreadsheet className="size-5" aria-hidden="true" />
                  Con Excel y Word
                </h3>
                <ul className="mt-5 grid gap-3.5">
                  {BEFORE_AFTER.before.map((item) => (
                    <li key={item} className="flex gap-3 text-muted-foreground">
                      <X className="mt-0.5 size-5 shrink-0 text-destructive/70" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="vx-reveal relative overflow-hidden rounded-2xl bg-card p-6 shadow-lift ring-1 ring-success/30 sm:p-8">
                <div aria-hidden="true" className="absolute -top-16 -right-16 size-48 rounded-full bg-success/10 blur-2xl" />
                <h3 className="flex items-center gap-2 font-semibold">
                  <BadgeCheck className="size-5 text-success-strong" aria-hidden="true" />
                  Con Valuaxis
                </h3>
                <ul className="mt-5 grid gap-3.5">
                  {BEFORE_AFTER.after.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-success-strong" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" aria-labelledby="como-title" className="scroll-mt-20 border-y bg-secondary/60">
          <div className={cn(container, "grid gap-12 py-20 lg:py-28")}>
            <SectionHeading id="como-title" eyebrow="Cómo funciona" title="Cuatro pasos, el mismo orden de tu informe.">
              Trabajas por secciones, como en tu formato de siempre, y ves el dictamen armarse mientras capturas.
            </SectionHeading>
            <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:before:absolute lg:before:top-7 lg:before:right-12 lg:before:left-12 lg:before:h-px lg:before:bg-[repeating-linear-gradient(90deg,var(--input)_0_8px,transparent_8px_14px)] lg:before:content-['']">
              {STEPS.map((step, index) => (
                <li key={step.title} className="vx-reveal relative grid content-start gap-3">
                  <span className="relative flex size-14 items-center justify-center rounded-2xl bg-card font-display text-2xl font-semibold text-primary shadow-soft ring-1 ring-border">
                    {index + 1}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Approaches */}
        <section id="enfoques" aria-labelledby="enfoques-title" className="scroll-mt-20">
          <div className={cn(container, "grid gap-12 py-20 lg:py-28")}>
            <SectionHeading id="enfoques-title" eyebrow="Motor de cálculo" title="Los tres enfoques, con las fórmulas de tus libros.">
              Validado al centavo contra los Excel de un despacho de valuación. El sistema calcula y te avisa; nunca decide por ti.
            </SectionHeading>
            <ul className="grid gap-5 md:grid-cols-3">
              {APPROACHES.map((approach) => {
                const Visual = APPROACH_VISUALS[approach.id];
                return (
                  <li
                    key={approach.id}
                    className="vx-reveal group grid content-start overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border transition-[box-shadow,transform] duration-300 ease-(--ease-out-quint) hover:-translate-y-1 hover:shadow-lift"
                  >
                    <div className="h-28 border-b bg-muted/50 px-6 pt-5 pb-3">
                      <Visual />
                    </div>
                    <div className="grid gap-3 p-6">
                      <h3 className="font-display text-xl font-semibold">{approach.title}</h3>
                      <p className="text-muted-foreground">{approach.description}</p>
                      <ul className="mt-1 grid gap-2 text-sm">
                        {approach.points.map((point) => (
                          <li key={point} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden="true" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="vx-reveal relative isolate grid gap-8 overflow-hidden rounded-3xl bg-ink p-6 text-ink-foreground sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <ContourLines className="absolute inset-0 -z-10 h-full w-full text-ink-foreground/[0.06]" />
              <div className="grid gap-4">
                <p className="text-xs font-semibold tracking-[0.14em] text-success uppercase">Métodos alternativos</p>
                <h3 className="font-display text-2xl leading-tight font-semibold text-balance sm:text-3xl">
                  Regresión lineal múltiple y programación por metas, sin salir del avalúo.
                </h3>
                <p className="text-ink-foreground/80">
                  Codifica hasta 12 criterios con tus escalas. Obtén la ecuación, R, R² ajustado y el análisis de varianza como en Excel,
                  y la solución de programación por metas como en LINGO. Compáralos con el promedio y la mediana homologados: tú
                  eliges qué entra al dictamen.
                </p>
              </div>
              <div className="rounded-2xl bg-ink-foreground/[0.06] p-4 ring-1 ring-ink-foreground/10">
                <RegressionVisual />
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-ink-foreground/10 px-2.5 py-1 tabular-nums">R² ajustado 0.91</span>
                  <span className="rounded-full bg-ink-foreground/10 px-2.5 py-1">ANOVA y F crítica</span>
                  <span className="rounded-full bg-highlight px-2.5 py-1 font-medium text-highlight-foreground">Sujeto estimado</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dictamen */}
        <section id="dictamen" aria-labelledby="dictamen-title" className="group/dictamen scroll-mt-20 border-y bg-secondary/60">
          <div className={cn(container, "grid items-center gap-14 py-20 lg:grid-cols-[1fr_1.05fr] lg:py-28")}>
            <div className="vx-reveal order-2 lg:order-1">
              <DictamenMockup />
            </div>
            <div className="order-1 grid gap-10 lg:order-2">
              <SectionHeading id="dictamen-title" eyebrow="Dictamen en PDF" title="Un dictamen que se ve como lo firmarías.">
                Revisa la vista previa tamaño carta mientras capturas y descarga el PDF cuando esté listo. Lo que se imprime no depende
                de internet: mapas y croquis viajan como imágenes del avalúo.
              </SectionHeading>
              <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {DICTAMEN_POINTS.map((point) => (
                  <li key={point.title} className="grid gap-1">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <FileText className="size-4 text-primary" aria-hidden="true" />
                      {point.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{point.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Comparables and map */}
        <section id="comparables" aria-labelledby="comparables-title" className="scroll-mt-20">
          <div className={cn(container, "grid items-center gap-14 py-20 lg:grid-cols-[1fr_1.1fr] lg:py-28")}>
            <div className="grid gap-8">
              <SectionHeading id="comparables-title" eyebrow="Comparables y mapa" title="La base de comparables de tu despacho, por fin en un lugar.">
                Cada comparable que capturas queda en tu base, con su número, fotos, fuente y vigencia, listo para tu siguiente avalúo.
              </SectionHeading>
              <ul className="grid gap-4">
                {[
                  { icon: MapPinned, text: "Ubica el inmueble y sus comparables en el mapa y genera los croquis de macro y microlocalización." },
                  { icon: FileSpreadsheet, text: "Importa desde Excel o CSV con la plantilla y exporta tu base cuando quieras." },
                  { icon: BadgeCheck, text: "Detecta duplicados al capturar y filtra por vigencia, tipo, fuente o ubicación." },
                ].map((item) => (
                  <li key={item.text} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                    <p className="pt-2">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="vx-reveal">
              <MapMockup />
            </div>
          </div>
        </section>

        {/* AI */}
        <section id="ia" aria-labelledby="ia-title" className="scroll-mt-20 border-y bg-card">
          <div className={cn(container, "grid gap-12 py-20 lg:py-28")}>
            <SectionHeading id="ia-title" eyebrow="Asistencia con IA" title="Pega el anuncio. Revisa. Usa." align="center">
              La IA lee el anuncio que pegaste y te propone los datos del comparable, cada uno con el fragmento literal de donde lo tomó.
              Tú corriges lo que haga falta y decides si lo usas.
            </SectionHeading>
            <div className="vx-reveal">
              <AiMockup />
            </div>
            <p className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl bg-muted px-5 py-4 text-sm">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-highlight-strong" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Tu criterio no se toca.</strong> La IA nunca estima valores, factores ni conclusiones, y
                nada se guarda hasta que tú lo revisas.
              </span>
            </p>
          </div>
        </section>

        {/* Team, security, accreditation */}
        <section id="equipo" aria-labelledby="equipo-title" className="scroll-mt-20">
          <div className={cn(container, "grid gap-12 py-20 lg:py-28")}>
            <SectionHeading id="equipo-title" eyebrow="Equipo y seguridad" title="Hecho para despachos, no solo para una persona.">
              Invita a tu equipo, reparte el trabajo y conserva cada versión del avalúo, con tus datos protegidos.
            </SectionHeading>
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.15fr]">
              <ul className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
                {TEAM_FEATURES.map((feature, index) => {
                  const Icon = TEAM_ICONS[index];
                  return (
                    <li key={feature.title} className="vx-reveal rounded-2xl bg-card p-6 shadow-soft ring-1 ring-border">
                      <Icon className="size-6 text-primary" aria-hidden="true" />
                      <h3 className="mt-4 font-semibold">{feature.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="vx-reveal relative isolate flex flex-col overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8 dark:bg-ink dark:text-ink-foreground">
                <ContourLines className="absolute inset-0 -z-10 h-full w-full text-white/[0.08]" />
                <span className="flex size-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <QrCode className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-2xl font-semibold">Usuarios acreditados</h3>
                <p className="mt-3 opacity-85">
                  Sube tu Constancia de Situación Profesional de la SEP, en PDF o con la imagen de su código QR. Una vez cotejada, tus
                  dictámenes y memorias salen sin el aviso «Documento sin validez oficial».
                </p>
                <p className="mt-auto flex items-center gap-2 pt-6 text-sm font-medium">
                  <BadgeCheck className="size-5 text-success" aria-hidden="true" />
                  La acreditación es permanente.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Price */}
        <section id="precio" aria-labelledby="precio-title" className="scroll-mt-20 border-y bg-secondary/60">
          <div className={cn(container, "grid items-center gap-12 py-20 lg:grid-cols-[1fr_1.05fr] lg:py-28")}>
            <SectionHeading id="precio-title" eyebrow="Precio" title="Pagas por avalúo concluido. Nada más.">
              Crear tu cuenta, invitar a tu equipo y capturar no cuesta. El avalúo se descuenta al concluirlo por primera vez; reabrirlo
              para corregir y volver a concluirlo no se cobra de nuevo.
            </SectionHeading>
            <div className="vx-reveal relative rounded-3xl bg-card p-7 shadow-float ring-1 ring-border sm:p-10">
              <p className="text-sm font-semibold text-muted-foreground">Por avalúo</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-7xl font-semibold tracking-tight text-primary tabular-nums sm:text-8xl">
                  ${PRICE_PER_VALUATION_MXN}
                </span>
                <span className="text-lg font-medium text-muted-foreground">MXN</span>
              </p>
              <p className="mt-1 text-sm font-medium text-success-strong">IVA incluido</p>
              <ul className="mt-7 grid gap-3 border-t pt-7">
                {PRICE_INCLUDES.map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check className="mt-0.5 size-5 shrink-0 text-success-strong" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/registro" className={cn(ctaPrimary, "mt-8 w-full")}>
                Crear cuenta
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="preguntas" aria-labelledby="preguntas-title" className="scroll-mt-20">
          <div className={cn(container, "grid gap-12 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28")}>
            <SectionHeading id="preguntas-title" eyebrow="Preguntas frecuentes" title="Lo que nos preguntan los valuadores." />
            <div className="grid gap-3">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group rounded-xl bg-card ring-1 ring-border transition-shadow open:shadow-soft">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-3 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <h3>{faq.question}</h3>
                    <Plus
                      className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="px-5 pb-5 text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section aria-labelledby="cta-title" className="px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="relative isolate mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-3xl bg-ink px-6 py-14 text-ink-foreground sm:px-12 md:grid-cols-[1fr_auto] md:items-center lg:py-16">
            <ContourLines className="absolute inset-0 -z-10 h-full w-full text-ink-foreground/[0.08]" />
            <div className="grid gap-3">
              <h2 id="cta-title" className="font-display text-3xl leading-tight font-semibold text-balance sm:text-4xl">
                Tu próximo avalúo, en Valuaxis.
              </h2>
              <p className="max-w-xl text-lg text-ink-foreground/80">
                Crea la cuenta de tu despacho y captura tu primer avalúo hoy. Pagas solo cuando lo concluyes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/registro" className={cn(ctaPrimary, "bg-success text-ink hover:bg-success/85")}>
                Crear cuenta
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/iniciar-sesion"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  "h-12 px-5 text-base text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground",
                )}
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

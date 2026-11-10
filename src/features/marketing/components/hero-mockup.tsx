import type { CSSProperties } from "react";
import { Check, ChartScatter, Pause, Play, RotateCcw } from "lucide-react";
import { Odometer } from "./odometer";

// Invented figures: four land comparables homologated to a subject of 188.70 m².
const comparables = [
  { ref: "C-1", place: "Las Arboledas", price: "17,900", sup: "1.01", ubic: "1.02", neg: "1.00", fre: "1.03", value: "18,437" },
  { ref: "C-2", place: "Real del Valle", price: "19,250", sup: "0.98", ubic: "1.00", neg: "0.98", fre: "0.96", value: "18,480" },
  { ref: "C-3", place: "Lomas del Sur", price: "18,100", sup: "1.00", ubic: "1.02", neg: "1.00", fre: "1.02", value: "18,462" },
  { ref: "C-4", place: "Santa Fe Norte", price: "18,800", sup: "0.99", ubic: "1.00", neg: "0.99", fre: "0.98", value: "18,424" },
];

const sections = ["Carátula", "Antecedentes", "Terreno", "Construcciones", "Enfoque de costos", "Enfoque de mercado", "Conclusión", "Anexos"];
const roman = ["", "I", "II", "III", "IV", "V", "VI", "A"];

const AMOUNT_IN_WORDS = "(TRES MILLONES CUATROCIENTOS OCHENTA Y DOS MIL PESOS 00/100 M.N.)";

/** Delay variables for the sequence classes in motion.css. */
const delay = (base: number, index = 0): CSSProperties =>
  ({ ["--vx-base" as string]: `${base}ms`, ["--vx-i" as string]: index }) as CSSProperties;

/**
 * The product as a picture: an appraisal open on the market approach. It
 * renders finished; `LandingMotion` replays it (`data-vx-step`, see
 * `hero-cycle.ts`) with a pause button for WCAG 2.2.2.
 */
export function HeroMockup() {
  return (
    <div className="relative mx-auto mb-16 w-full max-w-xl lg:mb-10 lg:max-w-none">
      <div
        role="img"
        aria-label="Maqueta de Valuaxis: homologación de cuatro comparables de terreno con un valor concluido de 3,482,000 pesos."
      >
        <div className="overflow-hidden rounded-2xl bg-card text-card-foreground shadow-float ring-1 ring-white/10">
          <div className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-[oklch(0.75_0.12_30)]" />
              <span className="size-2.5 rounded-full bg-highlight" />
              <span className="size-2.5 rounded-full bg-success" />
            </span>
            <span className="truncate rounded-md bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground">
              valuaxissoft.com/avaluos/AV-2026-0148
            </span>
          </div>

          <div className="grid sm:grid-cols-[9.5rem_1fr]">
            <ol className="hidden gap-0.5 border-r bg-sidebar p-2.5 text-[11px] sm:grid">
              {sections.map((name, index) => (
                <li
                  key={name}
                  className={
                    name === "Enfoque de mercado"
                      ? "flex items-center gap-2 rounded-md bg-primary px-2 py-1.5 font-medium text-primary-foreground"
                      : "flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground"
                  }
                >
                  <span className="w-3 text-center font-display text-[10px]">{roman[index]}</span>
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ol>

            <div className="grid gap-3 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">V. Enfoque de mercado</p>
                  <p className="font-display text-base font-semibold">Homologación de terrenos</p>
                </div>
                <span
                  data-vx="step"
                  data-vx-step={7}
                  className="vx-seq-pop inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
                >
                  <Check className="size-3" aria-hidden="true" />
                  Calculado
                </span>
              </div>

              <table className="w-full text-right text-[11px] tabular-nums">
                <thead className="text-[10px] text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 text-left font-medium whitespace-nowrap">Ref.</th>
                    <th className="py-1.5 pr-2 font-medium">$/m²</th>
                    <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Sup</th>
                    <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Ubic</th>
                    <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Neg</th>
                    <th className="py-1.5 pr-2 font-medium">FRe</th>
                    <th className="py-1.5 font-medium">Homologado</th>
                  </tr>
                </thead>
                <tbody>
                  {comparables.map((row, index) => (
                    <tr key={row.ref} data-vx="step" data-vx-step={index + 1} className="vx-seq-fade border-b border-dashed last:border-0">
                      <td className="py-1.5 pr-2 text-left whitespace-nowrap">
                        <span className="font-semibold text-primary">{row.ref}</span>
                        <span className="ml-1.5 hidden text-muted-foreground xl:inline">{row.place}</span>
                      </td>
                      <td className="py-1.5 pr-2">{row.price}</td>
                      {[row.sup, row.ubic, row.neg].map((factor, column) => (
                        <td key={column} className="hidden py-1.5 pr-2 text-muted-foreground md:table-cell">
                          <span className="vx-seq-fade inline-block" style={delay(220, column)}>
                            {factor}
                          </span>
                        </td>
                      ))}
                      <td className="py-1.5 pr-2">
                        <span className="vx-seq-fade inline-block" style={delay(220, 3)}>
                          {row.fre}
                        </span>
                      </td>
                      <td className="py-1.5 font-semibold">
                        <Odometer value={row.value} delay={520} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl data-vx="step" data-vx-step={5} className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="rounded-lg bg-muted px-2.5 py-2">
                  <dt className="text-muted-foreground">Promedio</dt>
                  <dd className="text-xs font-semibold tabular-nums">
                    <Odometer value="$18,451" />
                  </dd>
                </div>
                <div className="rounded-lg bg-muted px-2.5 py-2">
                  <dt className="text-muted-foreground">Mediana</dt>
                  <dd className="text-xs font-semibold tabular-nums">
                    <Odometer value="$18,450" delay={150} />
                  </dd>
                </div>
                <div className="relative rounded-lg bg-accent px-2.5 py-2">
                  <span aria-hidden="true" className="vx-seq-fade absolute inset-0 rounded-lg ring-1 ring-success/40" style={delay(600)} />
                  <dt className="text-accent-foreground">Adoptado /m²</dt>
                  <dd className="text-xs font-semibold text-accent-foreground tabular-nums">
                    <Odometer value="$18,450" delay={320} />
                  </dd>
                </div>
              </dl>

              {/* Value bar: the adopted value inside the ±30 % range. */}
              <div data-vx="step" data-vx-step={6} className="grid gap-1.5 pb-1">
                <div className="relative h-2 rounded-full bg-muted">
                  <div className="vx-seq-fade absolute inset-y-0 left-[12%] right-[12%] rounded-full bg-success/25" />
                  <div className="vx-seq-move absolute inset-0" style={{ ["--vx-from" as string]: "translateX(-50%)" }}>
                    <div className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-success shadow-soft" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span>−30 %</span>
                  <span className="vx-seq-fade" style={delay(800)}>
                    Dentro del rango
                  </span>
                  <span>+30 %</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="vx-float absolute -bottom-20 left-3 max-w-[16rem] rounded-xl bg-card p-3 text-card-foreground shadow-lift ring-1 ring-border sm:-bottom-16 sm:-left-6 sm:max-w-[18rem]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-success-strong uppercase">
            <span className="flex size-4 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-3" aria-hidden="true" />
            </span>
            Valor concluido
          </p>
          <p data-vx="step" data-vx-step={8} className="mt-1 font-display text-2xl font-semibold tabular-nums">
            <Odometer value="$3,482,000.00" />
          </p>
          <p className="vx-hero-letters mt-0.5 text-[9px] leading-snug text-muted-foreground">
            <span data-vx-typed="">{AMOUNT_IN_WORDS}</span>
            <span data-vx-rest="" />
          </p>
        </div>

        <div className="vx-float-delayed absolute -top-5 right-3 hidden items-center gap-2 rounded-xl bg-card px-3 py-2 text-card-foreground shadow-lift ring-1 ring-border sm:flex">
          <span className="flex size-7 items-center justify-center rounded-lg bg-highlight/20 text-highlight-strong">
            <ChartScatter className="size-4" aria-hidden="true" />
          </span>
          <span className="grid leading-tight">
            <span className="text-[10px] text-muted-foreground">Regresión lineal múltiple</span>
            <span className="text-xs font-semibold tabular-nums">R² ajustado 0.91</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        hidden
        data-vx-hero-toggle=""
        data-state="playing"
        aria-label="Pausar la animación"
        className="group/toggle absolute right-0 -bottom-14 flex size-11 items-center justify-center rounded-full text-ink-foreground/80 outline-none hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-success/50 sm:-bottom-12"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-ink-foreground/10 ring-1 ring-ink-foreground/20 transition-colors group-hover/toggle:bg-ink-foreground/15">
          <Pause className="size-3.5 group-data-[state=done]/toggle:hidden group-data-[state=paused]/toggle:hidden" aria-hidden="true" />
          <Play className="hidden size-3.5 group-data-[state=paused]/toggle:block" aria-hidden="true" />
          <RotateCcw className="hidden size-3.5 group-data-[state=done]/toggle:block" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

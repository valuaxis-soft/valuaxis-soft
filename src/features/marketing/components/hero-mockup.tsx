import { Check, ChartScatter } from "lucide-react";

// Invented figures: four land comparables homologated to a subject of 188.70 m².
const comparables = [
  { ref: "C-1", place: "Las Arboledas", price: "17,900", sup: "1.01", ubic: "1.02", neg: "1.00", fre: "1.03", value: "18,437" },
  { ref: "C-2", place: "Real del Valle", price: "19,250", sup: "0.98", ubic: "1.00", neg: "0.98", fre: "0.96", value: "18,480" },
  { ref: "C-3", place: "Lomas del Sur", price: "18,100", sup: "1.00", ubic: "1.02", neg: "1.00", fre: "1.02", value: "18,462" },
  { ref: "C-4", place: "Santa Fe Norte", price: "18,800", sup: "0.99", ubic: "1.00", neg: "0.99", fre: "0.98", value: "18,424" },
];

const sections = ["Carátula", "Antecedentes", "Terreno", "Construcciones", "Enfoque de costos", "Enfoque de mercado", "Conclusión", "Anexos"];
const roman = ["", "I", "II", "III", "IV", "V", "VI", "A"];

/** The product as a picture: an appraisal open on the market approach. */
export function HeroMockup() {
  return (
    <div
      role="img"
      aria-label="Maqueta de Valuaxis: homologación de cuatro comparables de terreno con un valor concluido de 3,482,000 pesos."
      className="relative mx-auto mb-16 w-full max-w-xl lg:mb-10 lg:max-w-none"
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
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                <Check className="size-3" aria-hidden="true" />
                Calculado
              </span>
            </div>

            <table className="w-full text-right text-[11px] tabular-nums">
              <thead className="text-[10px] text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 pr-2 text-left font-medium">Ref.</th>
                  <th className="py-1.5 pr-2 font-medium">$/m²</th>
                  <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Sup</th>
                  <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Ubic</th>
                  <th className="hidden py-1.5 pr-2 font-medium md:table-cell">F.Neg</th>
                  <th className="py-1.5 pr-2 font-medium">FRe</th>
                  <th className="py-1.5 font-medium">Homologado</th>
                </tr>
              </thead>
              <tbody>
                {comparables.map((row) => (
                  <tr key={row.ref} className="border-b border-dashed last:border-0">
                    <td className="py-1.5 pr-2 text-left">
                      <span className="font-semibold text-primary">{row.ref}</span>
                      <span className="ml-1.5 hidden text-muted-foreground lg:inline">{row.place}</span>
                    </td>
                    <td className="py-1.5 pr-2">{row.price}</td>
                    <td className="hidden py-1.5 pr-2 text-muted-foreground md:table-cell">{row.sup}</td>
                    <td className="hidden py-1.5 pr-2 text-muted-foreground md:table-cell">{row.ubic}</td>
                    <td className="hidden py-1.5 pr-2 text-muted-foreground md:table-cell">{row.neg}</td>
                    <td className="py-1.5 pr-2">{row.fre}</td>
                    <td className="py-1.5 font-semibold">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg bg-muted px-2.5 py-2">
                <dt className="text-muted-foreground">Promedio</dt>
                <dd className="text-xs font-semibold tabular-nums">$18,451</dd>
              </div>
              <div className="rounded-lg bg-muted px-2.5 py-2">
                <dt className="text-muted-foreground">Mediana</dt>
                <dd className="text-xs font-semibold tabular-nums">$18,450</dd>
              </div>
              <div className="rounded-lg bg-accent px-2.5 py-2 ring-1 ring-success/40">
                <dt className="text-accent-foreground">Adoptado /m²</dt>
                <dd className="text-xs font-semibold text-accent-foreground tabular-nums">$18,450</dd>
              </div>
            </dl>

            {/* Value bar: the adopted value inside the ±30 % range. */}
            <div className="grid gap-1.5 pb-1">
              <div className="relative h-2 rounded-full bg-muted">
                <div className="absolute inset-y-0 left-[12%] right-[12%] rounded-full bg-success/25" />
                <div className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-success shadow-soft" />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>−30 %</span>
                <span>Dentro del rango</span>
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
        <p className="mt-1 font-display text-2xl font-semibold tabular-nums">$3,482,000.00</p>
        <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
          (TRES MILLONES CUATROCIENTOS OCHENTA Y DOS MIL PESOS 00/100 M.N.)
        </p>
      </div>

      <div className="vx-float-delayed absolute -top-5 right-3 hidden items-center gap-2 rounded-xl bg-card px-3 py-2 text-card-foreground shadow-lift ring-1 ring-border sm:flex lg:-right-5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-highlight/20 text-highlight-strong">
          <ChartScatter className="size-4" aria-hidden="true" />
        </span>
        <span className="grid leading-tight">
          <span className="text-[10px] text-muted-foreground">Regresión lineal múltiple</span>
          <span className="text-xs font-semibold tabular-nums">R² ajustado 0.91</span>
        </span>
      </div>
    </div>
  );
}

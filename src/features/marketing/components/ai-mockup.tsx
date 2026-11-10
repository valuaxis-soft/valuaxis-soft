import type { CSSProperties } from "react";
import { Photo } from "@/components/brand/photo";
import { ArrowRight, Check, ClipboardPaste } from "lucide-react";

// `read` is the order in which each fragment appears in the listing: the
// highlighter and the proposed field light up together, in reading order.
const fields = [
  { label: "Superficie construida", value: "168.00 m²", source: "168 m2 de construcción", read: 0 },
  { label: "Precio de oferta", value: "$3,980,000", source: "$3.98 mdp", read: 3 },
  { label: "Colonia", value: "Real del Valle", source: "en Real del Valle", read: 1 },
  { label: "Uso de suelo", value: "Habitacional", source: "uso habitacional", read: 2 },
];

const STEP_MS = 650;

/** Delay variables for one fragment (or field) read in position `read`. */
const reading = (read: number, offset = 0): CSSProperties =>
  ({ ["--vx-base" as string]: `${400 + offset}ms`, ["--vx-i" as string]: read, ["--vx-stagger" as string]: `${STEP_MS}ms` }) as CSSProperties;

const markClass = "vx-seq-mark rounded bg-highlight/25 px-0.5 text-foreground";

/**
 * "Pegar anuncio": an invented listing and the fields read from it, each with
 * its literal source. On entry each fragment is highlighted and its field fills
 * in and gets its check, one after another.
 */
export function AiMockup() {
  return (
    <div
      role="img"
      aria-label="Maqueta de la extracción con IA: un anuncio pegado y los datos propuestos, cada uno con el fragmento del anuncio de donde se leyó."
      className="grid gap-4 md:grid-cols-[1fr_auto_1.1fr] md:items-center"
    >
      <div className="overflow-hidden rounded-2xl bg-card text-card-foreground shadow-soft ring-1 ring-border">
        <Photo
          src="/marketing/anuncio-casas.webp"
          width={880}
          height={495}
          sizes="(min-width: 1152px) 500px, (min-width: 768px) 45vw, 100vw"
          className="aspect-[16/9] w-full object-cover"
        />
        <div className="p-5">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <ClipboardPaste className="size-4" aria-hidden="true" />
            Anuncio pegado
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Se vende casa de dos plantas con{" "}
            <mark className={markClass} style={reading(0)}>
              168 m2 de construcción
            </mark>
            ,{" "}
            <mark className={markClass} style={reading(1)}>
              en Real del Valle
            </mark>
            , a dos cuadras de la avenida. Tres recámaras, jardín,{" "}
            <mark className={markClass} style={reading(2)}>
              uso habitacional
            </mark>
            . Precio{" "}
            <mark className={markClass} style={reading(3)}>
              $3.98 mdp
            </mark>
            , acepto crédito. Informes con Laura.
          </p>
        </div>
      </div>

      <ArrowRight className="vx-seq-pop mx-auto size-6 rotate-90 text-success md:rotate-0" aria-hidden="true" style={reading(0, -250)} />

      <div className="rounded-2xl bg-card p-5 text-card-foreground shadow-lift ring-1 ring-border">
        <p className="text-xs font-semibold text-muted-foreground">Datos propuestos · revisa antes de usar</p>
        <ul className="mt-3 grid gap-2">
          {fields.map((field) => (
            <li
              key={field.label}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-lg bg-muted/70 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <span
                className="vx-seq-pop row-span-2 flex size-5 items-center justify-center rounded-full bg-success text-success-foreground"
                style={reading(field.read, 420)}
              >
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="vx-seq-fade text-sm font-semibold tabular-nums" style={reading(field.read, 220)}>
                {field.value}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">«{field.source}»</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { Calculator, LayoutTemplate } from "lucide-react";

import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

/** The template the editor works on in «Nueva plantilla» / «Editar plantilla». */
export type TemplateEditing = {
  id: string;
  name: string;
  /** «Comercial · Casa habitación»: the kind of valuation it is meant for, shown beside its name. */
  appliesTo: string;
  /** The template's document, as saved. */
  sections: AppSection[];
  /** Saves the document as the template's (the server takes the client's data out). */
  save: (sections: AppSection[]) => Promise<void>;
  /** «Datos de la plantilla»: its name, notes and the type it is meant for. */
  onEditDetails: () => void;
};

/** Under the top bar of the template editor: what a template keeps of what is written in it. */
export function TemplateEditingNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground" data-template-editing-notice>
      <LayoutTemplate className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Editas una plantilla, no un avalúo: se guarda su estructura (secciones, bloques, subbloques, conceptos, tablas, fórmulas y formato), los
        textos del valuador (Consideraciones, textos largos y párrafos) y sus imágenes. Los datos de un cliente o del inmueble que escribas aquí,
        también los de la carátula, no se guardan.
      </span>
    </p>
  );
}

/** What each calculation panel does in a valuation, said where the panel would be. */
const CALCULATED: Partial<Record<string, string>> = {
  COSTOS: "el enfoque de costos",
  MERCADO_VENTA: "el mercado de venta (comparables, homologación y métodos alternativos)",
  MERCADO_RENTAS: "el mercado de rentas (comparables y homologación)",
  INGRESOS: "el enfoque de ingresos",
  CONCLUSIONES: "la conclusión de valor",
  CONSTRUCCION: "los tipos de construcción e instalaciones, que entran a costos",
};

/**
 * In a template, the calculation panels have no valuation to read: in their
 * place, what the section calculates in each valuation created from it.
 */
export function TemplateCalculationNote({ section }: { section: Pick<AppSection, "id"> }) {
  const what = CALCULATED[getCanonicalSectionKey(section.id)];
  if (!what) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground" data-template-calculation-note>
      <Calculator className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        En la plantilla no hay cálculo: cada avalúo creado con ella captura y calcula aquí {what}, y el sistema escribe sus bloques de
        resultados. En la plantilla se editan los bloques, subbloques, conceptos, tablas, fórmulas y formato de la sección.
      </p>
    </div>
  );
}

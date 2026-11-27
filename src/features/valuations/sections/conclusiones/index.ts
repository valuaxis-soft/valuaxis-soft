import { conceptCalculationKey } from "../../calculation/conclusion-document";
import type { Apartado, AppSection, Concept } from "../../model";
import { defineSection } from "../../section-builders";

/** What the template writes in «Cómo se concluye», as the appraiser's Excel (XIV. CONSIDERACIONES PREVIAS A LA CONCLUSIÓN). */
export const CONCLUSION_REASONING_TEXT =
  "Se considera que el Valor que nos arroja es un indicador adecuado del valor comercial del inmueble valuado, de acuerdo a sus características, estado de conservación y su posible mercado.";

/**
 * The conclusion as the appraiser's Excel (videos 8.14, 51:16, and 8.15,
 * 27 Nov 2026): one block of subbloques in his order (resumen de valores,
 * gráfica de valores, cómo se concluye, the concluded value with its amount
 * in words, and the signature), each one moved, hidden and edited as any
 * subbloque. The concluded value is a subbloque without a printed title or
 * number: its box carries its own.
 */
const template = defineSection({
  id: "conclusiones",
  title: "CONCLUSIÓN",
  sourceFile: "CONCLUSIONES.pdf",
  blocks: [
    {
      title: "CONCLUSIÓN DEL VALOR",
      subBlocks: [
        { id: "conclusiones-resumen-de-valores", title: "RESUMEN DE VALORES", concepts: [["Valor por enfoque de costos"], ["Valor por enfoque de mercado"], ["Valor por enfoque de ingresos"]] },
        { id: "conclusiones-grafica-de-valores", title: "GRÁFICA DE VALORES" },
        { id: "conclusiones-como-se-concluye", title: "CÓMO SE CONCLUYE", concepts: [["Cómo se concluye", CONCLUSION_REASONING_TEXT, "paragraph"], ["Observaciones finales"]] },
        { id: "conclusiones-valor-concluido", title: "VALOR CONCLUIDO", concepts: [["Valor concluido"], ["Valor concluido con letra"]] },
        { id: "conclusiones-firma", title: "FIRMA", concepts: [["Valuador"], ["Cédula profesional"], ["Registro"], ["Firma"]] },
      ],
    },
    {
      title: "DECLARACIONES Y CERTIFICACIÓN",
      concepts: [["Declaración del valuador"], ["Alcance del avalúo"], ["Limitaciones"], ["Fecha de emisión"]],
    },
  ],
});

/** The subbloques that print without a title: the concluded value's box and the signature carry their own. */
const UNTITLED_SUBBLOCKS = new Set(["conclusiones-valor-concluido", "conclusiones-firma"]);

/**
 * The concepts the calculation fills carry their key from the start
 * (`calculationKey`): renamed, they keep receiving the concluded value and
 * the carátula's signatures. «Cómo se concluye» is the appraiser's text.
 */
const keyed = (concept: Concept): Concept => {
  const calculationKey = conceptCalculationKey(concept);
  return calculationKey ? { ...concept, calculationKey } : concept;
};

const subBlock = (apartado: Apartado): Apartado => ({
  ...apartado,
  concepts: apartado.concepts.map(keyed),
  ...(UNTITLED_SUBBLOCKS.has(apartado.id) ? { titleHidden: true } : {}),
  ...(apartado.id === "conclusiones-grafica-de-valores" ? { valueChart: true } : {}),
});

export const conclusionesSection: AppSection = {
  ...template,
  blocks: template.blocks.map((block) => ({
    ...block,
    concepts: block.concepts.map(keyed),
    apartados: block.apartados.map(subBlock),
  })),
};

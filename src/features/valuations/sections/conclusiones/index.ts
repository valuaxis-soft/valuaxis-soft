import { conceptCalculationKey } from "../../calculation/conclusion-document";
import type { AppSection } from "../../model";
import { defineSection } from "../../section-builders";

const template = defineSection({
  id: "conclusiones",
  title: "CONCLUSIÓN",
  sourceFile: "CONCLUSIONES.pdf",
  blocks: [
    {
      title: "CONCLUSIÓN DEL VALOR",
      concepts: [["Valor por enfoque de costos"], ["Valor por enfoque de mercado"], ["Valor por enfoque de ingresos"], ["Valor concluido"], ["Valor concluido con letra"], ["Observaciones finales"]],
    },
    {
      title: "DECLARACIONES Y CERTIFICACIÓN",
      concepts: [["Declaración del valuador"], ["Alcance del avalúo"], ["Limitaciones"], ["Fecha de emisión"]],
    },
    {
      title: "FIRMAS",
      concepts: [["Valuador"], ["Cédula profesional"], ["Registro"], ["Firma"]],
    },
  ],
});

/**
 * The concepts the calculation fills carry their key from the start
 * (`calculationKey`): renamed, they keep receiving the concluded value and
 * the carátula's signatures.
 */
export const conclusionesSection: AppSection = {
  ...template,
  blocks: template.blocks.map((block) => ({
    ...block,
    concepts: block.concepts.map((concept) => {
      const calculationKey = conceptCalculationKey(concept);
      return calculationKey ? { ...concept, calculationKey } : concept;
    }),
  })),
};

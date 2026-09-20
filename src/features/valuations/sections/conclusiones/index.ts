import { defineSection } from "../../section-builders";

export const conclusionesSection = defineSection({
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

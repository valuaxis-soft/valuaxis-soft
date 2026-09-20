import { defineSection } from "../../section-builders";

export const ingresosSection = defineSection({
  id: "ingresos",
  title: "ENFOQUE DE INGRESOS",
  sourceFile: "ENF.INGRESOS.pdf",
  blocks: [
    {
      title: "CAPITALIZACIÓN DE RENTAS",
      concepts: [["Renta mensual adoptada"], ["Renta anual bruta"], ["Deducciones"], ["Renta neta anual"], ["Tasa de capitalización"], ["Valor por capitalización"]],
    },
    {
      title: "TASA DE CAPITALIZACIÓN",
      concepts: [["Fuente de tasa"], ["Tasa adoptada"], ["Justificación"], ["Observaciones"]],
    },
    {
      title: "RESULTADO DEL ENFOQUE DE INGRESOS",
      concepts: [["Valor por ingresos"], ["Valor adoptado"], ["Observaciones"]],
    },
  ],
});

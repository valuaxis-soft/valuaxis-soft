import { defineSection } from "../../section-builders";

export const mercadoRentasSection = defineSection({
  id: "mercadoRentas",
  title: "MERCADO DE RENTAS",
  sourceFile: "MERCADO RENTAS.pdf",
  blocks: [
    {
      title: "COMPARABLES DE MERCADO DE RENTAS",
      tables: [{
        title: "COMPARABLES DE MERCADO DE RENTAS",
        columns: ["Comparable", "Ubicación", "Superficie", "Renta mensual", "Renta unitaria", "Fuente", "Observaciones"],
        columnKeys: ["comparable", "ubicacion", "superficie", "renta_mensual", "renta_unitaria", "fuente", "observaciones"],
      }],
    },
    {
      title: "HOMOLOGACIÓN DE RENTAS",
      tables: [{
        title: "HOMOLOGACIÓN DE RENTAS",
        columns: ["Comparable", "Factor de zona", "Factor de ubicación", "Factor de superficie", "Factor de estado", "Factor de negociación", "Factor resultante", "Renta homologada"],
        columnKeys: ["comparable", "factor_zona", "factor_ubicacion", "factor_superficie", "factor_estado", "factor_negociacion", "factor_resultante", "renta_homologada"],
      }],
    },
    {
      title: "RENTA ESTIMADA",
      concepts: [["Renta mensual mínima"], ["Renta mensual máxima"], ["Renta mensual promedio"], ["Renta mensual adoptada"], ["Observaciones"]],
    },
  ],
});

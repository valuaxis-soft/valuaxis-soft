import { defineSection } from "../../section-builders";

export const mercadoVentaSection = defineSection({
  id: "mercadoVenta",
  title: "ENFOQUE DE MERCADO EN VENTA",
  sourceFile: "ENF.MERCADO VENTA.pdf",
  blocks: [
    {
      title: "COMPARABLES DE MERCADO EN VENTA",
      tables: [{
        title: "COMPARABLES DE MERCADO EN VENTA",
        columns: ["Comparable", "Ubicación", "Superficie terreno", "Superficie construcción", "Precio oferta", "Precio unitario", "Fuente", "Observaciones"],
        columnKeys: ["comparable", "ubicacion", "superficie_terreno", "superficie_construccion", "precio_oferta", "precio_unitario", "fuente", "observaciones"],
      }],
    },
    {
      title: "HOMOLOGACIÓN DE COMPARABLES EN VENTA",
      tables: [{
        title: "HOMOLOGACIÓN DE COMPARABLES EN VENTA",
        columns: ["Comparable", "Factor de zona", "Factor de ubicación", "Factor de frente", "Factor de forma", "Factor de superficie", "Factor de topografía", "Factor de negociación", "Factor resultante", "Valor homologado"],
        columnKeys: ["comparable", "factor_zona", "factor_ubicacion", "factor_frente", "factor_forma", "factor_superficie", "factor_topografia", "factor_negociacion", "factor_resultante", "valor_homologado"],
      }],
    },
    {
      title: "RESUMEN DEL ENFOQUE DE MERCADO EN VENTA",
      concepts: [["Valor mínimo observado"], ["Valor máximo observado"], ["Valor promedio homologado"], ["Valor adoptado"], ["Observaciones"]],
    },
  ],
});

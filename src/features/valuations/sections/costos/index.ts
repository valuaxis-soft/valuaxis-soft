import { defineSection } from "../../section-builders";

export const costosSection = defineSection({
  id: "costos",
  title: "ENFOQUE DE COSTOS",
  sourceFile: "ENF.COSTOS.pdf",
  blocks: [
    {
      title: "TERRENO",
      // Surfaces are born as numbers and amounts as money; the remarks stay a text.
      concepts: [["Superficie de terreno", "", "number"], ["Valor unitario de terreno", "", "currency"], ["Valor de terreno", "", "currency"], ["Observaciones"]],
    },
    {
      title: "CONSTRUCCIONES",
      tables: [{
        title: "CÁLCULO DEL VALOR DE LAS CONSTRUCCIONES",
        columns: ["Tipo", "Descripción", "Superficie (m2)", "Valor unitario", "Edad", "Vida útil", "Factor de conservación", "Valor neto"],
        columnKeys: ["tipo", "descripcion", "superficie_m2", "valor_unitario", "edad", "vida_util", "factor_conservacion", "valor_neto"],
      }],
    },
    {
      title: "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
      tables: [{
        title: "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
        columns: ["Tipo", "Descripción", "Edad", "VUT", "VUR", "Conservación", "Mantenimiento", "Valor"],
        columnKeys: ["tipo", "descripcion", "edad", "vut", "vur", "conservacion", "mantenimiento", "valor"],
      }],
    },
    {
      title: "RESUMEN DEL ENFOQUE DE COSTOS",
      concepts: [
        ["Valor del terreno", "", "currency"],
        ["Valor de construcciones", "", "currency"],
        ["Valor de instalaciones especiales", "", "currency"],
        ["Valor físico o directo", "", "currency"],
        ["Observaciones"],
      ],
    },
  ],
});

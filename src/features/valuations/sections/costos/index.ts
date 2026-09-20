import { defineSection } from "../../section-builders";

export const costosSection = defineSection({
  id: "costos",
  title: "ENFOQUE DE COSTOS",
  sourceFile: "ENF.COSTOS.pdf",
  blocks: [
    {
      title: "TERRENO",
      concepts: [["Superficie de terreno"], ["Valor unitario de terreno"], ["Valor de terreno"], ["Observaciones"]],
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
      concepts: [["Valor del terreno"], ["Valor de construcciones"], ["Valor de instalaciones especiales"], ["Valor físico o directo"], ["Observaciones"]],
    },
  ],
});

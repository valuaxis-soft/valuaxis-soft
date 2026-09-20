import { defineSection } from "../../section-builders";

export const homologacionSection = defineSection({
  id: "homologacion",
  title: "FACTORES DE HOMOLOGACIÓN",
  sourceFile: "FACT.HOMOLOGACION.pdf",
  blocks: [{
    title: "FACTORES DE HOMOLOGACIÓN",
    tables: [{
      title: "FACTORES DE HOMOLOGACIÓN",
      columns: ["Factor", "Descripción", "Criterio", "Valor aplicado", "Observaciones"],
      columnKeys: ["factor", "descripcion", "criterio", "valor_aplicado", "observaciones"],
    }],
  }],
});

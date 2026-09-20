import { defineSection } from "../../section-builders";

export const indirectosSection = defineSection({
  id: "indirectos",
  title: "INDIRECTOS",
  sourceFile: "INDIRECTOS.pdf",
  blocks: [{
    title: "INDIRECTOS",
    tables: [{
      title: "INDIRECTOS",
      columns: ["Concepto", "Porcentaje", "Importe", "Observaciones"],
      columnKeys: ["concepto", "porcentaje", "importe", "observaciones"],
    }],
  }],
});

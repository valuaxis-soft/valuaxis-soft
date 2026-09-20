import { defineSection } from "../../section-builders";

export const fotosSujetoSection = defineSection({
  id: "fotosSujeto",
  title: "FOTOGRAFÍAS DEL SUJETO",
  sourceFile: "FOTOGRAFIAS SUJETO.pdf",
  blocks: [{
    title: "ANEXO FOTOGRÁFICO DEL SUJETO",
    concepts: [["Descripción"], ["Observaciones"]],
    images: [{ id: "foto-sujeto-01", title: "FOTOGRAFÍA DEL SUJETO" }],
  }],
});

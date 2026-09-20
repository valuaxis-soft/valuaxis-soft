import { defineSection } from "../../section-builders";

const definitions = [
  "Valor comercial",
  "Enfoque de Costos",
  "Enfoque de ingresos",
  "Valor Físico o directo",
  "Valor de capitalización de rentas",
  "Enfoque de mercado",
  "Valor Neto de Reposición (V.N.R.)",
  "Valor de Reposición Nuevo (V.R.N.)",
  "Valor de Inversión o valía",
  "Valor de liquidación ordenada (V.L.O.)",
  "Valor de liquidación forzada (V.L.F.)",
  "Factor de zona",
  "Factor de ubicación",
  "Factor de frente",
  "Factor de forma",
  "Factor de superficie",
  "Factor de topografía",
  "Factor de uso de suelo",
  "Factor de negociación",
  "Factor de proyecto",
  "Factor de edad",
  "Factor de estado de conservación",
  "Factor relación T/C - CUS",
  "Factor de calidad",
];

export const consideracionesSection = defineSection({
  id: "consideraciones",
  title: "CONSIDERACIONES",
  sourceFile: "CONSIDERACIONES.pdf",
  blocks: [
    {
      title: "CONSIDERACIONES PREVIAS AL AVALÚO",
      subBlocks: [
        {
          title: "CONSIDERACIONES GENERALES",
          concepts: [["Criterio técnico"], ["Fundamento legal"]],
        },
        {
          title: "DEFINICIONES",
          concepts: definitions.map((label) => [label]),
        },
        {
          title: "COMENTARIOS GENERALES, SUPUESTOS Y CONDICIONES LIMITANTES DEL AVALÚO",
          concepts: Array.from({ length: 12 }, (_, index) => ({
            id: `comentario_${String(index + 1).padStart(2, "0")}`,
            label: String(index + 1),
          })),
        },
      ],
    },
  ],
});

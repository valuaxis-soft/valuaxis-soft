import { defineSection } from "../../section-builders";

export const datosSection = defineSection({
  id: "datos",
  title: "DATOS",
  sourceFile: "SECCION DATOS.pdf",
  enabled: true,
  required: true,
  blocks: [
    {
      title: "ANTECEDENTES",
      concepts: [
        ["Solicitante"],
        ["Propietario"],
        ["Finalidad del avalúo", "Estimar el valor comercial"],
        ["Uso del avalúo", "Para posible compra-venta"],
      ],
    },
    {
      title: "INFORMACIÓN GENERAL DEL BIEN",
      concepts: [
        ["Bien que se valúa", "Terreno urbano con construccion habitacional de 2 niveles."],
        ["Fecha de inspección", "12 de Diciembre 2024"],
        ["Fecha del avalúo", "12 de Febrero de 2024"],
        ["Perito valuador", "Mtro. Ing. Alvaro Gutierrez"],
      ],
    },
    {
      title: "UBICACIÓN DEL BIEN",
      concepts: [
        ["Calle", "Camino a los Sauces"],
        ["Número exterior / interior", "340 / 2"],
        ["Código postal"],
        ["Superficie total terreno", "160.00 m2"],
      ],
    },
    {
      title: "CARACTERÍSTICAS URBANAS DE LA ZONA",
      concepts: [
        ["Clasificación de la zona", "Habitacional - Comercial mixto"],
        ["Índice de saturación", "70%"],
        ["Nivel socioeconómico", "Medio (c)"],
      ],
      subBlocks: [
        {
          title: "EQUIPAMIENTO URBANO",
          concepts: [
            ["Agua", "Mediante pozo"],
            ["Drenaje", "Mediante fosas septicas"],
            ["Electricidad", "Red aerea con posterias de concreto"],
          ],
        },
      ],
    },
  ],
});

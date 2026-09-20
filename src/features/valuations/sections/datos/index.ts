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
        ["Finalidad del avaluo", "Estimar el valor comercial"],
        ["Uso del avaluo", "Para posible compra-venta"],
      ],
    },
    {
      title: "INFORMACION GENERAL DEL BIEN",
      concepts: [
        ["Bien que se valua", "Terreno urbano con construccion habitacional de 2 niveles."],
        ["Fecha de inspeccion", "12 de Diciembre 2024"],
        ["Fecha del avaluo", "12 de Febrero de 2024"],
        ["Perito valuador", "Mtro. Ing. Alvaro Gutierrez"],
      ],
    },
    {
      title: "UBICACION DEL BIEN",
      concepts: [
        ["Calle", "Camino a los Sauces"],
        ["Numero exterior / interior", "340 / 2"],
        ["Codigo postal"],
        ["Superficie total terreno", "160.00 m2"],
      ],
    },
    {
      title: "CARACTERISTICAS URBANAS DE LA ZONA",
      concepts: [
        ["Clasificacion de la zona", "Habitacional - Comercial mixto"],
        ["Indice de saturacion", "70%"],
        ["Nivel socioeconomico", "Medio (c)"],
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

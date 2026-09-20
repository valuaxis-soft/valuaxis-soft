import { defineSection } from "../../section-builders";

const emptyCells = (count: number) => Array.from({ length: count }, () => "");

export const construccionSection = defineSection({
  id: "construccion",
  title: "INF. CONSTRUCCION",
  sourceFile: "IFN CONSTRUCCIONES.pdf",
  enabled: true,
  blocks: [
    {
      id: "construccion_descripcion_general",
      title: "DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES",
      concepts: [
        ["Uso actual"],
        ["Distribución del bien"],
        ["Número de niveles"],
        ["Estado de conservación"],
        ["Calidad del proyecto"],
        ["Clase general del bien"],
        ["Calidad y clasificación de la construcción"],
        ["Clase de Edificio"],
        ["Unidades susceptibles a rentarse"],
        ["Grado de terminación de obra"],
      ],
      subBlocks: [
        {
          id: "construccion_tipos",
          title: "TIPOS DE CONSTRUCCIONES, CALIDADES Y CLASIFICACIONES",
          tables: [
            {
              id: "construccion_tipos",
              title: "TIPOS DE CONSTRUCCIONES, CALIDADES Y CLASIFICACIONES",
              columns: [
                "Tipo",
                "Tipo",
                "Clasificación",
                "Calidad",
                "Conservación",
                "Edad",
                "VUT",
                "VUR",
                "Sup. (m²)",
                "Descripción",
              ],
              columnKeys: [
                "tipo",
                "tipo_construccion",
                "clasificacion",
                "calidad",
                "conservacion",
                "edad",
                "vut",
                "vur",
                "sup_m2",
                "descripcion",
              ],
              rows: [
                ["T-1", ...emptyCells(9)],
                ["T-2", ...emptyCells(9)],
                ["T-3", ...emptyCells(9)],
              ],
            },
          ],
        },
      ],
    },
    {
      id: "elementos_construccion",
      title: "ELEMENTOS DE CONSTRUCCIÓN",
      concepts: [
        ["Especificaciones observadas en la visita al bien salvo error u omisión."],
      ],
      subBlocks: [
        {
          id: "obra_gruesa",
          title: "OBRA GRUESA O NEGRA",
          concepts: [
            ["Cimentación"],
            ["Estructura"],
            ["Muros"],
            ["Entrepisos"],
            ["Techos"],
            ["Azoteas"],
            ["Bardas"],
          ],
        },
        {
          id: "acabados_interiores",
          title: "REVESTIMIENTOS Y ACABADOS INTERIORES",
          concepts: [
            ["Aplanados"],
            ["Plafones"],
            ["Lambrines"],
            ["Pisos"],
            ["Zoclos"],
            ["Escaleras"],
            ["Pintura"],
            ["Recubrimientos Especiales"],
          ],
        },
        {
          id: "carpinteria",
          title: "CARPINTERÍA",
          concepts: [
            ["Puertas de intercomunicación"],
            ["Puertas de closets"],
            ["Interiores de closet"],
          ],
        },
        {
          id: "instalaciones_hidraulicas",
          title: "INSTALACIONES HIDRÁULICAS Y SANITARIAS",
          concepts: [
            ["Red hidráulica"],
            ["Red sanitaria"],
            ["Lavabos"],
            ["Muebles de baño"],
            ["Accesorios"],
            ["Canceles de baño"],
          ],
        },
        {
          id: "instalaciones_electricas",
          title: "INSTALACIONES ELÉCTRICAS",
          concepts: [
            ["Tipo de instalación"],
            ["Materiales"],
            ["Salidas"],
            ["Tableros"],
            ["Tipo de Voltaje"],
          ],
        },
        {
          id: "herreria_canceleria",
          title: "HERRERÍA Y CANCELERÍA",
          concepts: [
            ["Tipo de herrería"],
            ["Material de herrería"],
            ["Perfiles"],
            ["Claros"],
            ["Material Vidriería"],
            ["Tipo"],
            ["Espesor"],
            ["Espejos"],
            ["Domos"],
            ["Tragaluces"],
          ],
        },
        {
          id: "otros_construccion",
          title: "OTROS",
          concepts: [["Cerrajería"], ["Cocina"], ["Obra Exterior"]],
        },
      ],
    },
    {
      id: "instalaciones_especiales",
      title: "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
      subBlocks: [
        {
          id: "instalaciones_especiales_detalle",
          title:
            "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (I.E., E.A., O.C.)",
          tables: [
            {
              id: "instalaciones_especiales",
              title:
                "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (I.E., E.A., O.C.)",
              columns: [
                "#",
                "Tipo",
                "Edad",
                "VUT",
                "VUR",
                "Conservación",
                "Mantenimiento",
                "Descripción",
              ],
              columnKeys: [
                "numero",
                "tipo",
                "edad",
                "vut",
                "vur",
                "conservacion",
                "mantenimiento",
                "descripcion",
              ],
              rows: [
                [
                  "1",
                  "I.E.",
                  "3",
                  "7",
                  "4",
                  "bueno",
                  "regular",
                  "Aire acondicionado de 1 tonelada, con accesorios incluidos e instalado en sala principal.",
                ],
                ["2", ...emptyCells(7)],
                ["3", ...emptyCells(7)],
                ["4", ...emptyCells(7)],
                ["5", ...emptyCells(7)],
              ],
            },
          ],
        },
      ],
    },
  ],
});

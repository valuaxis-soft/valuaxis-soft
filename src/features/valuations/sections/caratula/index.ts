import { defineSection } from "../../section-builders";
import { createCompanyHeaderBlock } from "../../services/caratula-company-header";

export const caratulaSection = defineSection({
  id: "caratula",
  title: "CARATULA",
  sourceFile: "CARATULA.pdf",
  enabled: true,
  required: true,
  blocks: [
    createCompanyHeaderBlock(),
    {
      id: "caratula-block-1-datos-del-inmueble",
      title: "DATOS DEL BIEN",
      concepts: [
        ["Calle"],
        ["Numero exterior / interior"],
        ["Ejido o poblado"],
        ["Delegacion o municipio"],
        ["Codigo postal"],
        ["Entidad federativa"],
      ],
    },
    {
      id: "caratula-block-2-datos-del-solicitante",
      title: "DATOS DEL SOLICITANTE",
      concepts: [
        ["Propietario"],
        ["Solicitante"],
        ["Telefono"],
        ["Correo"],
      ],
    },
    {
      id: "caratula-block-3-caracteristicas",
      title: "CARACTERISTICAS",
      concepts: [
        ["Superficie total terreno"],
        ["Superficie total de construccion"],
        ["Uso actual del bien"],
        ["Numero de niveles"],
      ],
    },
    {
      id: "caratula-block-4-datos-del-avaluo",
      title: "DATOS DEL AVALUO",
      concepts: [
        ["Fecha de avaluo"],
        ["Vigencia de avaluo"],
        ["Uso del avaluo"],
        ["Proposito del avaluo"],
        ["Lugar y fecha de solicitud"],
      ],
    },
    {
      id: "caratula-block-5-supuestos-y-condiciones-limitantes-que-influyen-en-el-valor-dictaminado",
      title: "SUPUESTOS Y CONDICIONES LIMITANTES QUE INFLUYEN EN EL VALOR DICTAMINADO",
      concepts: [["Descripcion"]],
    },
    {
      id: "caratula-block-6-conclusion",
      title: "CONCLUSION",
      concepts: [
        ["Valor comercial del bien"],
        ["Cifra en letras"],
        ["Perito valuador"],
      ],
    },
  ],
});

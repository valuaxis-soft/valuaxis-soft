import { defineSection } from "../../section-builders";
import { createCompanyHeaderBlock } from "../../services/caratula-company-header";

const SECTION = { id: "caratula", title: "CARATULA", sourceFile: "CARATULA.pdf", enabled: true, required: true } as const;

const APPLICANT_BLOCK = {
  id: "caratula-block-2-datos-del-solicitante",
  title: "DATOS DEL SOLICITANTE",
  concepts: [
    ["Propietario"],
    ["Solicitante"],
    ["Telefono"],
    ["Correo"],
  ] as [string][],
};

const VALUATION_BLOCKS = [
  {
    id: "caratula-block-4-datos-del-avaluo",
    title: "DATOS DEL AVALUO",
    concepts: [
      ["Fecha de avaluo"],
      ["Vigencia de avaluo"],
      ["Uso del avaluo"],
      ["Proposito del avaluo"],
      ["Lugar y fecha de solicitud"],
    ] as [string][],
  },
  {
    id: "caratula-block-5-supuestos-y-condiciones-limitantes-que-influyen-en-el-valor-dictaminado",
    title: "SUPUESTOS Y CONDICIONES LIMITANTES QUE INFLUYEN EN EL VALOR DICTAMINADO",
    concepts: [["Descripcion"]] as [string][],
  },
  {
    id: "caratula-block-6-conclusion",
    title: "CONCLUSION",
    concepts: [
      ["Valor comercial del bien"],
      ["Cifra en letras"],
      ["Perito valuador"],
    ] as [string][],
  },
];

export const caratulaSection = defineSection({
  ...SECTION,
  blocks: [
    createCompanyHeaderBlock(),
    {
      id: "caratula-block-1-datos-del-inmueble",
      title: "DATOS DEL BIEN",
      concepts: [
        ["Calle"],
        ["Número exterior / interior"],
        ["Ejido o poblado"],
        ["Delegacion o municipio"],
        ["Código postal"],
        ["Entidad federativa"],
      ],
    },
    APPLICANT_BLOCK,
    {
      id: "caratula-block-3-caracteristicas",
      title: "CARACTERÍSTICAS",
      concepts: [
        ["Superficie total terreno"],
        ["Superficie total de construccion"],
        ["Uso actual del bien"],
        ["Numero de niveles"],
      ],
    },
    ...VALUATION_BLOCKS,
  ],
});

/** The block of the machine's data in a machinery carátula; its first concept is «Tipo de máquina / equipo». */
export const MACHINERY_CARATULA_DATA_BLOCK_ID = "caratula-block-1-datos-del-bien-mueble";
export const MACHINERY_CARATULA_KIND_CONCEPT_ID = `${MACHINERY_CARATULA_DATA_BLOCK_ID}-concept-1`;

/**
 * The carátula of a machinery and equipment valuation, as the MEH book's
 * «l. CARATULA» (B28–C40): the machine's data instead of the street, the
 * postal code, the land and the levels of a property, which a machinery
 * carátula printed as «—» (FAL-21). Horómetro and odómetro are both offered:
 * the appraiser keeps the one the machine has (a car is measured in km, a
 * backhoe in hours). Every concept stays editable.
 */
export const machineryCaratulaSection = defineSection({
  ...SECTION,
  blocks: [
    createCompanyHeaderBlock(),
    {
      id: MACHINERY_CARATULA_DATA_BLOCK_ID,
      title: "DATOS DEL BIEN A VALUAR",
      concepts: [
        ["Tipo de máquina / equipo"],
        ["Marca"],
        ["Modelo"],
        ["Número de serie"],
        ["Año de fabricación"],
        ["País de origen"],
        ["Ubicación del bien"],
      ],
    },
    APPLICANT_BLOCK,
    {
      id: "caratula-block-3-caracteristicas-del-bien-mueble",
      title: "CARACTERÍSTICAS",
      concepts: [
        ["Capacidad / potencia"],
        ["Horas de uso (horómetro)"],
        ["Kilometraje (odómetro)"],
        ["Estado de conservación"],
      ],
    },
    ...VALUATION_BLOCKS,
  ],
});

/** The block of the vehicle's data in a vehicle carátula; its first concept is «Tipo de máquina / equipo», as the book has it. */
export const VEHICLE_CARATULA_DATA_BLOCK_ID = "caratula-block-1-datos-del-vehiculo";
export const VEHICLE_CARATULA_KIND_CONCEPT_ID = `${VEHICLE_CARATULA_DATA_BLOCK_ID}-concept-1`;

/**
 * The carátula of a vehicle (an automobile, a pickup, a truck, a motorcycle),
 * as the firm's automobile book prints it (25 Nov 2026, «FORMATO AVALUO
 * AUTOMOVIL»): its «l. CARATULA» (B29–B40) in that order and with those
 * names — the plate and both serial numbers, the power, the odómetro instead
 * of the horómetro — and, as «CARACTERÍSTICAS», what its «I.3 DATOS DE
 * IDENTIFICACIÓN DEL BIEN» adds (color, submarca, tracción, transmisión,
 * motor, combustible, componentes) with the «Estado de conservación» of its
 * inspection. Every concept stays editable.
 */
export const vehicleCaratulaSection = defineSection({
  ...SECTION,
  blocks: [
    createCompanyHeaderBlock(),
    {
      id: VEHICLE_CARATULA_DATA_BLOCK_ID,
      title: "DATOS DEL BIEN A VALUAR",
      concepts: [
        ["Tipo de máquina / equipo"],
        ["Marca"],
        ["Modelo"],
        ["Matrícula"],
        ["No. de serie chasis"],
        ["No. de serie motor"],
        ["Año de fabricación"],
        ["País de origen"],
        ["Potencia (HP/kW)"],
        ["Odómetro"],
        ["Ubicación del bien"],
      ],
    },
    APPLICANT_BLOCK,
    {
      id: "caratula-block-3-caracteristicas-del-vehiculo",
      title: "CARACTERÍSTICAS",
      concepts: [
        ["Color"],
        ["Submarca"],
        ["Tracción"],
        ["Tipo de transmisión"],
        ["Tipo de motor"],
        ["Combustible"],
        ["Componentes principales"],
        ["Estado de conservación"],
      ],
    },
    ...VALUATION_BLOCKS,
  ],
});

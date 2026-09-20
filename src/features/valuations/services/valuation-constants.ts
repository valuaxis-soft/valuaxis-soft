import type { Block, Comparable, ValuationMeta } from "@/features/valuations/model";

export type {
  Block,
  Comparable,
  Concept,
  ImageContent,
  PropertyKind,
  Apartado,
  TableContent,
  ValuationKind,
  ValuationMeta,
} from "@/features/valuations/model";

export const initialMeta: ValuationMeta = {
  folio: "",
  client: "",
  postalCode: "",
  location: "",
  valuationKind: "venta",
  propertyKind: "casa",
};

export const appraisalFlow = [
  "Dashboard",
  "Crear proyecto",
  "Datos",
  "Informacion del terreno",
  "Informacion de construccion",
  "Consideraciones",
  "Enfoque costos",
  "Mercado venta",
  "Mercado rentas",
  "Ingresos",
  "Fotografias",
  "Croquis y foto comp",
  "Homologacion",
  "Indirectos",
  "Cifra en letras",
];

export const initialBlocks: Block[] = [];

export const initialComparables: Comparable[] = [];

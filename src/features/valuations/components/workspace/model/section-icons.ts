import {
  Banknote,
  BookOpenCheck,
  Building2,
  Camera,
  Columns3,
  FileCheck2,
  FileImage,
  FileText,
  Landmark,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

/** Tab icon for each workspace section id. */
export const sectionIconMap = {
  caratula: ShieldCheck,
  datos: BookOpenCheck,
  terreno: MapPinned,
  construccion: Building2,
  consideraciones: FileCheck2,
  costos: Landmark,
  mercadoVenta: Banknote,
  mercadoRentas: Banknote,
  ingresos: Banknote,
  fotografias: Camera,
  croquis: FileImage,
  homologacion: FileCheck2,
  indirectos: Columns3,
  conclusiones: FileText,
  mapaComparables: MapPinned,
};

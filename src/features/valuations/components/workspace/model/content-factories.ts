import type { Apartado, Block, Concept, ConceptType, TableContent } from "@/features/valuations/model";
import { createIndependentConcept } from "@/features/valuations/concept-links";
import { UNTITLED_CARATULA_CONCEPT } from "@/features/valuations/services/caratula-blocks";
import { createHomologationTable } from "@/features/valuations/services/table";

export const newId = () => crypto.randomUUID();

function defaultTitleForType(type?: ConceptType): string {
  switch (type) {
    case "date": return "Fecha";
    case "phone": return "Teléfono";
    case "email": return "Correo";
    default: return "Nuevo concepto";
  }
}

export function createConcept(label?: string, type?: ConceptType): Concept {
  const resolvedLabel =
    label && label !== UNTITLED_CARATULA_CONCEPT
      ? label
      : defaultTitleForType(type);
  return createIndependentConcept({ id: newId(), label: resolvedLabel, value: "", type });
}

export function createBlock(conceptLabel?: string): Block {
  return {
    id: newId(),
    title: "NUEVO BLOQUE",
    sectionLabel: "",
    enabled: true,
    required: false,
    startOnNewPage: false,
    concepts: [createConcept(conceptLabel)],
    apartados: [],
    tables: [],
    images: [],
  };
}

export function createApartado(): Apartado {
  return {
    id: newId(),
    title: "NUEVO SUBBLOQUE",
    enabled: true,
    startOnNewPage: false,
    concepts: [createConcept()],
    tables: [],
    images: [],
  };
}

export function createTable(preset?: "homologation"): TableContent {
  if (preset === "homologation") {
    return createHomologationTable() as unknown as TableContent;
  }
  // Create directly as V2 to avoid mixed-state issues
  const id = `tbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const colConcepto = `col-concepto-${id}`;
  const colDato = `col-dato-${id}`;
  const colObservacion = `col-observacion-${id}`;
  return {
    id,
    title: "Tabla configurable",
    version: 2,
    columns: [
      { id: colConcepto, name: "Concepto" },
      { id: colDato, name: "Dato" },
      { id: colObservacion, name: "Observacion" },
    ],
    rows: [{
      id: `row-${id}-1`,
      cells: {
        [colConcepto]: { kind: "value", value: "" },
        [colDato]: { kind: "value", value: "" },
        [colObservacion]: { kind: "value", value: "" },
      },
    }],
    enabled: true,
  } as unknown as TableContent;
}

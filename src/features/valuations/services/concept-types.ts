/**
 * The types a concept can be made with, or changed to, in every section:
 * what "+ Concepto" offers and what "Tipo de dato" of the ⋮ menu lists.
 * "Porcentaje" is not a type of its own: it is a number whose unit is "%".
 *
 * Pure: no React, no side effects.
 */
import type { Concept, ConceptCreationKind, ConceptType } from "../model";

export type ConceptTypeOption = { kind: ConceptCreationKind; label: string };

/** What "+ Concepto" offers, in this order. */
export const CONCEPT_CREATION_OPTIONS: readonly ConceptTypeOption[] = [
  { kind: "text", label: "Texto" },
  { kind: "longText", label: "Texto largo" },
  // A text with no concept label, printed from edge to edge.
  { kind: "paragraph", label: "Párrafo" },
  { kind: "number", label: "Número" },
  { kind: "currency", label: "Moneda" },
  { kind: "percent", label: "Porcentaje" },
  { kind: "date", label: "Fecha" },
  { kind: "phone", label: "Teléfono" },
  { kind: "url", label: "Url" },
  // One of the options the appraiser writes (the state of conservation, the use…).
  { kind: "list", label: "Lista" },
];

/** The types a concept can change to from its ⋮ menu: all but the paragraph, which has no label. */
export const CONCEPT_DATA_TYPE_OPTIONS: readonly ConceptTypeOption[] = CONCEPT_CREATION_OPTIONS.filter((option) => option.kind !== "paragraph");

const TYPE_LABELS: Record<ConceptType, string> = {
  text: "Texto",
  date: "Fecha",
  phone: "Teléfono",
  email: "Correo",
  number: "Número",
  currency: "Moneda",
  measurement: "Medida",
  longText: "Texto largo",
  url: "Vínculo / URL",
  paragraph: "Párrafo",
  list: "Lista",
};

export function conceptTypeLabel(type: ConceptType | undefined) {
  return TYPE_LABELS[type ?? "text"];
}

/** The type and format a concept is created with for a kind of "+ Concepto". */
export function conceptCreationPreset(kind?: ConceptCreationKind): Pick<Concept, "type" | "valueFormat" | "options"> {
  if (kind === "percent") return { type: "number", valueFormat: "percent" };
  if (kind === "list") return { type: "list", options: [] };
  return { type: kind };
}

/** The kind "Tipo de dato" shows for the concept: a number in % reads as "Porcentaje". */
export function conceptDataTypeValue(concept: Pick<Concept, "type" | "valueFormat">): ConceptCreationKind {
  const type = concept.type ?? "text";
  if (type === "number" && concept.valueFormat === "percent") return "percent";
  // Older types with no option of their own read as the closest one offered.
  if (type === "measurement") return "number";
  if (type === "email") return "text";
  return type;
}

const isCreationKind = (value: string): value is ConceptCreationKind =>
  CONCEPT_CREATION_OPTIONS.some((option) => option.kind === value);

/**
 * The patch that changes a concept to another kind. The value stays as
 * written; a number keeps its unit unless it was the "%" of a percentage,
 * and a list starts with no options.
 */
export function conceptDataTypePatch(concept: Pick<Concept, "type" | "valueFormat" | "options">, kind: string): Partial<Concept> {
  if (!isCreationKind(kind)) return {};
  const preset = conceptCreationPreset(kind);
  const keepsUnit = (preset.type === "number" || preset.type === "currency") && concept.valueFormat !== "percent";
  return {
    type: preset.type,
    valueFormat: preset.valueFormat ?? (keepsUnit ? concept.valueFormat : undefined),
    options: preset.type === "list" ? concept.options ?? [] : undefined,
  };
}

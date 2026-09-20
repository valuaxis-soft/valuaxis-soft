import type { Block, Concept } from "@/features/valuations/model";

export type CaratulaBlockKind = "intermediate" | "assumptions" | "conclusion";
export const UNTITLED_CARATULA_CONCEPT = "Campo sin título";

export function getCaratulaBlockKind(block: Pick<Block, "id" | "title">): CaratulaBlockKind {
  const identity = normalize(`${block.id} ${block.title}`);
  if (identity.includes("SUPUESTOS")) return "assumptions";
  if (identity.includes("CONCLUSION")) return "conclusion";
  return "intermediate";
}

export function isCaratulaIntermediateBlock(block: Pick<Block, "id" | "title">) {
  return getCaratulaBlockKind(block) === "intermediate";
}

export function hasUntitledConcepts(blocks: Pick<Block, "concepts" | "apartados">[]) {
  return blocks.some(
    (block) =>
      block.concepts.some((concept) => !concept.label.trim()) ||
      block.apartados.some((subBlock) => subBlock.concepts.some((concept) => !concept.label.trim())),
  );
}

export function isConclusionNarrativeConcept(concept: Pick<Concept, "label">) {
  const label = normalize(concept.label);
  return (
    !label.includes("VALOR COMERCIAL") &&
    !label.includes("CIFRA EN LETRAS") &&
    !label.includes("PERITO VALUADOR")
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

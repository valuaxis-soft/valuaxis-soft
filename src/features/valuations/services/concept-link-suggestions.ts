/**
 * Linking a concept to a datum the valuation already has (Álvaro, video 5.6,
 * 14:30–20:49): «Vincular con…» on any concept, the notice «Este dato ya
 * existe en …» when what is written repeats another concept, and the
 * automatic link of an import ("Incluir datos y autovincular").
 *
 * The link is the one the editor already has: the concepts share their
 * `valueKey`, so they show and edit the same value (`concept-links.ts`). The
 * title stays each concept's own. The system only offers: nothing is linked
 * without the appraiser asking for it.
 *
 * The calculation's Blocks are left out: what they show is rewritten by the
 * calculation.
 *
 * Pure: no React, no side effects.
 */

import { isGeneratedBlock } from "../calculation/market-document";
import type { AppSection, Concept } from "../model";
import { normalizeConceptTitle } from "./concept-title";
import { stripTextMarks } from "./text-marks";

export type LinkableConcept = { concept: Concept; sectionId: string; location: string };

/** The concepts of the valuation that can be linked to, in document order, with where each is: «Carátula › Datos del bien › Solicitante». */
export function linkableConcepts(sections: AppSection[]): LinkableConcept[] {
  return sections.filter((section) => !section.removed).flatMap((section) => {
    const sectionTitle = section.title || section.label || section.id;
    return section.blocks.filter((block) => !isGeneratedBlock(block)).flatMap((block) => {
      const blockPlace = [sectionTitle, block.title].filter((part) => part?.trim()).join(" › ");
      return [
        ...block.concepts.map((concept) => ({ concept, sectionId: section.id, location: blockPlace })),
        ...block.apartados.flatMap((apartado) => apartado.concepts.map((concept) => ({
          concept,
          sectionId: section.id,
          location: [blockPlace, apartado.title].filter((part) => part?.trim()).join(" › "),
        }))),
      ];
    });
  });
}

/** Titles that say nothing: a new concept is not «the same» as another new one. */
const GENERIC_TITLES = new Set(["", "nuevo concepto", "concepto", "titulo", "sin titulo", "dato"]);

/** A title as it is compared: without the closing colon, accents, case or extra spaces. */
export function comparableTitle(title: string): string {
  return normalizeConceptTitle(title).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A value as it is compared: its text without bold or italics, case or extra spaces. */
export function comparableValue(value: string): string {
  return stripTextMarks(value).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A value distinctive enough to say it «already exists»: a text with a letter
 * («Luis Mariano Hernández Ruiz», «5 de noviembre de 2026») or a figure of
 * six characters or more. «1», «Sí» or «100» repeat by chance.
 */
function distinctiveValue(value: string): boolean {
  return value.length >= 4 && (/\p{L}/u.test(value) || value.length >= 6);
}

const linkedTogether = (a: Concept, b: Concept) => Boolean(a.valueKey && a.valueKey === b.valueKey);

export type LinkSuggestion = { source: Concept; location: string; reason: "value" | "title" };

/**
 * Another concept of the valuation the concept could be linked to, or null:
 * one that holds the same value (`reason: "value"`, offered after writing
 * it) or, failing that, one with the same title that has a value
 * (`reason: "title"`, offered after naming a new concept). Never one it is
 * already linked to.
 */
export function suggestLink(sections: AppSection[], conceptId: string, reason: "value" | "title"): LinkSuggestion | null {
  const all = linkableConcepts(sections);
  const target = all.find((item) => item.concept.id === conceptId)?.concept;
  if (!target || target.type === "paragraph") return null;
  const others = all.filter((item) => item.concept.id !== conceptId && !linkedTogether(item.concept, target));
  if (reason === "value") {
    const value = comparableValue(target.value);
    if (!distinctiveValue(value)) return null;
    const twin = others.find((item) => comparableValue(item.concept.value) === value);
    return twin ? { source: twin.concept, location: twin.location, reason } : null;
  }
  const title = comparableTitle(target.label);
  if (GENERIC_TITLES.has(title)) return null;
  const twin = others.find((item) => comparableTitle(item.concept.label) === title && comparableValue(item.concept.value) !== "" && comparableValue(item.concept.value) !== comparableValue(target.value));
  return twin ? { source: twin.concept, location: twin.location, reason } : null;
}

/** The concept with the value of `source`, linked to it: its value, type, format and formula from then on. Its title stays. */
export function linkedToSource(concept: Concept, source: Concept & { valueKey: string }): Concept {
  const { formula: _own, ...rest } = concept;
  return {
    ...rest,
    value: source.value,
    type: source.type ?? concept.type ?? "text",
    valueFormat: source.valueFormat,
    sourceUnit: source.sourceUnit,
    customUnit: source.customUnit,
    valueKey: source.valueKey,
    ...(source.formula ? { formula: source.formula } : {}),
  };
}

function mapConcepts(sections: AppSection[], fn: (concept: Concept) => Concept): AppSection[] {
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map(fn),
      apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: apartado.concepts.map(fn) })),
    })),
  }));
}

/**
 * «Incluir datos y autovincular»: every concept of `imported` whose title is
 * the one of a concept the valuation already had takes that concept's value
 * and stays linked to it, with the concepts it was linked to in its source.
 * The first such concept with a value is chosen, in document order (the
 * carátula comes first); one still empty is not linked to, so the imported
 * value is not lost. Concepts with a formula of their own and paragraphs
 * keep theirs.
 */
export function autoLinkConcepts(sections: AppSection[], imported: ReadonlySet<string>): { sections: AppSection[]; linked: number } {
  const all = linkableConcepts(sections);
  const byTitle = new Map<string, Concept>();
  for (const { concept } of all) {
    if (imported.has(concept.id) || concept.type === "paragraph") continue;
    const title = comparableTitle(concept.label);
    // A concept still empty here has no datum to give: the import keeps its own value instead of losing it.
    if (GENERIC_TITLES.has(title) || !comparableValue(concept.value) || byTitle.has(title)) continue;
    byTitle.set(title, concept);
  }

  // The source each imported value takes, by the value key the import gave it (shared by the concepts linked in the source).
  const sourceFor = new Map<string, Concept & { valueKey: string }>();
  const sourceKeys = new Map<string, string>();
  const keyed = (concept: Concept): Concept & { valueKey: string } => {
    const key = concept.valueKey ?? sourceKeys.get(concept.id) ?? `${concept.id}-value`;
    sourceKeys.set(concept.id, key);
    return { ...concept, valueKey: key };
  };
  for (const { concept } of all) {
    if (!imported.has(concept.id) || concept.type === "paragraph" || concept.formula) continue;
    const source = byTitle.get(comparableTitle(concept.label));
    if (!source) continue;
    const ownKey = concept.valueKey ?? `${concept.id}-value`;
    if (!sourceFor.has(ownKey)) sourceFor.set(ownKey, keyed(source));
  }
  if (!sourceFor.size) return { sections, linked: 0 };

  let linked = 0;
  const next = mapConcepts(sections, (concept) => {
    if (imported.has(concept.id)) {
      const source = sourceFor.get(concept.valueKey ?? `${concept.id}-value`);
      if (!source || concept.formula) return concept;
      linked += 1;
      return linkedToSource(concept, source);
    }
    // A source without a value key gets the one its linked copies now share.
    const key = sourceKeys.get(concept.id);
    return key && concept.valueKey !== key ? { ...concept, valueKey: key } : concept;
  });
  return { sections: next, linked };
}

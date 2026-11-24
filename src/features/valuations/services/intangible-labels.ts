/**
 * Valuaxis values tangible goods only (Álvaro, 24 Nov 2026): real estate,
 * land, constructions, machinery and equipment. The names of the concluded
 * values (the approaches, the resumen de valores, the concluded value and the
 * titles of the conclusion) may not conclude on intangibles, a going concern
 * or a business. Free texts are not checked: an observation may mention a
 * trademark without valuing it.
 *
 * Pure TypeScript — no React, no database.
 */
import { isConclusionCalculatedConcept } from "../calculation/conclusion-document";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { getCaratulaBlockKind } from "./caratula-blocks";

export const INTANGIBLE_REFUSAL_MESSAGE =
  "Valuaxis Soft es para valuar bienes tangibles: inmuebles, terrenos, construcciones, maquinaria y equipo. La valuación de intangibles, negocios en marcha o empresas no es objeto de este software.";

/** The words and phrases, without accents and in lower case; each matches as whole words, singular or plural. */
const INTANGIBLE_TERMS = [
  "intangibles?",
  "negocios? en marcha",
  "valor de (la )?empresas?",
  "valor del negocio",
  "marcas?",
  "nombres? comercial(es)?",
  "good\\s*will",
  "credito mercantil",
  "plusvalia mercantil",
  "patentes?",
  "franquicias?",
  "concesion(es)?",
  "derechos? de autor",
  "secretos? industrial(es)?",
  "software",
  "nombres? de dominio",
  "carteras? de clientes",
  "acuerdos? de no competencia",
];

const INTANGIBLE_PATTERN = new RegExp(
  `(?<![a-z0-9])(${INTANGIBLE_TERMS.map((term) => term.replace(/ /g, "\\s+")).join("|")})(?![a-z0-9])`,
);

/** Lower case, without accents: «Concesión» and «CONCESION» read alike. */
const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Whether a name speaks of intangibles, a going concern or a business («marcador» and «Marcos» do not). */
export function mentionsIntangibles(text: string): boolean {
  return INTANGIBLE_PATTERN.test(plain(text));
}

/** Why a name of a concluded value is refused, or null when it may be kept. */
export function conclusiveLabelRefusal(text: string): string | null {
  return mentionsIntangibles(text) ? INTANGIBLE_REFUSAL_MESSAGE : null;
}

type LabelledConcept = { id?: string; label?: string; calculationKey?: string };
type TitledBlock = { id?: string; title?: string; concepts?: LabelledConcept[] };
type TitledSection = { id?: string; blocks?: TitledBlock[] };

/**
 * The names a section gives its concluded values: in the conclusion, the
 * titles of its blocks and the names of the values the calculation writes;
 * in the carátula, the title of its conclusion and of its commercial value.
 */
function conclusiveNames(section: TitledSection): string[] {
  const key = getCanonicalSectionKey(section.id ?? "");
  if (key !== "CONCLUSIONES" && key !== "CARATULA") return [];
  return (section.blocks ?? []).flatMap((block) => {
    const titled = key === "CONCLUSIONES" || getCaratulaBlockKind({ id: block.id ?? "", title: block.title ?? "" }) === "conclusion";
    const concepts = (block.concepts ?? []).filter((concept) =>
      isConclusionCalculatedConcept(key, { id: concept.id ?? "", label: concept.label ?? "", calculationKey: concept.calculationKey }));
    return [...(titled && block.title ? [block.title] : []), ...concepts.map((concept) => concept.label ?? "")];
  });
}

/** The first name of a concluded value in the document that speaks of intangibles, or null. */
export function intangibleConclusiveName(sections: readonly TitledSection[]): string | null {
  for (const section of sections) {
    const name = conclusiveNames(section).find(mentionsIntangibles);
    if (name) return name;
  }
  return null;
}

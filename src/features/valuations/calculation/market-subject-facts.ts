import type { AppSection } from "../model";
import { isTerrenoSection } from "../sections/terreno/index";
import type { BuiltinCharacteristic } from "./market-types";

/** A datum of the subject already captured in the document, and where. */
export type SubjectFact = { value: string; source: string };
export type SubjectFacts = Partial<Record<BuiltinCharacteristic, SubjectFact>>;

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** The concepts that hold each characteristic of the subject, by their normalized name. */
const LABELS: Partial<Record<BuiltinCharacteristic, { exact: string[]; prefix?: string[] }>> = {
  frontage: { exact: ["frente", "frente del terreno", "frente del lote", "frente m"] },
  depth: { exact: ["fondo", "fondo del terreno", "fondo del lote", "fondo m"] },
  topography: { exact: [], prefix: ["topografia"] },
  landUseKey: { exact: ["uso de suelo", "uso del suelo", "clave de uso de suelo", "uso de suelo actual"] },
  shape: { exact: ["forma", "forma del terreno", "forma del lote", "configuracion"] },
  services: { exact: [], prefix: ["servicios"] },
};
const METRES: ReadonlySet<BuiltinCharacteristic> = new Set(["frontage", "depth"]);

/**
 * The subject's characteristics already captured in the document (V7.1-13):
 * front, depth, topography, land use, shape and services, read from the
 * concepts of the terreno section first and then of the rest. The table of
 * characteristics shows them in the subject's column while the appraiser
 * writes nothing there; it copies what was captured and recommends nothing.
 */
export function findSubjectFacts(sections: ReadonlyArray<AppSection>): SubjectFacts {
  const ordered = [...sections.filter((section) => isTerrenoSection(section)), ...sections.filter((section) => !isTerrenoSection(section))];
  const facts: SubjectFacts = {};
  for (const section of ordered) {
    if (section.enabled === false) continue;
    for (const block of section.blocks) {
      for (const concept of [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]) {
        const label = normalize(concept.label ?? "");
        const value = (concept.value ?? "").replace(/\s+/g, " ").trim();
        if (!label || !value) continue;
        for (const [key, names] of Object.entries(LABELS) as Array<[BuiltinCharacteristic, { exact: string[]; prefix?: string[] }]>) {
          if (facts[key]) continue;
          if (!names.exact.includes(label) && !names.prefix?.some((prefix) => label.startsWith(prefix))) continue;
          const number = value.replace(/,/g, "").match(/\d+(\.\d+)?/)?.[0];
          if (METRES.has(key) && !number) continue;
          facts[key] = { value: METRES.has(key) ? String(Number(number)) : value, source: `${section.title} › ${concept.label.trim()}` };
        }
      }
    }
  }
  return facts;
}

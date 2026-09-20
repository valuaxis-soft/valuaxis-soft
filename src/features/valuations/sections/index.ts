import { cloneSections, defineSection } from "../section-builders";
import { caratulaSection } from "./caratula";
import { conclusionesSection } from "./conclusiones";
import { consideracionesSection } from "./consideraciones";
import { construccionSection } from "./construccion";
import { costosSection } from "./costos";
import { croquisComparablesSection } from "./croquis-comparables";
import { datosSection } from "./datos";
import { fotosSujetoSection } from "./fotos-sujeto";
import { homologacionSection } from "./homologacion";
import { indirectosSection } from "./indirectos";
import { ingresosSection } from "./ingresos";
import { mercadoRentasSection } from "./mercado-rentas";
import { mercadoVentaSection } from "./mercado-venta";
import { terrenoSection } from "./terreno";
import {
  getCanonicalSectionKey,
  getOrderedValuationSections,
  sectionKeyToWorkspaceId,
} from "./section-registry";

const handcraftedSectionTemplates = [
  caratulaSection,
  datosSection,
  terrenoSection,
  construccionSection,
  consideracionesSection,
  costosSection,
  mercadoVentaSection,
  mercadoRentasSection,
  ingresosSection,
  conclusionesSection,
  fotosSujetoSection,
  croquisComparablesSection,
  homologacionSection,
  indirectosSection,
];

const sectionTemplates = getOrderedValuationSections().map((definition) => {
  const existing = handcraftedSectionTemplates.find(
    (section) => getCanonicalSectionKey(section.id) === definition.key,
  );
  if (existing) {
    return { ...existing, enabled: true, required: definition.required };
  }

  return defineSection({
    id: sectionKeyToWorkspaceId(definition.key),
    title: definition.label.toUpperCase(),
    sourceFile: `${definition.label}.pdf`,
    enabled: true,
    required: definition.required,
    blocks: [{ title: definition.label.toUpperCase(), concepts: [["Descripcion"]] }],
  });
});

export const createInitialSections = () => cloneSections(sectionTemplates);

export function getInitialSectionTemplate(sectionKey: string) {
  const canonical = getCanonicalSectionKey(sectionKey);
  const template = sectionTemplates.find(
    (section) => getCanonicalSectionKey(section.id) === canonical,
  );
  return template ? structuredClone(template) : null;
}

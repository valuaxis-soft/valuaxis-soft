import type { AppSection, Block, Concept, ImageContent, Apartado, TableContent } from "../../model";
import { defineSection } from "../../section-builders";
import { getCanonicalSectionKey } from "../section-registry";

export const TERRENO_MAIN_BLOCK_ID = "terreno-block-principal";
export const TERRENO_MACRO_IMAGE_ID = "terreno-croquis-macrolocalizacion";

export const TERRENO_ELEMENT_IDS = {
  // access removed — user creates via canonical ContentLayoutV2
  // sketch removed — user creates via canonical ContentLayoutV2
  boundaries: "terreno-element-medidas-colindancias",
  // topography removed — user creates via canonical ContentLayoutV2
} as const;

export type TerrenoElementKind = keyof typeof TERRENO_ELEMENT_IDS;

const BOUNDARY_ROWS = [
  ["Al Norte:", "", ""],
  ["Al Sur:", "", ""],
  ["Al Este:", "", ""],
  ["Al Oeste:", "", ""],
];

export const terrenoSection = defineSection({
  id: "terreno",
  title: "INFO TERRENO",
  sourceFile: "3. INF TERRENO.pdf",
  enabled: true,
  blocks: [
    {
      title: "TERRENO",
      subBlocks: [
        // Access removed — user creates via canonical ContentLayoutV2
        // Sketch removed — user creates via canonical ContentLayoutV2
        {
          title: "MEDIDAS Y COLINDANCIAS",
          concepts: [["Linderos y colindancias según:", "Escrituras públicas..."]],
          tables: [
            {
              title: "Medidas y colindancias",
              columns: ["Rumbo", "Distancia", "Colindancias"],
              rows: BOUNDARY_ROWS,
              boundaryDistanceFormats: BOUNDARY_ROWS.map(() => ({ valueFormat: "m" })),
            },
          ],
        },
        // Topography removed — user creates via canonical ContentLayoutV2
      ],
    },
  ],
});

const MAIN_TEMPLATE: Block = {
  ...terrenoSection.blocks[0],
  id: TERRENO_MAIN_BLOCK_ID,
  required: true,
  apartados: terrenoSection.blocks[0].apartados.map((element, index) => ({
    ...element,
    id: Object.values(TERRENO_ELEMENT_IDS)[index],
    // Legacy terrainSlot image creation removed — canonical images are user-managed
  })),
};

const TITLE_ALIASES: Record<TerrenoElementKind, string[]> = {
  // access removed — user creates via canonical ContentLayoutV2
  boundaries: ["medidas y colindancias"],
  // topography removed — user creates via canonical ContentLayoutV2
};

export function isTerrenoSection(section: Pick<AppSection, "id">) {
  return section.id === "terreno" || getCanonicalSectionKey(section.id) === "TERRENO";
}

export function isTerrenoMainBlock(
  block: Pick<Block, "id" | "title"> & Partial<Pick<Block, "apartados">>,
) {
  return block.id === TERRENO_MAIN_BLOCK_ID
    || block.id === terrenoSection.blocks[0].id
    || normalizeText(block.title) === "terreno"
    || Boolean(block.apartados?.some((element) => getTerrenoElementKind(element) !== null));
}

export function getTerrenoElementKind(
  element: Pick<Apartado, "id" | "title"> | Pick<Block, "id" | "title">,
): TerrenoElementKind | null {
  const byId = Object.entries(TERRENO_ELEMENT_IDS).find(([, id]) => id === element.id)?.[0];
  if (byId) return byId as TerrenoElementKind;

  const title = normalizeText(element.title);
  const byTitle = Object.entries(TITLE_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => title.includes(alias)),
  )?.[0];
  return (byTitle as TerrenoElementKind | undefined) ?? null;
}

export function isFixedTerrenoElement(element: Pick<Apartado, "id" | "title">) {
  return getTerrenoElementKind(element) !== null;
}

export function isValidTerrenoDistance(value: string) {
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

export function isLongTerrenoConcept(concept: Pick<Concept, "label" | "value">) {
  const lines = `${concept.label}\n${concept.value}`.split("\n").length;
  return lines > 4 || concept.value.length > 180 || concept.label.length + concept.value.length > 220;
}

export function ensureTerrenoSections(sections: AppSection[]) {
  return sections.map((section) => (isTerrenoSection(section) ? ensureTerrenoSection(section) : section));
}

export function ensureTerrenoSection(section: AppSection): AppSection {
  // Find the main terrain block (if it exists)
  const existingMain = section.blocks.find(isTerrenoMainBlock);
  
  // If no main block exists, user deleted it — pass through ALL blocks unchanged
  // This ensures deleted blocks stay deleted and renamed blocks keep their titles
  if (!existingMain) {
    return {
      ...section,
      title: "INFO TERRENO",
      sourceFile: "3. INF TERRENO.pdf",
      blocks: section.blocks,
    };
  }
  
  // Main block exists — normalize its elements
  const currentElements = existingMain.apartados.length
    ? existingMain.apartados
    : [];
  
  // Keep current elements, merge with template for terrain-specific elements
  const elements = currentElements.map((current) => {
    const kind = getTerrenoElementKind(current);
    if (!kind) return current; // Custom element, keep as-is
    const template = MAIN_TEMPLATE.apartados.find((t) => getTerrenoElementKind(t) === kind);
    if (!template) return current; // No template, keep as-is
    return mergeFixedElement(template, current, kind);
  });
  
  // Keep custom elements (non-fixed) that user created
  const customElements = currentElements.filter((element) => getTerrenoElementKind(element) === null);
  
  // Keep extra blocks that user created
  const extraBlocks = section.blocks.filter(
    (block) => block !== existingMain
      && getTerrenoElementKind(block) === null
      && normalizeText(block.title) !== "zona",
  );

  return {
    ...section,
    title: "INFO TERRENO",
    sourceFile: "3. INF TERRENO.pdf",
    blocks: [
      {
        ...structuredClone(existingMain),
        // Preserve user's title — never restore "TERRENO"
        apartados: elements,
      },
      ...extraBlocks,
    ],
  };
}

function blockToElement(block: Block): Apartado {
  return {
    id: block.id,
    title: block.title,
    enabled: block.enabled,
    concepts: block.concepts,
    tables: block.tables,
    images: block.images,
  };
}

function mergeFixedElement(
  template: Apartado,
  current: Apartado | undefined,
  kind: TerrenoElementKind,
): Apartado {
  if (!current) return structuredClone(template);

  const base: Apartado = {
    ...structuredClone(template),
    id: current.id,
    enabled: current.enabled,
    concepts: deduplicateConceptIds(current.concepts),
  };

  if (kind === "boundaries") {
    return { ...base, tables: [mergeBoundaryTable(template.tables[0], current.tables[0])] };
  }
  return base;
}

function deduplicateConceptIds(concepts: Concept[]): Concept[] {
  const seen = new Set<string>();
  return concepts.map((concept) => {
    if (!seen.has(concept.id)) {
      seen.add(concept.id);
      return concept;
    }
    return { ...concept, id: `${concept.id}-${crypto.randomUUID().slice(0, 8)}` };
  });
}

/**
 * Check if an image is a legacy terrain sketch image (has terrainSlot metadata).
 */
export function isLegacyTerrainSketchImage(image: Pick<ImageContent, "id" | "terrainSlot" | "src">): boolean {
  return image.terrainSlot === "macro" || image.terrainSlot === "micro";
}

/**
 * Check if a legacy terrain image is an empty default slot (no real user data).
 */
function isEmptyLegacySlot(image: Pick<ImageContent, "src">): boolean {
  return !image.src.trim();
}

/**
 * Migrate legacy terrain sketch images to canonical ImageContent.
 * - Empty slots: removed (no longer created by template)
 * - Real images: preserved with same id, src, title, layout metadata
 * - terrainSlot metadata: removed from migrated images
 */
function migrateLegacySketchImages(images: Apartado["images"]): Apartado["images"] {
  return images
    .filter((image) => {
      // Keep non-legacy images untouched
      if (!isLegacyTerrainSketchImage(image)) return true;
      // Remove empty legacy slots
      return !isEmptyLegacySlot(image);
    })
    .map((image) => {
      // Non-legacy images pass through unchanged
      if (!isLegacyTerrainSketchImage(image)) return image;
      // Migrate: preserve all user data, remove terrainSlot
      const { terrainSlot: _, ...canonical } = image;
      return canonical;
    });
}

function mergeBoundaryTable(template: TableContent, current: TableContent | undefined): TableContent {
  if (!current) return structuredClone(template);
  const rows = current.rows.map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? ""]);
  return {
    ...template,
    id: current.id,
    enabled: true,
    rows,
    boundaryDistanceFormats: rows.map((_, index) => current.boundaryDistanceFormats?.[index] ?? { valueFormat: "m" }),
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

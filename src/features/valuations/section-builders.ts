import { AppSection, Block, Concept, ConceptValueFormat, ImageContent, ImageLayoutWidth, Apartado, TableContent } from "./model";

type ConceptInput = [label: string, value?: string] | { id: string; label: string; value?: string };
type ImageInput = { id?: string; title: string; src?: string; layoutWidth?: ImageLayoutWidth; layoutWidthPercent?: number };
type TableInput = {
  id?: string;
  title: string;
  columns: string[];
  columnKeys?: string[];
  rows?: string[][];
  boundaryDistanceFormats?: Array<{ valueFormat?: ConceptValueFormat; customUnit?: string }>;
};
type ApartadoInput = {
  id?: string;
  title: string;
  concepts?: ConceptInput[];
  tables?: TableInput[];
  images?: ImageInput[];
};
type BlockInput = {
  id?: string;
  title: string;
  concepts?: ConceptInput[];
  subBlocks?: ApartadoInput[];
  tables?: TableInput[];
  images?: ImageInput[];
};
type SectionInput = {
  id: string;
  title: string;
  sourceFile: string;
  enabled?: boolean;
  required?: boolean;
  blocks: BlockInput[];
};

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

const makeConcept = (prefix: string, input: ConceptInput, index: number): Concept => {
  const [label, value = ""] = Array.isArray(input) ? input : [input.label, input.value ?? ""];
  return {
    id: Array.isArray(input) ? `${prefix}-concept-${index + 1}` : input.id,
    label,
    value,
    enabled: true,
  };
};

const makeImage = (prefix: string, image: ImageInput, index: number): ImageContent => ({
  id: image.id ?? `${prefix}-image-${index + 1}`,
  title: image.title,
  src: image.src ?? "",
  enabled: true,
  layoutWidth: image.layoutWidth,
  layoutWidthPercent: image.layoutWidthPercent,
});

const makeTable = (prefix: string, table: TableInput, index: number): TableContent => ({
  id: table.id ?? `${prefix}-table-${index + 1}-${slug(table.title)}`,
  title: table.title,
  columns: table.columns,
  columnKeys: table.columnKeys,
  rows: table.rows ?? [table.columns.map(() => "")],
  boundaryDistanceFormats: table.boundaryDistanceFormats,
  enabled: true,
});

const makeApartado = (prefix: string, subBlock: ApartadoInput, index: number): Apartado => {
  const id = subBlock.id ?? `${prefix}-subblock-${index + 1}-${slug(subBlock.title)}`;
  return {
    id,
    title: subBlock.title,
    enabled: true,
    concepts: (subBlock.concepts ?? []).map((concept, conceptIndex) =>
      makeConcept(id, concept, conceptIndex),
    ),
    tables: (subBlock.tables ?? []).map((table, tableIndex) => makeTable(id, table, tableIndex)),
    images: (subBlock.images ?? []).map((image, imageIndex) => makeImage(id, image, imageIndex)),
  };
};

const makeBlock = (sectionId: string, block: BlockInput, index: number): Block => {
  const id = block.id ?? `${sectionId}-block-${index + 1}-${slug(block.title)}`;
  return {
    id,
    title: block.title,
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: (block.concepts ?? []).map((concept, conceptIndex) =>
      makeConcept(id, concept, conceptIndex),
    ),
    apartados: (block.subBlocks ?? []).map((subBlock, subBlockIndex) =>
      makeApartado(id, subBlock, subBlockIndex),
    ),
    tables: (block.tables ?? []).map((table, tableIndex) => makeTable(id, table, tableIndex)),
    images: (block.images ?? []).map((image, imageIndex) => makeImage(id, image, imageIndex)),
  };
};

export function defineSection(input: SectionInput): AppSection {
  return {
    id: input.id,
    label: "",
    title: input.title,
    sourceFile: input.sourceFile,
    enabled: input.enabled ?? false,
    required: input.required ?? false,
    blocks: input.blocks.map((block, index) => makeBlock(input.id, block, index)),
  };
}

export const cloneSections = (sections: AppSection[]) => structuredClone(sections);

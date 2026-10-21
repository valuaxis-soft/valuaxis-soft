import type { AppSection, Block, CaratulaFormData, Concept, HeaderExtraField } from "@/features/valuations/model";
import { isDefaultCoverImageSize, normalizeCoverImageSize, type CoverImageSize } from "./cover-image-focus";

export const COMPANY_HEADER_BLOCK_ID = "caratula-company-header";

/** The extra header data: at most three short pairs, so the carátula stays on one page. */
export const MAX_HEADER_EXTRA_FIELDS = 3;
export const HEADER_EXTRA_LABEL_MAX = 40;
export const HEADER_EXTRA_VALUE_MAX = 120;

const companyHeaderFields = [
  { key: "tituloInmueble", id: "caratula-titulo-inmueble", label: "Título del inmueble" },
  { key: "direccionEmpresa", id: "caratula-company-header-direccion", label: "Dirección de empresa" },
  { key: "telefonoEmpresa", id: "caratula-company-header-telefono", label: "Teléfono de empresa" },
  { key: "correoEmpresa", id: "caratula-company-header-correo", label: "Correo de empresa" },
] as const;

export type CompanyHeaderData = Pick<
  CaratulaFormData,
  "tituloInmueble" | "direccionEmpresa" | "telefonoEmpresa" | "correoEmpresa"
> & {
  camposEncabezado: HeaderExtraField[];
  /** The size of the principal cover image travels with the carátula form and is kept with this block, like the extra data. */
  tamanoImagenPrincipal?: CoverImageSize;
};

const emptyCompanyHeader: CompanyHeaderData = {
  tituloInmueble: "",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  camposEncabezado: [],
};

/**
 * The extra header fields as stored and printed: trimmed, within their
 * lengths, at most three, and only the pairs with a label or a value.
 * Anything that is not a list of pairs is no field at all.
 */
export function normalizeHeaderExtraFields(value: unknown): HeaderExtraField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const text = (field: unknown, max: number) => (typeof field === "string" ? field.trim().slice(0, max) : "");
      return { label: text(row.label, HEADER_EXTRA_LABEL_MAX), value: text(row.value, HEADER_EXTRA_VALUE_MAX) };
    })
    .filter((field) => field.label || field.value)
    .slice(0, MAX_HEADER_EXTRA_FIELDS);
}

export function ensureCompanyHeaderFields(sections: AppSection[]) {
  return sections.map((section) => {
    if (section.id !== "caratula") return section;

    const headerBlock = findCompanyHeaderBlock(section);
    if (!headerBlock) return { ...section, blocks: [...section.blocks, createCompanyHeaderBlock()] };

    const concepts = [...headerBlock.concepts];
    for (const field of companyHeaderFields) {
      if (!findFieldConcept(concepts, field.id, field.label)) {
        concepts.push(createConcept(field.id, field.label));
      }
    }

    return {
      ...section,
      blocks: section.blocks.map((block) =>
        block.id === headerBlock.id ? { ...block, concepts } : block,
      ),
    };
  });
}

export function readCompanyHeaderFields(sections: AppSection[]): CompanyHeaderData {
  const section = sections.find((item) => item.id === "caratula");
  const block = section ? findCompanyHeaderBlock(section) : undefined;
  if (!block) return { ...emptyCompanyHeader };

  return companyHeaderFields.reduce<CompanyHeaderData>(
    (data, field) => ({
      ...data,
      [field.key]: findFieldConcept(block.concepts, field.id, field.label)?.value ?? "",
    }),
    {
      ...emptyCompanyHeader,
      camposEncabezado: normalizeHeaderExtraFields(block.headerFields),
      ...(block.coverImageSize ? { tamanoImagenPrincipal: normalizeCoverImageSize(block.coverImageSize) } : {}),
    },
  );
}

export function updateCompanyHeaderFields(
  sections: AppSection[],
  patch: Partial<CompanyHeaderData>,
) {
  return ensureCompanyHeaderFields(sections).map((section) => {
    if (section.id !== "caratula") return section;

    return {
      ...section,
      blocks: section.blocks.map((block) => {
        if (block.id !== COMPANY_HEADER_BLOCK_ID) return block;
        return {
          ...block,
          // The extra data lives in the block's configuration, not as concepts.
          ...(patch.camposEncabezado !== undefined ? { headerFields: normalizeHeaderExtraFields(patch.camposEncabezado) } : {}),
          // The default size is no size at all: the block reads as one saved before the size existed.
          ...(patch.tamanoImagenPrincipal !== undefined
            ? { coverImageSize: isDefaultCoverImageSize(patch.tamanoImagenPrincipal) ? undefined : normalizeCoverImageSize(patch.tamanoImagenPrincipal) }
            : {}),
          concepts: block.concepts.map((concept) => {
            const field = companyHeaderFields.find((item) => item.id === concept.id);
            if (!field) return concept;
            const value = patch[field.key];
            return value !== undefined ? { ...concept, value } : concept;
          }),
        };
      }),
    };
  });
}

export function createCompanyHeaderBlock(): Block {
  return {
    id: COMPANY_HEADER_BLOCK_ID,
    title: "DATOS DE EMPRESA VALUADORA",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: companyHeaderFields.map((field) => createConcept(field.id, field.label)),
    apartados: [],
    tables: [],
    images: [],
  };
}

function createConcept(id: string, label: string): Concept {
  return { id, label, value: "", enabled: true };
}

function findCompanyHeaderBlock(section: AppSection) {
  return section.blocks.find(
    (block) => block.id === COMPANY_HEADER_BLOCK_ID || normalize(block.title) === "DATOS DE EMPRESA VALUADORA",
  );
}

function findFieldConcept(concepts: Concept[], id: string, label: string) {
  return concepts.find((concept) => concept.id === id || normalize(concept.label) === normalize(label));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

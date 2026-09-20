import type { AppSection, Block, CaratulaFormData, Concept } from "@/features/valuations/model";

export const COMPANY_HEADER_BLOCK_ID = "caratula-company-header";

const companyHeaderFields = [
  { key: "tituloInmueble", id: "caratula-titulo-inmueble", label: "Título del inmueble" },
  { key: "direccionEmpresa", id: "caratula-company-header-direccion", label: "Dirección de empresa" },
  { key: "telefonoEmpresa", id: "caratula-company-header-telefono", label: "Teléfono de empresa" },
  { key: "correoEmpresa", id: "caratula-company-header-correo", label: "Correo de empresa" },
] as const;

export type CompanyHeaderData = Pick<
  CaratulaFormData,
  "tituloInmueble" | "direccionEmpresa" | "telefonoEmpresa" | "correoEmpresa"
>;

const emptyCompanyHeader: CompanyHeaderData = {
  tituloInmueble: "",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
};

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
    { ...emptyCompanyHeader },
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
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

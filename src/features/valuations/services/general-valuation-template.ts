import type { AppSection } from "@/features/valuations/model";
import { formatDateValue } from "@/features/valuations/services/concept-value-format";

const GENERAL_VALUATION_TEMPLATE_NAME = "Plantilla general de avaluo";

const GENERAL_CARATULA_CONCEPT_DEFAULTS = {
  title: "caratula-titulo-inmueble",
  owner: "caratula-block-2-datos-del-solicitante-concept-1",
  applicant: "caratula-block-2-datos-del-solicitante-concept-2",
  valuationDate: "caratula-block-4-datos-del-avaluo-concept-1",
  validUntil: "caratula-block-4-datos-del-avaluo-concept-2",
  purpose: "caratula-block-4-datos-del-avaluo-concept-4",
  valuator: "caratula-block-6-conclusion-concept-3",
} as const;

type ValuationTemplateIdentity = {
  SNombre: string;
  BEsSistema: boolean;
  IdOrganizacion: number | null;
};

export type GeneralCaratulaDefaults = {
  title?: string | null;
  clientName?: string | null;
  operationName?: string | null;
  responsibleName?: string | null;
  /** YYYY-MM-DD; shown as in the page header. */
  valuationDate?: string | null;
  validUntil?: string | null;
};

type ResponsibleUserName = {
  SNombre: string;
  SApellidoPaterno: string | null;
  SApellidoMaterno: string | null;
};

export function isSystemGeneralValuationTemplate(
  template: ValuationTemplateIdentity | null | undefined,
) {
  return template?.BEsSistema === true
    && template.IdOrganizacion === null
    && normalizeTemplateName(template.SNombre) === normalizeTemplateName(GENERAL_VALUATION_TEMPLATE_NAME);
}

export function hydrateGeneralCaratulaTemplate(
  template: AppSection,
  defaults: GeneralCaratulaDefaults,
) {
  const valuesByConceptId = new Map<string, string>();
  const title = cleanDefault(defaults.title);
  const clientName = cleanDefault(defaults.clientName);
  const operationName = cleanDefault(defaults.operationName);
  const responsibleName = cleanDefault(defaults.responsibleName);

  if (title) valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.title, title);
  if (clientName) {
    valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.owner, clientName);
    valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.applicant, clientName);
  }
  if (operationName) valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.purpose, operationName);
  if (responsibleName) valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.valuator, responsibleName);
  if (defaults.valuationDate) valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.valuationDate, formatDateValue(defaults.valuationDate));
  if (defaults.validUntil) valuesByConceptId.set(GENERAL_CARATULA_CONCEPT_DEFAULTS.validUntil, formatDateValue(defaults.validUntil));

  return {
    ...template,
    blocks: template.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map((concept) => {
        const value = valuesByConceptId.get(concept.id);
        return value === undefined ? concept : { ...concept, value };
      }),
    })),
  };
}

export function resolveResponsibleValuatorName(
  responsible: ResponsibleUserName | null | undefined,
  creatorName: string,
) {
  if (!responsible) return creatorName;
  return [responsible.SNombre, responsible.SApellidoPaterno, responsible.SApellidoMaterno]
    .filter(Boolean)
    .join(" ");
}

function cleanDefault(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeTemplateName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
/**
 * Input validation for the valuation API. Limits are generous for real
 * valuations and exist to reject malformed or abusive payloads. Objects are
 * "loose": the editor sends presentation metadata (layouts, spacing, formats)
 * that is stored as-is in JConfiguracion, so unknown keys are kept.
 */
import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const shortText = z.string().max(250);
const longText = z.string().max(20_000);
const positiveId = z.coerce.number().int().positive();

export const createValuationSchema = z.object({
  title: z.string().trim().min(1).max(250),
  clientName: shortText.optional(),
  appraisalTypeId: positiveId,
  propertyTypeId: positiveId,
  operationTypeId: positiveId,
  templateId: positiveId.nullish(),
  responsibleUserId: positiveId.nullish(),
});

const valuationMetaShape = {
  folio: z.string().max(80).optional(),
  client: shortText.optional(),
  location: z.string().max(500).optional(),
  postalCode: z.string().max(10).optional(),
  valuationKind: z.string().max(64).optional(),
  propertyKind: z.string().max(64).optional(),
  status: z.string().max(64).optional(),
};

export const updateValuationMetaSchema = z.object(valuationMetaShape);

const conceptSchema = z.looseObject({
  id: id.optional(),
  label: z.string().max(1_000).optional(),
  value: z.union([longText, z.number(), z.boolean(), z.null()]).optional(),
});

const tableSchema = z.looseObject({
  id: id.optional(),
  title: z.string().max(1_000).optional(),
  version: z.number().optional(),
  columns: z.array(z.unknown()).max(60).optional(),
  columnKeys: z.array(z.string().max(200)).max(60).optional(),
  rows: z.array(z.unknown()).max(2_000).optional(),
});

const imageSchema = z.looseObject({
  id: id.optional(),
  title: z.string().max(1_000).optional(),
  src: z.string().max(4_000).optional(),
});

const contentShape = {
  concepts: z.array(conceptSchema).max(500).optional(),
  tables: z.array(tableSchema).max(50).optional(),
  images: z.array(imageSchema).max(100).optional(),
};

const apartadoSchema = z.looseObject({
  id: id.optional(),
  title: z.string().max(1_000).optional(),
  ...contentShape,
});

const blockSchema = z.looseObject({
  id: id.optional(),
  title: z.string().max(1_000).optional(),
  label: z.string().max(250).optional(),
  ...contentShape,
  subBlocks: z.array(apartadoSchema).max(100).optional(),
});

const sectionSchema = z.looseObject({
  id: id.optional(),
  label: z.string().max(250).optional(),
  title: z.string().max(250).optional(),
  blocks: z.array(blockSchema).max(200).optional(),
});

export const saveFullValuationSchema = z.object({
  ...valuationMetaShape,
  sections: z.array(sectionSchema).max(40).optional(),
  caratula: z.record(z.string(), z.union([z.string().max(5_000), z.number(), z.null()])).optional(),
});

export const reopenValuationSchema = z.object({
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(1_000),
  acceptedText: z.string().trim().min(1, "La aceptación de términos es obligatoria").max(2_000),
});

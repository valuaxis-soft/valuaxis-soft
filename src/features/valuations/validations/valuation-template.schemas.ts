import { z } from "zod";

/** The database keeps a template's name in 180 characters. */
const templateName = z.string().trim().min(1, "Escribe el nombre de la plantilla.").max(120);
const templateDescription = z.string().trim().max(500, "La descripción admite hasta 500 caracteres.").nullish();
const catalogId = z.number().int().positive();

const fromValuationSchema = z.object({
  name: templateName,
  description: templateDescription,
  /** The valuation whose saved document becomes the template. */
  valuationId: z.uuid(),
  includeData: z.boolean().default(false),
  includeImages: z.boolean().default(false),
  /** Under the name of an existing template: a new version of it instead of the 409. */
  replace: z.boolean().default(false),
});

/** «Nueva plantilla»: a name, notes and what it is meant for; the editor shapes its document next. */
const blankTemplateSchema = z.object({
  name: templateName,
  description: templateDescription,
  appraisalTypeId: catalogId,
  /** Null: any kind of property. */
  propertyTypeId: catalogId.nullable().default(null),
});

/** From a valuation (it names one) or from scratch (it names the kind of valuation). */
export const createValuationTemplateSchema = z.union([fromValuationSchema, blankTemplateSchema]);

/** A new name and, when sent, a new description (null or empty clears it) and what it is meant for. */
export const updateValuationTemplateSchema = z.object({
  name: templateName,
  description: templateDescription,
  appraisalTypeId: catalogId.optional(),
  propertyTypeId: catalogId.nullable().optional(),
});

export const duplicateValuationTemplateSchema = z.object({ name: templateName });

/**
 * Something the editor holds of a section, block or apartado: an object with
 * an id. The rest of its shape is the editor's document model, kept as it
 * comes; the server cleans out the client's data before storing it
 * (document-template.ts).
 */
const node = z.looseObject({ id: z.string().min(1).max(200) });
const block = node.extend({
  title: z.string().max(2000).optional(),
  concepts: z.array(z.looseObject({})).max(2000),
  apartados: z.array(node.extend({ concepts: z.array(z.looseObject({})).max(2000) })).max(500),
  tables: z.array(z.looseObject({})).max(200),
  images: z.array(z.looseObject({})).max(200),
});

/** «Editar plantilla»: the editor's sections, the version it opened and whether this session already saved one. */
export const saveTemplateDocumentSchema = z.object({
  sections: z.array(node.extend({ title: z.string().max(500), blocks: z.array(block).max(500) })).min(1).max(100),
  version: z.number().int().positive(),
  sameSession: z.boolean().default(false),
});

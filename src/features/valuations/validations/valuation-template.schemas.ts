import { z } from "zod";

/** The database keeps a template's name in 180 characters. */
const templateName = z.string().trim().min(1, "Escribe el nombre de la plantilla.").max(120);
const templateDescription = z.string().trim().max(500, "La descripción admite hasta 500 caracteres.").nullish();

export const createValuationTemplateSchema = z.object({
  name: templateName,
  description: templateDescription,
  /** The valuation whose saved document becomes the template. */
  valuationId: z.uuid(),
  includeData: z.boolean().default(false),
  includeImages: z.boolean().default(false),
  /** Under the name of an existing template: a new version of it instead of the 409. */
  replace: z.boolean().default(false),
});

/** A new name and, when sent, a new description (null or empty clears it). */
export const updateValuationTemplateSchema = z.object({ name: templateName, description: templateDescription });

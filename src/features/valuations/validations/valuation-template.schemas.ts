import { z } from "zod";

/** The database keeps a template's name in 180 characters. */
const templateName = z.string().trim().min(1, "Escribe el nombre de la plantilla.").max(120);

export const createValuationTemplateSchema = z.object({
  name: templateName,
  description: z.string().trim().max(500).nullish(),
  /** The valuation whose saved document becomes the template. */
  valuationId: z.uuid(),
  includeData: z.boolean().default(false),
  includeImages: z.boolean().default(false),
});

export const renameValuationTemplateSchema = z.object({ name: templateName });

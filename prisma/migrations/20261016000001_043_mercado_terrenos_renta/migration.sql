-- Mercado de rentas de terrenos y factores personalizados del despacho.
--
-- Un avaluo puede llevar varios mercados, cada uno con sus comparables, su
-- homologacion y su valor: terrenos e inmuebles en venta, y en rentas tambien
-- terrenos e inmuebles. Faltaba el tipo de comparable de terrenos en renta.
--
-- En la homologacion el valuador puede agregar un factor que no esta en la
-- lista (por ejemplo "Vista" o "Acceso"). Al crearlo queda guardado en su
-- organizacion y se ofrece en la lista para volver a usarlo. Es una lista
-- JSON de {key, label}; NULL significa que no ha guardado ninguno.
--
-- Es idempotente.

INSERT INTO "devpware_tipos_comparables" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('TERRENO_RENTA', 'Terreno en renta', 'Comparable de terreno en renta.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "JFactoresPersonalizados" JSONB;

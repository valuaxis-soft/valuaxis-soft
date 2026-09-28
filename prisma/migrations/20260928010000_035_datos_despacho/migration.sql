-- Datos del despacho para el membrete del dictamen y los valores con que
-- nace cada avaluo: direccion, perito responsable, meses de vigencia y
-- prefijo del folio. Razon social, RFC, correo y telefono ya existian.
-- El logotipo es un Archivo LOGOTIPO relacionado con la organizacion.
--
-- Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SDireccion" VARCHAR(500);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SNombrePerito" VARCHAR(180);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SRegistroPerito" VARCHAR(120);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "IMesesVigencia" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SPrefijoFolio" VARCHAR(10) NOT NULL DEFAULT 'VLO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_organizaciones_meses_vigencia_check') THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_meses_vigencia_check" CHECK ("IMesesVigencia" BETWEEN 1 AND 24);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_organizaciones_prefijo_folio_check') THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_prefijo_folio_check" CHECK ("SPrefijoFolio" ~ '^[A-Z0-9]{1,10}$');
  END IF;
END $$;

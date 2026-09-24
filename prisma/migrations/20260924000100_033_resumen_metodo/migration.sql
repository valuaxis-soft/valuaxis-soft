-- How the value is concluded: a single approach or weighted approaches, with
-- the weights (docs/MOTOR-CALCULO.md). Idempotent.
ALTER TABLE "devpware_resumenes_valores" ADD COLUMN IF NOT EXISTS "JConfiguracion" JSONB;

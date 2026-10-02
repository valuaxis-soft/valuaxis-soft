-- Vigencia y firmas del avaluo.
--
-- Vigencia: se captura en meses completos, de 1 a 12, a criterio del
-- valuador. La caratula guarda los meses ("IMesesVigencia"); "DFechaVigencia"
-- sigue siendo la fecha del avaluo mas esos meses. El valor por omision del
-- despacho baja de un maximo de 24 a 12 meses.
--
-- Firmas: un avaluo lleva las firmas que hagan falta, cada una con nombre,
-- cedula profesional y cargo opcional, en "JFirmas" (lista ordenada). El
-- despacho guarda en su propio "JFirmas" las firmas con que nace cada avaluo.
-- Vacio (NULL) = fila anterior a este cambio: se lee el firmante unico de
-- "SNombreValuador"/"SRegistroValuador" (o "SNombrePerito"/"SRegistroPerito").
--
-- Es idempotente.

ALTER TABLE "devpware_caratulas_avaluos" ADD COLUMN IF NOT EXISTS "IMesesVigencia" INTEGER;
ALTER TABLE "devpware_caratulas_avaluos" ADD COLUMN IF NOT EXISTS "JFirmas" JSONB;
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "JFirmas" JSONB;

-- Caratulas existentes: los meses salen de sus dos fechas cuando estan a
-- meses completos (misma fecha de dia, o fin de mes recortado).
UPDATE "devpware_caratulas_avaluos" AS c
SET "IMesesVigencia" = m.meses
FROM (
  SELECT "IdCaratulaAvaluo",
         ((EXTRACT(YEAR FROM "DFechaVigencia" AT TIME ZONE 'UTC') - EXTRACT(YEAR FROM "DFechaAvaluo" AT TIME ZONE 'UTC')) * 12
          + EXTRACT(MONTH FROM "DFechaVigencia" AT TIME ZONE 'UTC') - EXTRACT(MONTH FROM "DFechaAvaluo" AT TIME ZONE 'UTC'))::INTEGER AS meses
  FROM "devpware_caratulas_avaluos"
  WHERE "IMesesVigencia" IS NULL AND "DFechaAvaluo" IS NOT NULL AND "DFechaVigencia" IS NOT NULL
) AS m
WHERE c."IdCaratulaAvaluo" = m."IdCaratulaAvaluo"
  AND m.meses BETWEEN 1 AND 12
  AND (c."DFechaAvaluo" AT TIME ZONE 'UTC' + make_interval(months => m.meses))::DATE = (c."DFechaVigencia" AT TIME ZONE 'UTC')::DATE;

UPDATE "devpware_organizaciones" SET "IMesesVigencia" = 12 WHERE "IMesesVigencia" > 12;

ALTER TABLE "devpware_organizaciones" DROP CONSTRAINT IF EXISTS "devpware_organizaciones_meses_vigencia_check";
ALTER TABLE "devpware_organizaciones"
  ADD CONSTRAINT "devpware_organizaciones_meses_vigencia_check" CHECK ("IMesesVigencia" BETWEEN 1 AND 12);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_caratulas_avaluos_meses_vigencia_check') THEN
    ALTER TABLE "devpware_caratulas_avaluos"
      ADD CONSTRAINT "devpware_caratulas_avaluos_meses_vigencia_check" CHECK ("IMesesVigencia" BETWEEN 1 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_caratulas_avaluos_firmas_check') THEN
    ALTER TABLE "devpware_caratulas_avaluos"
      ADD CONSTRAINT "devpware_caratulas_avaluos_firmas_check" CHECK ("JFirmas" IS NULL OR jsonb_typeof("JFirmas") = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_organizaciones_firmas_check') THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_firmas_check" CHECK ("JFirmas" IS NULL OR jsonb_typeof("JFirmas") = 'array');
  END IF;
END $$;

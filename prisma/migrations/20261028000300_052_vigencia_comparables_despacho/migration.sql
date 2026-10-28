-- Meses de vigencia de los comparables, por despacho.
--
-- Hasta ahora la vigencia de un comparable de la base era fija: seis meses
-- desde su alta o su ultima actualizacion. Cada despacho elige ahora sus meses
-- (1 a 12, validado en la aplicacion); cada comparable puede capturar los
-- suyos. Los despachos que ya existen quedan en 6, lo de antes.
--
-- Solo agrega una columna con valor por omision; no toca restricciones. Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "IMesesVigenciaComparables" INTEGER NOT NULL DEFAULT 6;

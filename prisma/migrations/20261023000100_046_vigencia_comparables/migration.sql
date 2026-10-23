-- Vigencia de los comparables de la base del despacho.
--
-- Cada comparable de un avaluo guarda el dia en que sus datos se capturaron o
-- se actualizaron por ultima vez ("Fecha de alta / actualizacion"). La
-- vigencia es ese dia mas seis meses; un comparable vencido solo se marca,
-- nada se bloquea. Editar los datos del comparable la renueva; calificar sus
-- factores no. Las copias de una version reabierta y los comparables que se
-- traen de la base con "Usar el existente" conservan la fecha del original.
--
-- Los comparables que ya existen toman el dia en que se agregaron al avaluo.
-- Es idempotente.

ALTER TABLE "devpware_comparables_avaluos" ADD COLUMN IF NOT EXISTS "DFechaActualizacionDatos" TIMESTAMPTZ(3);

UPDATE "devpware_comparables_avaluos"
SET "DFechaActualizacionDatos" = "DFechaSeleccion"
WHERE "DFechaActualizacionDatos" IS NULL;

ALTER TABLE "devpware_comparables_avaluos" ALTER COLUMN "DFechaActualizacionDatos" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "devpware_comparables_avaluos" ALTER COLUMN "DFechaActualizacionDatos" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "devpware_comparables_avaluos_DFechaActualizacionDatos_idx"
  ON "devpware_comparables_avaluos" ("DFechaActualizacionDatos");

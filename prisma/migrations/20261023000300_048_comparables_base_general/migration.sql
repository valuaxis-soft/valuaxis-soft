-- Comparables de la base general del despacho sin avaluo.
--
-- La plantilla maestra de comparables puede importarse "Solo a la base
-- general": cada renglon queda como un comparable del despacho (su numero
-- C-00123, sus datos y su revision) sin pertenecer a ningun avaluo, listo
-- para buscarse y usarse despues. Se guarda en la misma tabla que los
-- comparables de los avaluos, con IdAvaluo e IdVersionAvaluo en NULL y la
-- organizacion en IdOrganizacion. Las consultas que unen con el avaluo no los
-- ven; la base del despacho (/comparables, la busqueda y los duplicados) si.
--
-- Es idempotente.

ALTER TABLE "devpware_comparables_avaluos" ADD COLUMN IF NOT EXISTS "IdOrganizacion" INTEGER;
ALTER TABLE "devpware_comparables_avaluos" ALTER COLUMN "IdAvaluo" DROP NOT NULL;
ALTER TABLE "devpware_comparables_avaluos" ALTER COLUMN "IdVersionAvaluo" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_comparables_avaluos_IdOrganizacion_fkey') THEN
    ALTER TABLE "devpware_comparables_avaluos"
      ADD CONSTRAINT "devpware_comparables_avaluos_IdOrganizacion_fkey"
      FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones"("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- O es de un avaluo (con su version) o es de la base de una organizacion.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_comparables_avaluos_destino_check') THEN
    ALTER TABLE "devpware_comparables_avaluos"
      ADD CONSTRAINT "devpware_comparables_avaluos_destino_check"
      CHECK (
        ("IdAvaluo" IS NOT NULL AND "IdVersionAvaluo" IS NOT NULL)
        OR ("IdAvaluo" IS NULL AND "IdVersionAvaluo" IS NULL AND "IdOrganizacion" IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "devpware_comparables_avaluos_IdOrganizacion_idx"
  ON "devpware_comparables_avaluos" ("IdOrganizacion");

-- Fichas de comparables: identificador del despacho y revision por avaluo.
--
-- Cada comparable de la base del despacho lleva un numero propio de la
-- organizacion ("C-00123"). Vive en la propiedad: las copias de una version
-- reabierta, las que se separan al editar y las que se reutilizan desde la
-- busqueda o desde un duplicado conservan el mismo numero; capturar el mismo
-- inmueble "de todos modos" le da uno nuevo. El contador de cada organizacion
-- avanza con cada numero asignado.
--
-- La revision de cada comparable en un avaluo (por revisar, verificado, con
-- observaciones, rechazado; la lista de comprobacion, las notas y quien y
-- cuando lo reviso) es JSON en el comparable del avaluo. No cambia ningun
-- calculo. NULL es "por revisar".
--
-- Las propiedades que ya son comparables reciben su numero en el orden en que
-- se crearon. Es idempotente.

ALTER TABLE "devpware_propiedades" ADD COLUMN IF NOT EXISTS "IFolioComparable" INTEGER;
CREATE INDEX IF NOT EXISTS "devpware_propiedades_IdOrganizacion_IFolioComparable_idx"
  ON "devpware_propiedades" ("IdOrganizacion", "IFolioComparable");

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "IUltimoFolioComparable" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "devpware_comparables_avaluos" ADD COLUMN IF NOT EXISTS "JRevision" JSONB;

WITH "pendientes" AS (
  SELECT p."IdPropiedad", p."IdOrganizacion",
    ROW_NUMBER() OVER (PARTITION BY p."IdOrganizacion" ORDER BY p."IdPropiedad") AS "n"
  FROM "devpware_propiedades" p
  WHERE p."IFolioComparable" IS NULL
    AND EXISTS (SELECT 1 FROM "devpware_comparables_avaluos" c WHERE c."IdPropiedad" = p."IdPropiedad")
),
"maximos" AS (
  SELECT "IdOrganizacion", MAX("IFolioComparable") AS "maximo"
  FROM "devpware_propiedades"
  WHERE "IFolioComparable" IS NOT NULL
  GROUP BY "IdOrganizacion"
)
UPDATE "devpware_propiedades" p
SET "IFolioComparable" = COALESCE(m."maximo", 0) + x."n"
FROM "pendientes" x
LEFT JOIN "maximos" m ON m."IdOrganizacion" = x."IdOrganizacion"
WHERE p."IdPropiedad" = x."IdPropiedad";

UPDATE "devpware_organizaciones" o
SET "IUltimoFolioComparable" = GREATEST(o."IUltimoFolioComparable", f."maximo")
FROM (
  SELECT "IdOrganizacion", MAX("IFolioComparable") AS "maximo"
  FROM "devpware_propiedades"
  WHERE "IFolioComparable" IS NOT NULL
  GROUP BY "IdOrganizacion"
) f
WHERE f."IdOrganizacion" = o."IdOrganizacion";

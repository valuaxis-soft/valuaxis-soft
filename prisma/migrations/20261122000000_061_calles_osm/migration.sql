-- Calles con nombre de México, copiadas de OpenStreetMap (extracto de
-- Geofabrik, licencia ODbL), para las calles resaltadas del croquis y del
-- «Mapa de comparables» (GET /api/mapas/calles, docs/OPERACION.md sección 7).
--
-- Antes cada consulta salía a los espejos públicos de Overpass, que en
-- producción fallaban casi siempre. Ahora la app consulta esta tabla y
-- Overpass queda de respaldo cuando la tabla no tiene calles en la zona.
--
-- Una fila por vía («way») de OpenStreetMap: su id, su nombre, su clase
-- (`highway`) y su trazo. La tabla nace vacía; la llena
-- scripts/ops/importar-calles.ts (pnpm streets:import), que se puede volver a
-- correr para actualizarla. No guarda datos de ningún despacho.
--
-- Solo crea una tabla nueva con su índice; no altera ninguna tabla ni
-- restricción existente. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_calles_osm" (
  "IdViaOsm" BIGINT NOT NULL,
  "SNombre" VARCHAR(255) NOT NULL,
  "STipoVia" VARCHAR(40) NOT NULL,
  "GLinea" geography(LineString,4326) NOT NULL,
  "DFechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_calles_osm_pkey" PRIMARY KEY ("IdViaOsm")
);

-- Las calles alrededor de un punto (ST_DWithin sobre geography).
CREATE INDEX IF NOT EXISTS "devpware_calles_osm_GLinea_gist_idx"
  ON "devpware_calles_osm" USING GIST ("GLinea");

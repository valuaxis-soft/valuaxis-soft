-- Áreas de México copiadas de OpenStreetMap (extracto de Geofabrik, licencia
-- ODbL) para el mapa base del croquis guardado (27 nov 2026): parques,
-- jardines, agua, usos de suelo, terrenos de escuelas y hospitales,
-- edificios, y ríos y arroyos como líneas. El croquis las pinta debajo de las
-- calles con los colores del mapa estándar de OpenStreetMap
-- (src/features/maps/osm-areas.ts, docs/OPERACION.md sección 7).
--
-- Una fila por vía cerrada («way», id `w…`) o multipolígono («relation», id
-- `r…`) de OpenStreetMap: su clase ya traducida (park, water, residential,
-- building, river…), su geometría (polígonos o líneas, en grados WGS84) y su
-- superficie en m² para ordenarlas y omitir lo que no se ve a un zoom. La
-- tabla nace vacía; la llena scripts/ops/importar-areas.ts (pnpm areas:import)
-- y mientras esté vacía el croquis las pide a Overpass. No guarda datos de
-- ningún despacho.
--
-- Solo crea una tabla nueva con su índice; no altera ninguna tabla ni
-- restricción existente. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_areas_osm" (
  "IdElementoOsm" VARCHAR(24) NOT NULL,
  "STipoArea" VARCHAR(20) NOT NULL,
  "GGeometria" geometry(Geometry,4326) NOT NULL,
  "NAreaM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "DFechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_areas_osm_pkey" PRIMARY KEY ("IdElementoOsm")
);

-- Las áreas que cruzan el encuadre de un croquis (operador && sobre geometry).
CREATE INDEX IF NOT EXISTS "devpware_areas_osm_GGeometria_gist_idx"
  ON "devpware_areas_osm" USING GIST ("GGeometria");

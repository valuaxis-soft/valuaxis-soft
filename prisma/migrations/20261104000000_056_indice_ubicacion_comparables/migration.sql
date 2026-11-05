-- Etapa 3 de los mapas: la búsqueda por radio del mapa de comparables usa
-- ST_DWithin sobre las coordenadas que cada captura guarda en
-- "JUbicacionSnapshot" (no hay columna de geometría). Índice GiST sobre la
-- misma expresión que arma la consulta (own-base-sql.ts, COMPARABLE_POINT);
-- las filas sin coordenadas, o con un texto en lugar de un número, dan NULL
-- y no se indexan. No cambia ninguna columna.
CREATE INDEX IF NOT EXISTS "devpware_comparables_avaluos_ubicacion_gist_idx"
  ON "devpware_comparables_avaluos" USING GIST ((
    CASE WHEN (CASE WHEN jsonb_typeof("JUbicacionSnapshot"->'latitude') = 'number' THEN ("JUbicacionSnapshot"->>'latitude')::float8 END) BETWEEN -90 AND 90
      AND (CASE WHEN jsonb_typeof("JUbicacionSnapshot"->'longitude') = 'number' THEN ("JUbicacionSnapshot"->>'longitude')::float8 END) BETWEEN -180 AND 180
      THEN ST_SetSRID(ST_MakePoint(
        (CASE WHEN jsonb_typeof("JUbicacionSnapshot"->'longitude') = 'number' THEN ("JUbicacionSnapshot"->>'longitude')::float8 END),
        (CASE WHEN jsonb_typeof("JUbicacionSnapshot"->'latitude') = 'number' THEN ("JUbicacionSnapshot"->>'latitude')::float8 END)), 4326)::geography END
  ));

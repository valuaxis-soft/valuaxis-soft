-- Diagnóstico de la base de producción. SOLO LECTURA: no modifica nada.
--
-- Responde qué código de compatibilidad sigue haciendo falta y cuánto dato real
-- afectó el bug de tablas vacías. Correr con:
--   psql "$DATABASE_URL" -f scripts/diagnostico-produccion.sql
-- y compartir la salida completa.

BEGIN TRANSACTION READ ONLY;

\echo '== 1. Volumen de datos reales'
SELECT
  (SELECT count(*) FROM devpware_organizaciones WHERE "BActivo" AND "DFechaEliminacion" IS NULL) AS organizaciones,
  (SELECT count(*) FROM devpware_usuarios WHERE "BActivo" AND "DFechaEliminacion" IS NULL) AS usuarios,
  (SELECT count(*) FROM devpware_avaluos WHERE "BActivo" AND "DFechaEliminacion" IS NULL) AS avaluos,
  (SELECT count(*) FROM devpware_avaluos WHERE "BActivo" AND "DFechaEliminacion" IS NULL AND "BBloqueado") AS avaluos_concluidos,
  (SELECT min("DFechaCreacion") FROM devpware_avaluos) AS primer_avaluo,
  (SELECT max("DFechaModificacion") FROM devpware_avaluos) AS ultima_modificacion;

\echo '== 2. Formato de content layout guardado en nodos (v1 = arreglo, v2 = objeto con version 2)'
SELECT
  CASE
    WHEN cl IS NULL OR cl = 'null'::jsonb THEN 'sin layout'
    WHEN jsonb_typeof(cl) = 'array' THEN 'v1'
    WHEN jsonb_typeof(cl) = 'object' THEN 'v' || coalesce(cl->>'version', '?')
    ELSE 'desconocido'
  END AS formato,
  count(*) AS nodos
FROM (
  SELECT coalesce("JConfiguracion"->'contentLayout', "JConfiguracion"->'payload'->'contentLayout') AS cl
  FROM devpware_nodos_documentos
  WHERE "DFechaEliminacion" IS NULL
) x
GROUP BY 1
ORDER BY 1;

\echo '== 3. Formato de block flow guardado en nodos'
SELECT
  CASE
    WHEN bf IS NULL OR bf = 'null'::jsonb THEN 'sin block flow'
    ELSE 'v' || coalesce(bf->>'version', '?')
  END AS formato,
  count(*) AS nodos
FROM (
  SELECT coalesce("JConfiguracion"->'blockFlow', "JConfiguracion"->'payload'->'blockFlow') AS bf
  FROM devpware_nodos_documentos
  WHERE "DFechaEliminacion" IS NULL
) x
GROUP BY 1
ORDER BY 1;

\echo '== 4. Tablas probablemente vaciadas por el bug de guardado (columna sin nombre y sin filas activas)'
SELECT
  count(*) AS tablas_totales,
  count(*) FILTER (WHERE sin_nombre > 0 AND filas_activas = 0) AS tablas_probablemente_vaciadas,
  count(DISTINCT avaluo) FILTER (WHERE sin_nombre > 0 AND filas_activas = 0) AS avaluos_afectados
FROM (
  SELECT
    t."IdTablaDocumento",
    s."IdVersionAvaluo",
    v."IdAvaluo" AS avaluo,
    (SELECT count(*) FROM devpware_columnas_tablas_documentos c
      WHERE c."IdTablaDocumento" = t."IdTablaDocumento" AND btrim(c."SNombre") = '') AS sin_nombre,
    (SELECT count(*) FROM devpware_filas_tablas_documentos f
      WHERE f."IdTablaDocumento" = t."IdTablaDocumento" AND f."BActivo") AS filas_activas
  FROM devpware_tablas_documentos t
  JOIN devpware_nodos_documentos n ON n."IdNodoDocumento" = t."IdNodoDocumento" AND n."DFechaEliminacion" IS NULL
  JOIN devpware_secciones_documentos s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
  JOIN devpware_versiones_avaluos v ON v."IdVersionAvaluo" = s."IdVersionAvaluo"
) x;

\echo '== 5. Celdas con fórmula guardadas (se muestran como texto JSON al recargar)'
SELECT count(*) AS celdas_formula
FROM devpware_celdas_tablas_documentos
WHERE "JValorComplejo" IS NOT NULL;

\echo '== 6. Secciones duplicadas por versión (decide si hace falta scripts/repair-duplicate-valuation-sections.sql)'
SELECT count(*) AS grupos_duplicados, coalesce(sum(n - 1), 0) AS secciones_sobrantes
FROM (
  SELECT "IdVersionAvaluo", upper(regexp_replace("SClave", '[^A-Za-z0-9]', '', 'g')) AS clave, count(*) AS n
  FROM devpware_secciones_documentos
  GROUP BY 1, 2
  HAVING count(*) > 1
) d;

\echo '== 7. Filas por tabla del esquema (las que tienen 0 se pueden eliminar sin perder datos)'
SELECT
  table_name AS tabla,
  (xpath('/row/c/text()',
    query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text::bigint AS filas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name LIKE 'devpware_%'
ORDER BY filas DESC, tabla;

\echo '== 8. Imágenes de terreno guardadas con un id en lugar de la ruta del archivo (se pierden al recargar)'
SELECT count(*) AS imagenes_terreno_sin_ruta
FROM devpware_nodos_documentos n
JOIN devpware_secciones_documentos s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
JOIN devpware_valores_nodos_documentos v ON v."IdNodoDocumento" = n."IdNodoDocumento"
WHERE n."DFechaEliminacion" IS NULL
  AND n."JConfiguracion"->>'kind' = 'image'
  AND upper(regexp_replace(s."SClave", '[^A-Za-z0-9]', '', 'g')) IN ('TERRENO', 'INFOTERRENO')
  AND coalesce(v."SValorTexto", '') <> ''
  AND v."SValorTexto" NOT LIKE '%/%';

\echo '== 9. ¿Existe la restricción que hacía fallar /api/uploads? (si existe, las imágenes fuera de Datos generales no se podían subir)'
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_cargas_archivos_completada_check') AS restriccion_existe,
  (SELECT count(*) FROM devpware_cargas_archivos) AS cargas_registradas,
  (SELECT count(*) FROM devpware_cargas_archivos WHERE "IdArchivo" IS NULL) AS cargas_sin_archivo;

ROLLBACK;

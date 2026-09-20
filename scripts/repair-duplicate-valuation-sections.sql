-- Reparacion idempotente propuesta para secciones documentales duplicadas por alias.
-- NO ejecutar sin respaldo y revision manual del reporte previo.
-- Conserva nodos/valores al mover los nodos de secciones duplicadas a la seccion canonica elegida.

BEGIN;

WITH aliases(alias_compact, canonical_key) AS (
  VALUES
    ('CARATULA', 'CARATULA'),
    ('DATOSGENERALES', 'DATOS_GENERALES'),
    ('ZONA', 'ZONA'),
    ('TERRENO', 'TERRENO'),
    ('CONSTRUCCION', 'CONSTRUCCION'),
    ('CONSIDERACIONES', 'CONSIDERACIONES'),
    ('COSTOS', 'COSTOS'),
    ('MERCADOVENTA', 'MERCADO_VENTA'),
    ('MERCADORENTAS', 'MERCADO_RENTAS'),
    ('INGRESOS', 'INGRESOS'),
    ('FOTOSSUJETO', 'FOTOS_SUJETO'),
    ('CROQUISCOMPARABLES', 'CROQUIS_COMPARABLES'),
    ('HOMOLOGACION', 'HOMOLOGACION'),
    ('INDIRECTOS', 'INDIRECTOS'),
    ('CONCLUSIONES', 'CONCLUSIONES'),
    ('MAPACOMPARABLES', 'MAPA_COMPARABLES'),
    ('INDICADORES', 'MAPA_COMPARABLES')
),
section_scores AS (
  SELECT
    s."IdSeccionDocumento",
    s."IdVersionAvaluo",
    s."SClave",
    a.canonical_key,
    COUNT(DISTINCT n."IdNodoDocumento") AS node_count,
    COUNT(v."IdValorNodoDocumento") AS value_count
  FROM devpware_secciones_documentos s
  JOIN aliases a
    ON upper(regexp_replace(s."SClave", '[^A-Za-z0-9]', '', 'g')) = a.alias_compact
  LEFT JOIN devpware_nodos_documentos n
    ON n."IdSeccionDocumento" = s."IdSeccionDocumento"
   AND n."DFechaEliminacion" IS NULL
  LEFT JOIN devpware_valores_nodos_documentos v
    ON v."IdNodoDocumento" = n."IdNodoDocumento"
  GROUP BY s."IdSeccionDocumento", s."IdVersionAvaluo", s."SClave", a.canonical_key
),
ranked AS (
  SELECT
    *,
    FIRST_VALUE("IdSeccionDocumento") OVER (
      PARTITION BY "IdVersionAvaluo", canonical_key
      ORDER BY value_count DESC, node_count DESC, "IdSeccionDocumento" ASC
    ) AS keeper_id,
    COUNT(*) OVER (PARTITION BY "IdVersionAvaluo", canonical_key) AS duplicate_count
  FROM section_scores
),
duplicates AS (
  SELECT *
  FROM ranked
  WHERE duplicate_count > 1
    AND "IdSeccionDocumento" <> keeper_id
),
moved_nodes AS (
  UPDATE devpware_nodos_documentos n
  SET "IdSeccionDocumento" = d.keeper_id
  FROM duplicates d
  WHERE n."IdSeccionDocumento" = d."IdSeccionDocumento"
  RETURNING n."IdNodoDocumento", d."IdSeccionDocumento" AS duplicate_section_id, d.keeper_id
),
deleted_sections AS (
  DELETE FROM devpware_secciones_documentos s
  USING duplicates d
  WHERE s."IdSeccionDocumento" = d."IdSeccionDocumento"
  RETURNING s."IdSeccionDocumento", s."IdVersionAvaluo", s."SClave"
)
SELECT
  (SELECT COUNT(*) FROM moved_nodes) AS moved_nodes,
  (SELECT COUNT(*) FROM deleted_sections) AS deleted_sections;

COMMIT;

-- Metodos estadisticos como apartado propio (docs/MOTOR-CALCULO.md).
--
-- La regresion lineal multiple y la programacion por metas dejan de ser una
-- parte del enfoque de mercado: cada version guarda, por tipo de comparable,
-- sus propios comparables (pueden ser mas de cien), criterios, codificacion y
-- escalas en JSON, y el valor de referencia de cada metodo. No entra al valor
-- de mercado ni a la conclusion.
--
-- Las regresiones guardadas antes en el mercado (JConfiguracion.regression de
-- devpware_enfoques_mercados) no se migran ni se tocan: la aplicacion las lee
-- en modo compatibilidad hasta que el valuador guarda en el apartado nuevo.
--
-- Solo crea una tabla nueva con sus restricciones propias; no altera tablas ni
-- restricciones existentes. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_metodos_estadisticos" (
  "IdMetodoEstadistico" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "STipoComparable" VARCHAR(40) NOT NULL,
  "JConfiguracion" JSONB NOT NULL,
  "JComparables" JSONB NOT NULL,
  "NValorRegresion" DECIMAL(24, 2),
  "NValorMetas" DECIMAL(24, 2),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_metodos_estadisticos_pkey" PRIMARY KEY ("IdMetodoEstadistico"),
  CONSTRAINT "devpware_metodos_estadisticos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo")
    REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_metodos_estadisticos_IdVersionAvaluo_STipoComparable_key"
  ON "devpware_metodos_estadisticos" ("IdVersionAvaluo", "STipoComparable");
CREATE INDEX IF NOT EXISTS "devpware_metodos_estadisticos_IdVersionAvaluo_idx"
  ON "devpware_metodos_estadisticos" ("IdVersionAvaluo");

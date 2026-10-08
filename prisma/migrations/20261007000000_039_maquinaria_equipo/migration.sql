-- Avaluos de maquinaria y equipo, formato PT-MEH (docs/MOTOR-CALCULO.md).
--
-- 1. Tipo de bien "Maquinaria y equipo": un avaluo de ese tipo captura sus
--    enfoques de costos y de mercado con los paneles de maquinaria.
-- 2. Enfoque de maquinaria de cada version: la captura de costos (bien,
--    cotizacion, gastos, depreciacion y aditamentos) y la de mercado (ofertas)
--    en JSON, y el valor de cada enfoque, que toma la conclusion.
--
-- Es idempotente.

INSERT INTO "devpware_tipos_inmuebles" ("SClave", "SNombre", "SDescripcion", "BPermiteTerreno", "BPermiteConstruccion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('MAQUINARIA_EQUIPO', 'Maquinaria y equipo', NULL, false, false, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO NOTHING;

CREATE TABLE IF NOT EXISTS "devpware_enfoques_maquinaria" (
  "IdEnfoqueMaquinaria" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "JCostos" JSONB,
  "JMercado" JSONB,
  "NValorFisico" DECIMAL(24, 2),
  "NValorMercado" DECIMAL(24, 2),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_enfoques_maquinaria_pkey" PRIMARY KEY ("IdEnfoqueMaquinaria"),
  CONSTRAINT "devpware_enfoques_maquinaria_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_enfoques_maquinaria_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo")
    REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Datos que el motor de calculo necesita guardar (docs/MOTOR-CALCULO.md).
--
-- 1. Factores de homologacion: las calificaciones del sujeto y del comparable
--    que el perito captura ("=1/1.15" en el Excel); el valor sigue en NValor.
-- 2. Enfoque de mercado: potencia n, superficie base (lote tipo o sujeto) y la
--    justificacion del valor adoptado.
-- 3. Ejecuciones de calculo: las del motor son por enfoque y no pertenecen a un
--    nodo ni a una tabla del documento.
--
-- Es idempotente.

ALTER TABLE "devpware_factores_homologacion" ADD COLUMN IF NOT EXISTS "NCalificacionSujeto" DECIMAL(16, 8);
ALTER TABLE "devpware_factores_homologacion" ADD COLUMN IF NOT EXISTS "NCalificacionComparable" DECIMAL(16, 8);

ALTER TABLE "devpware_enfoques_mercados" ADD COLUMN IF NOT EXISTS "NPotenciaSuperficie" DECIMAL(8, 4);
ALTER TABLE "devpware_enfoques_mercados" ADD COLUMN IF NOT EXISTS "NSuperficieBase" DECIMAL(18, 4);
ALTER TABLE "devpware_enfoques_mercados" ADD COLUMN IF NOT EXISTS "SJustificacionValor" VARCHAR(2000);

ALTER TABLE "devpware_ejecuciones_calculos" DROP CONSTRAINT IF EXISTS "devpware_ejecuciones_calculos_contexto_check";
ALTER TABLE "devpware_ejecuciones_calculos" ADD CONSTRAINT "devpware_ejecuciones_calculos_contexto_check"
  CHECK ("IdNodoDocumento" IS NOT NULL OR "IdTablaDocumento" IS NOT NULL OR "SClaveCalculo" LIKE 'MOTOR.%');

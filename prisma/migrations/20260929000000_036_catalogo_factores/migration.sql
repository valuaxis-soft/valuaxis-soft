-- Catalogo de factores de homologacion del despacho: calificaciones por
-- factor y rangos permitidos. Vacio = los valores propuestos por el sistema
-- (src/features/valuations/calculation/factor-catalog.ts).
--
-- Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "JCatalogoFactores" JSONB;

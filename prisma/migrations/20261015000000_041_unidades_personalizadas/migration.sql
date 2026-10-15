-- Unidades personalizadas del despacho.
--
-- En "Formato del valor" el valuador puede escribir una unidad que no esta en
-- la lista (piezas, lotes, cabezas...). Al confirmarla queda guardada en su
-- organizacion y se ofrece en la lista para volver a usarla. Es una lista
-- JSON de textos cortos, sin duplicados; NULL significa que no ha guardado
-- ninguna.
--
-- Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "JUnidadesPersonalizadas" JSONB;

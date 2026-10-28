-- Precision del calculo de cada version del avaluo.
--
-- "Decimales a mostrar" (2 o 4) y "calcular con la precision mostrada" (como
-- la precision de pantalla de Excel): con ella cada factor de homologacion y
-- de demerito se redondea a los decimales que se muestran antes de usarse, y
-- lo impreso cuadra (14,361.99 x 0.97). Se guarda en JSON por version y se
-- copia al reabrir.
--
-- Las versiones que ya existen quedan en NULL: conservan el comportamiento de
-- antes (2 decimales a la vista, calculo con todos los decimales), para no
-- cambiar valores ya emitidos. Los avaluos nuevos nacen con
-- {"decimals": 2, "calculateWithShown": true}.
--
-- Solo agrega una columna que admite NULL; no toca restricciones. Es idempotente.

ALTER TABLE "devpware_versiones_avaluos" ADD COLUMN IF NOT EXISTS "JConfiguracionCalculo" JSONB;

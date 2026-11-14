-- Papelera, revisión e historial de avalúos (AUD-14, 13 nov 2026).
--
-- 1. "DFechaEliminacionDefinitiva": «Eliminar definitivamente» desde la
--    papelera (o la purga a los 30 días). El renglón se conserva por los
--    créditos consumidos y la auditoría, pero ya no aparece en ningún lado ni
--    se puede restaurar. NULL en todos los existentes: nada cambia.
-- 2. "DFechaRevisionAprobada": el revisor aprobó el avalúo «En revisión»
--    (listo para concluir). NULL mientras no se aprueba.
-- 3. Permiso AVALUO_ELIMINAR_DEFINITIVO, solo para ADMINISTRADOR, igual que
--    las migraciones 004 y 028 siembran los suyos (idempotente).
--
-- Solo columnas nuevas y nulas y filas nuevas de catálogo; no cambia ninguna
-- columna, restricción ni regla existente.
ALTER TABLE "devpware_avaluos"
  ADD COLUMN IF NOT EXISTS "DFechaEliminacionDefinitiva" TIMESTAMPTZ(3) NULL;

ALTER TABLE "devpware_avaluos"
  ADD COLUMN IF NOT EXISTS "DFechaRevisionAprobada" TIMESTAMPTZ(3) NULL;

INSERT INTO "devpware_permisos" ("SClave", "SNombre", "SDescripcion", "BActivo", "DFechaCreacion", "DFechaModificacion") VALUES
  ('AVALUO_ELIMINAR_DEFINITIVO', 'Eliminar avaluos definitivamente', 'Permite vaciar avaluos de la papelera sin poder restaurarlos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO NOTHING;

INSERT INTO "devpware_permisos_roles" ("IdRol", "IdPermiso", "DFechaCreacion")
SELECT r."IdRol", p."IdPermiso", CURRENT_TIMESTAMP
FROM "devpware_roles" r
JOIN "devpware_permisos" p ON p."SClave" = 'AVALUO_ELIMINAR_DEFINITIVO'
WHERE r."SClave" = 'ADMINISTRADOR'
ON CONFLICT ("IdRol", "IdPermiso") DO NOTHING;

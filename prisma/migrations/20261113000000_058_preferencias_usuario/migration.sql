-- Preferencias de cada usuario (NP-01, 13 nov 2026): por ahora el intervalo
-- del guardado automático del editor, que el valuador elige en «Mi cuenta».
-- Columna nueva y nula: NULL quiere decir «lo predeterminado» (15 s), así que
-- nada cambia para quien no lo toque. No cambia ninguna columna existente.
ALTER TABLE "devpware_usuarios"
  ADD COLUMN IF NOT EXISTS "JPreferencias" JSONB NULL;

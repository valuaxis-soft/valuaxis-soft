-- Teléfono verificado con un código (SMS o WhatsApp) en «Mi cuenta», para que
-- una persona no abra cuentas falsas y vuelva a usar los avalúos gratuitos.
-- El código lo manda Twilio Verify (docs/OPERACION.md sección 14).
--
-- "STelefono" ya existía (sin verificar). Aquí solo se agregan dos columnas
-- nuevas con valor por omisión, así que ninguna cuenta cambia: todas empiezan
-- con el teléfono sin verificar. No altera ninguna columna ni restricción.
ALTER TABLE "devpware_usuarios"
  ADD COLUMN IF NOT EXISTS "BTelefonoVerificado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "DFechaVerificacionTelefono" TIMESTAMPTZ(3) NULL;

-- Un teléfono verificado pertenece a una sola cuenta. Los no verificados
-- pueden repetirse (capturas viejas, cambios a medio camino). El teléfono se
-- guarda en E.164 (+52…), así que la comparación es exacta.
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_usuarios_STelefono_verificado_key"
  ON "devpware_usuarios" ("STelefono")
  WHERE "BTelefonoVerificado" = true;

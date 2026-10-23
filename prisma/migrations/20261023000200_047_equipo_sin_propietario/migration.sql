-- Un equipo no tiene usuario propietario; tiene fundador.
--
-- Produccion tiene, sin migracion, la regla devpware_organizaciones_ambito_propietario_check:
-- un espacio personal lleva IdUsuarioPropietario y un equipo no. Convertir un espacio
-- personal en equipo conservaba el propietario y la base lo rechazaba ("No se pudo
-- guardar el equipo"). Esta migracion agrega la mitad del equipo de esa regla a las
-- bases que no la tienen (desarrollo y CI), para que las pruebas lo detecten. Donde la
-- regla de produccion ya existe no cambia nada. NOT VALID: no revisa filas viejas de
-- bases de desarrollo, solo las escrituras nuevas. Es idempotente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'devpware_organizaciones'::regclass
      AND conname IN ('devpware_organizaciones_ambito_propietario_check', 'devpware_organizaciones_equipo_sin_propietario_check')
  ) THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_equipo_sin_propietario_check"
      CHECK ("STipoAmbito" <> 'TEAM' OR "IdUsuarioPropietario" IS NULL) NOT VALID;
  END IF;
END $$;

-- Quien convierte su espacio personal en equipo queda como fundador: nadie lo puede
-- dar de baja ni quitarle la administracion, como al propietario de un espacio personal.
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "IdUsuarioFundador" INTEGER;
CREATE INDEX IF NOT EXISTS "devpware_organizaciones_IdUsuarioFundador_idx" ON "devpware_organizaciones" ("IdUsuarioFundador");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'devpware_organizaciones'::regclass AND conname = 'devpware_organizaciones_IdUsuarioFundador_fkey'
  ) THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_IdUsuarioFundador_fkey"
      FOREIGN KEY ("IdUsuarioFundador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

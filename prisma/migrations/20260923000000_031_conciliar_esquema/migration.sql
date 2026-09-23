-- Concilia las migraciones con prisma/schema.prisma.
--
-- La tabla de series de folio y las columnas IdUsuarioPropietario y STipoAmbito de
-- organizaciones se agregaron en produccion sin migracion; una base creada desde cero
-- no las tenia y el registro de usuarios y el folio fallaban. Tambien crea los indices
-- que el esquema declara y ninguna migracion creaba.
--
-- Es idempotente: en produccion, donde ya existen, no cambia nada.

CREATE TABLE IF NOT EXISTS "devpware_series_folios_organizaciones" (
    "IdSerieFolioOrganizacion" SERIAL NOT NULL,
    "IdOrganizacion" INTEGER NOT NULL,
    "SPrefijo" VARCHAR(20) NOT NULL DEFAULT 'VLO',
    "IUltimoConsecutivo" INTEGER NOT NULL DEFAULT 0,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_series_folios_organizaciones_pkey" PRIMARY KEY ("IdSerieFolioOrganizacion")
);

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "IdUsuarioPropietario" INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devpware_organizaciones' AND column_name = 'STipoAmbito'
  ) THEN
    -- Las organizaciones existentes antes de esta columna eran espacios personales.
    ALTER TABLE "devpware_organizaciones" ADD COLUMN "STipoAmbito" VARCHAR(20) NOT NULL DEFAULT 'PERSONAL';
    ALTER TABLE "devpware_organizaciones" ALTER COLUMN "STipoAmbito" DROP DEFAULT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "devpware_series_folios_organizaciones_IdOrganizacion_idx" ON "devpware_series_folios_organizaciones"("IdOrganizacion");
CREATE INDEX IF NOT EXISTS "devpware_series_folios_organizaciones_BActivo_idx" ON "devpware_series_folios_organizaciones"("BActivo");
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_series_folios_organizaciones_org_prefijo_key" ON "devpware_series_folios_organizaciones"("IdOrganizacion", "SPrefijo");
CREATE INDEX IF NOT EXISTS "devpware_concesiones_funcionalidades_IdOrganizacion_idx" ON "devpware_concesiones_funcionalidades"("IdOrganizacion");
CREATE INDEX IF NOT EXISTS "devpware_concesiones_funcionalidades_IdFuncionalidad_idx" ON "devpware_concesiones_funcionalidades"("IdFuncionalidad");
CREATE INDEX IF NOT EXISTS "devpware_concesiones_funcionalidades_BActiva_idx" ON "devpware_concesiones_funcionalidades"("BActiva");
CREATE INDEX IF NOT EXISTS "devpware_funcionalidades_IdTipoFuncionalidad_idx" ON "devpware_funcionalidades"("IdTipoFuncionalidad");
CREATE INDEX IF NOT EXISTS "devpware_funcionalidades_BActivo_idx" ON "devpware_funcionalidades"("BActivo");
CREATE INDEX IF NOT EXISTS "devpware_funcionalidades_planes_IdPlan_idx" ON "devpware_funcionalidades_planes"("IdPlan");
CREATE INDEX IF NOT EXISTS "devpware_funcionalidades_planes_IdFuncionalidad_idx" ON "devpware_funcionalidades_planes"("IdFuncionalidad");
CREATE INDEX IF NOT EXISTS "devpware_identidades_usuarios_IdUsuario_idx" ON "devpware_identidades_usuarios"("IdUsuario");
CREATE INDEX IF NOT EXISTS "devpware_identidades_usuarios_IdProveedorIdentidad_idx" ON "devpware_identidades_usuarios"("IdProveedorIdentidad");
CREATE INDEX IF NOT EXISTS "devpware_identidades_usuarios_BActiva_idx" ON "devpware_identidades_usuarios"("BActiva");
CREATE INDEX IF NOT EXISTS "devpware_organizaciones_IdUsuarioPropietario_idx" ON "devpware_organizaciones"("IdUsuarioPropietario");
CREATE INDEX IF NOT EXISTS "devpware_organizaciones_STipoAmbito_idx" ON "devpware_organizaciones"("STipoAmbito");
CREATE INDEX IF NOT EXISTS "devpware_planes_BActivo_idx" ON "devpware_planes"("BActivo");
CREATE INDEX IF NOT EXISTS "devpware_planes_DFechaEliminacion_idx" ON "devpware_planes"("DFechaEliminacion");
CREATE INDEX IF NOT EXISTS "devpware_precios_planes_IdPlan_idx" ON "devpware_precios_planes"("IdPlan");
CREATE INDEX IF NOT EXISTS "devpware_precios_planes_BActivo_idx" ON "devpware_precios_planes"("BActivo");
CREATE INDEX IF NOT EXISTS "devpware_solicitudes_oauth_IdProveedorIdentidad_idx" ON "devpware_solicitudes_oauth"("IdProveedorIdentidad");
CREATE INDEX IF NOT EXISTS "devpware_solicitudes_oauth_IdUsuario_idx" ON "devpware_solicitudes_oauth"("IdUsuario");
CREATE INDEX IF NOT EXISTS "devpware_solicitudes_oauth_DFechaExpiracion_idx" ON "devpware_solicitudes_oauth"("DFechaExpiracion");
CREATE INDEX IF NOT EXISTS "devpware_suscripciones_IdOrganizacion_idx" ON "devpware_suscripciones"("IdOrganizacion");
CREATE INDEX IF NOT EXISTS "devpware_suscripciones_IdPlan_idx" ON "devpware_suscripciones"("IdPlan");
CREATE INDEX IF NOT EXISTS "devpware_suscripciones_IdEstadoSuscripcion_idx" ON "devpware_suscripciones"("IdEstadoSuscripcion");
CREATE INDEX IF NOT EXISTS "devpware_suscripciones_DFechaFinalizacion_idx" ON "devpware_suscripciones"("DFechaFinalizacion");
CREATE INDEX IF NOT EXISTS "devpware_tokens_recuperaciones_contrasenas_IdUsuario_idx" ON "devpware_tokens_recuperaciones_contrasenas"("IdUsuario");
CREATE INDEX IF NOT EXISTS "devpware_tokens_recuperaciones_contrasenas_DFechaExpiracion_idx" ON "devpware_tokens_recuperaciones_contrasenas"("DFechaExpiracion");
CREATE INDEX IF NOT EXISTS "devpware_tokens_verificacion_correos_IdUsuario_idx" ON "devpware_tokens_verificacion_correos"("IdUsuario");
CREATE INDEX IF NOT EXISTS "devpware_tokens_verificacion_correos_DFechaExpiracion_idx" ON "devpware_tokens_verificacion_correos"("DFechaExpiracion");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_organizaciones_IdUsuarioPropietario_fkey') THEN
    ALTER TABLE "devpware_organizaciones"
      ADD CONSTRAINT "devpware_organizaciones_IdUsuarioPropietario_fkey"
      FOREIGN KEY ("IdUsuarioPropietario") REFERENCES "devpware_usuarios"("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_series_folios_organizaciones_IdOrganizacion_fkey') THEN
    ALTER TABLE "devpware_series_folios_organizaciones"
      ADD CONSTRAINT "devpware_series_folios_organizaciones_IdOrganizacion_fkey"
      FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones"("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

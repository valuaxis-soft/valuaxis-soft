-- Migracion 008_campos_personalizados
-- Campos personalizados por organizacion y valores por version de avaluo.
-- La consistencia entre "IdAvaluo" e "IdVersionAvaluo" en valores se valida en backend mediante transaccion.

CREATE TABLE "devpware_campos_personalizados" (
    "IdCampoPersonalizado" SERIAL NOT NULL,
    "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
    "IdOrganizacion" INTEGER NOT NULL,
    "IdTipoDato" INTEGER NOT NULL,
    "SClave" VARCHAR(120) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "SSeccionSugerida" VARCHAR(120),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BObligatorio" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "JValidaciones" JSONB,
    "JConfiguracion" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_campos_personalizados_pkey" PRIMARY KEY ("IdCampoPersonalizado"),
    CONSTRAINT "devpware_campos_personalizados_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
    CONSTRAINT "devpware_campos_personalizados_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_campos_personalizados_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_campos_personalizados_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_campos_personalizados_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_campos_personalizados_IdTipoDato_fkey" FOREIGN KEY ("IdTipoDato") REFERENCES "devpware_tipos_datos" ("IdTipoDato") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_campos_personalizados_IdOrganizacion_SClave_key" ON "devpware_campos_personalizados" ("IdOrganizacion", "SClave") WHERE "DFechaEliminacion" IS NULL;
CREATE INDEX "devpware_campos_personalizados_IdOrganizacion_idx" ON "devpware_campos_personalizados" ("IdOrganizacion");
CREATE INDEX "devpware_campos_personalizados_IdTipoDato_idx" ON "devpware_campos_personalizados" ("IdTipoDato");
CREATE INDEX "devpware_campos_personalizados_BActivo_idx" ON "devpware_campos_personalizados" ("BActivo");
CREATE INDEX "devpware_campos_personalizados_IOrden_idx" ON "devpware_campos_personalizados" ("IOrden");
CREATE INDEX "devpware_campos_personalizados_DFechaEliminacion_idx" ON "devpware_campos_personalizados" ("DFechaEliminacion");

CREATE TABLE "devpware_opciones_campos_personalizados" (
    "IdOpcionCampoPersonalizado" SERIAL NOT NULL,
    "IdCampoPersonalizado" INTEGER NOT NULL,
    "SClave" VARCHAR(100) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_opciones_campos_personalizados_pkey" PRIMARY KEY ("IdOpcionCampoPersonalizado"),
    CONSTRAINT "devpware_opciones_campos_personalizados_IdCampoPersonalizado_SClave_key" UNIQUE ("IdCampoPersonalizado", "SClave"),
    CONSTRAINT "devpware_opciones_campos_personalizados_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_opciones_campos_personalizados_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_opciones_campos_personalizados_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_opciones_campos_personalizados_IdCampoPersonalizado_fkey" FOREIGN KEY ("IdCampoPersonalizado") REFERENCES "devpware_campos_personalizados" ("IdCampoPersonalizado") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_opciones_campos_personalizados_IdCampoPersonalizado_idx" ON "devpware_opciones_campos_personalizados" ("IdCampoPersonalizado");
CREATE INDEX "devpware_opciones_campos_personalizados_BActivo_idx" ON "devpware_opciones_campos_personalizados" ("BActivo");
CREATE INDEX "devpware_opciones_campos_personalizados_IOrden_idx" ON "devpware_opciones_campos_personalizados" ("IOrden");

CREATE TABLE "devpware_valores_campos_personalizados" (
    "IdValorCampoPersonalizado" BIGSERIAL NOT NULL,
    "IdCampoPersonalizado" INTEGER NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdVersionAvaluo" INTEGER NOT NULL,
    "IdOrigenDato" INTEGER NOT NULL,
    "SValorTexto" TEXT,
    "NValorNumerico" NUMERIC(24,8),
    "BValorBooleano" BOOLEAN,
    "DValorFecha" TIMESTAMPTZ(3),
    "JValorComplejo" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_valores_campos_personalizados_pkey" PRIMARY KEY ("IdValorCampoPersonalizado"),
    CONSTRAINT "devpware_valores_campos_personalizados_IdCampoPersonalizado_IdVersionAvaluo_key" UNIQUE ("IdCampoPersonalizado", "IdVersionAvaluo"),
    CONSTRAINT "devpware_valores_campos_personalizados_un_valor_check" CHECK ((
        CASE WHEN "SValorTexto" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "NValorNumerico" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "BValorBooleano" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "DValorFecha" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "JValorComplejo" IS NOT NULL THEN 1 ELSE 0 END
    ) <= 1),
    CONSTRAINT "devpware_valores_campos_personalizados_IdCampoPersonalizado_fkey" FOREIGN KEY ("IdCampoPersonalizado") REFERENCES "devpware_campos_personalizados" ("IdCampoPersonalizado") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_campos_personalizados_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_campos_personalizados_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_campos_personalizados_IdOrigenDato_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_valores_campos_personalizados_IdCampoPersonalizado_idx" ON "devpware_valores_campos_personalizados" ("IdCampoPersonalizado");
CREATE INDEX "devpware_valores_campos_personalizados_IdAvaluo_idx" ON "devpware_valores_campos_personalizados" ("IdAvaluo");
CREATE INDEX "devpware_valores_campos_personalizados_IdVersionAvaluo_idx" ON "devpware_valores_campos_personalizados" ("IdVersionAvaluo");
CREATE INDEX "devpware_valores_campos_personalizados_IdOrigenDato_idx" ON "devpware_valores_campos_personalizados" ("IdOrigenDato");
CREATE INDEX "devpware_valores_campos_personalizados_DFechaModificacion_idx" ON "devpware_valores_campos_personalizados" ("DFechaModificacion");

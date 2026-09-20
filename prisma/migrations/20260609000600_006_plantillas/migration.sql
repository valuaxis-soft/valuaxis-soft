-- Migracion 006_plantillas
-- Plantillas de avaluos y estructura base de versiones.

CREATE TABLE "devpware_plantillas_avaluos" (
    "IdPlantillaAvaluo" SERIAL NOT NULL,
    "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
    "IdOrganizacion" INTEGER,
    "IdTipoAvaluo" INTEGER NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "BEsSistema" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "INumeroVersionActual" INTEGER NOT NULL DEFAULT 1,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_plantillas_avaluos_pkey" PRIMARY KEY ("IdPlantillaAvaluo"),
    CONSTRAINT "devpware_plantillas_avaluos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
    CONSTRAINT "devpware_plantillas_avaluos_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_plantillas_avaluos_INumeroVersionActual_check" CHECK ("INumeroVersionActual" >= 1),
    CONSTRAINT "devpware_plantillas_avaluos_sistema_check" CHECK (("BEsSistema" = false) OR ("IdOrganizacion" IS NULL)),
    CONSTRAINT "devpware_plantillas_avaluos_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_plantillas_avaluos_IdTipoAvaluo_fkey" FOREIGN KEY ("IdTipoAvaluo") REFERENCES "devpware_tipos_avaluos" ("IdTipoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_plantillas_avaluos_org_nombre_key" ON "devpware_plantillas_avaluos" ("IdOrganizacion", "SNombre") WHERE "DFechaEliminacion" IS NULL AND "IdOrganizacion" IS NOT NULL;
CREATE UNIQUE INDEX "devpware_plantillas_avaluos_sistema_nombre_key" ON "devpware_plantillas_avaluos" ("SNombre") WHERE "DFechaEliminacion" IS NULL AND "IdOrganizacion" IS NULL AND "BEsSistema" = true;
CREATE INDEX "devpware_plantillas_avaluos_IdOrganizacion_idx" ON "devpware_plantillas_avaluos" ("IdOrganizacion");
CREATE INDEX "devpware_plantillas_avaluos_IdTipoAvaluo_idx" ON "devpware_plantillas_avaluos" ("IdTipoAvaluo");
CREATE INDEX "devpware_plantillas_avaluos_BEsSistema_idx" ON "devpware_plantillas_avaluos" ("BEsSistema");
CREATE INDEX "devpware_plantillas_avaluos_BActivo_idx" ON "devpware_plantillas_avaluos" ("BActivo");
CREATE INDEX "devpware_plantillas_avaluos_DFechaEliminacion_idx" ON "devpware_plantillas_avaluos" ("DFechaEliminacion");

CREATE TABLE "devpware_versiones_plantillas" (
    "IdVersionPlantilla" SERIAL NOT NULL,
    "IdPlantillaAvaluo" INTEGER NOT NULL,
    "IdUsuarioCreador" INTEGER NOT NULL,
    "INumeroVersion" INTEGER NOT NULL,
    "SPublicacion" VARCHAR(120),
    "JConfiguracionGeneral" JSONB,
    "BPublicada" BOOLEAN NOT NULL DEFAULT false,
    "BActiva" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaPublicacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_versiones_plantillas_pkey" PRIMARY KEY ("IdVersionPlantilla"),
    CONSTRAINT "devpware_versiones_plantillas_IdPlantillaAvaluo_INumeroVersion_key" UNIQUE ("IdPlantillaAvaluo", "INumeroVersion"),
    CONSTRAINT "devpware_versiones_plantillas_INumeroVersion_check" CHECK ("INumeroVersion" >= 1),
    CONSTRAINT "devpware_versiones_plantillas_publicacion_check" CHECK (("BPublicada" = false) OR ("DFechaPublicacion" IS NOT NULL)),
    CONSTRAINT "devpware_versiones_plantillas_IdPlantillaAvaluo_fkey" FOREIGN KEY ("IdPlantillaAvaluo") REFERENCES "devpware_plantillas_avaluos" ("IdPlantillaAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_versiones_plantillas_IdUsuarioCreador_fkey" FOREIGN KEY ("IdUsuarioCreador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_versiones_plantillas_IdPlantillaAvaluo_idx" ON "devpware_versiones_plantillas" ("IdPlantillaAvaluo");
CREATE INDEX "devpware_versiones_plantillas_IdUsuarioCreador_idx" ON "devpware_versiones_plantillas" ("IdUsuarioCreador");
CREATE INDEX "devpware_versiones_plantillas_BPublicada_idx" ON "devpware_versiones_plantillas" ("BPublicada");
CREATE INDEX "devpware_versiones_plantillas_BActiva_idx" ON "devpware_versiones_plantillas" ("BActiva");

CREATE TABLE "devpware_secciones_plantillas" (
    "IdSeccionPlantilla" SERIAL NOT NULL,
    "IdVersionPlantilla" INTEGER NOT NULL,
    "SClave" VARCHAR(100) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BVisible" BOOLEAN NOT NULL DEFAULT true,
    "BObligatoria" BOOLEAN NOT NULL DEFAULT false,
    "BEliminable" BOOLEAN NOT NULL DEFAULT true,
    "BRepetible" BOOLEAN NOT NULL DEFAULT false,
    "JConfiguracion" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_secciones_plantillas_pkey" PRIMARY KEY ("IdSeccionPlantilla"),
    CONSTRAINT "devpware_secciones_plantillas_IdVersionPlantilla_SClave_key" UNIQUE ("IdVersionPlantilla", "SClave"),
    CONSTRAINT "devpware_secciones_plantillas_IdVersionPlantilla_IOrden_key" UNIQUE ("IdVersionPlantilla", "IOrden"),
    CONSTRAINT "devpware_secciones_plantillas_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_secciones_plantillas_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_secciones_plantillas_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_secciones_plantillas_IdVersionPlantilla_fkey" FOREIGN KEY ("IdVersionPlantilla") REFERENCES "devpware_versiones_plantillas" ("IdVersionPlantilla") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_secciones_plantillas_IdVersionPlantilla_idx" ON "devpware_secciones_plantillas" ("IdVersionPlantilla");
CREATE INDEX "devpware_secciones_plantillas_BVisible_idx" ON "devpware_secciones_plantillas" ("BVisible");
CREATE INDEX "devpware_secciones_plantillas_IOrden_idx" ON "devpware_secciones_plantillas" ("IOrden");

CREATE TABLE "devpware_nodos_plantillas" (
    "IdNodoPlantilla" SERIAL NOT NULL,
    "IdSeccionPlantilla" INTEGER NOT NULL,
    "IdNodoPadre" INTEGER,
    "IdTipoNodoDocumento" INTEGER NOT NULL,
    "IdTipoDato" INTEGER,
    "SClave" VARCHAR(120) NOT NULL,
    "STitulo" VARCHAR(250) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BVisible" BOOLEAN NOT NULL DEFAULT true,
    "BObligatorio" BOOLEAN NOT NULL DEFAULT false,
    "BEliminable" BOOLEAN NOT NULL DEFAULT true,
    "BRepetible" BOOLEAN NOT NULL DEFAULT false,
    "JConfiguracion" JSONB,
    "JValorPredeterminado" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_nodos_plantillas_pkey" PRIMARY KEY ("IdNodoPlantilla"),
    CONSTRAINT "devpware_nodos_plantillas_IdSeccionPlantilla_SClave_key" UNIQUE ("IdSeccionPlantilla", "SClave"),
    CONSTRAINT "devpware_nodos_plantillas_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_nodos_plantillas_STitulo_check" CHECK (btrim("STitulo") <> ''),
    CONSTRAINT "devpware_nodos_plantillas_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_nodos_plantillas_padre_check" CHECK ("IdNodoPadre" IS NULL OR "IdNodoPadre" <> "IdNodoPlantilla"),
    CONSTRAINT "devpware_nodos_plantillas_IdSeccionPlantilla_fkey" FOREIGN KEY ("IdSeccionPlantilla") REFERENCES "devpware_secciones_plantillas" ("IdSeccionPlantilla") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_plantillas_IdNodoPadre_fkey" FOREIGN KEY ("IdNodoPadre") REFERENCES "devpware_nodos_plantillas" ("IdNodoPlantilla") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_plantillas_IdTipoNodoDocumento_fkey" FOREIGN KEY ("IdTipoNodoDocumento") REFERENCES "devpware_tipos_nodos_documentos" ("IdTipoNodoDocumento") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_plantillas_IdTipoDato_fkey" FOREIGN KEY ("IdTipoDato") REFERENCES "devpware_tipos_datos" ("IdTipoDato") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_nodos_plantillas_IdSeccionPlantilla_idx" ON "devpware_nodos_plantillas" ("IdSeccionPlantilla");
CREATE INDEX "devpware_nodos_plantillas_IdNodoPadre_idx" ON "devpware_nodos_plantillas" ("IdNodoPadre");
CREATE INDEX "devpware_nodos_plantillas_IdTipoNodoDocumento_idx" ON "devpware_nodos_plantillas" ("IdTipoNodoDocumento");
CREATE INDEX "devpware_nodos_plantillas_IdTipoDato_idx" ON "devpware_nodos_plantillas" ("IdTipoDato");
CREATE INDEX "devpware_nodos_plantillas_IOrden_idx" ON "devpware_nodos_plantillas" ("IOrden");
CREATE INDEX "devpware_nodos_plantillas_BVisible_idx" ON "devpware_nodos_plantillas" ("BVisible");

ALTER TABLE "devpware_avaluos"
    ADD COLUMN "IdPlantillaAvaluo" INTEGER;

ALTER TABLE "devpware_avaluos"
    ADD CONSTRAINT "devpware_avaluos_IdPlantillaAvaluo_fkey" FOREIGN KEY ("IdPlantillaAvaluo") REFERENCES "devpware_plantillas_avaluos" ("IdPlantillaAvaluo") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "devpware_avaluos_IdPlantillaAvaluo_idx" ON "devpware_avaluos" ("IdPlantillaAvaluo");

INSERT INTO "devpware_plantillas_avaluos" (
    "IdOrganizacion",
    "IdTipoAvaluo",
    "SNombre",
    "SDescripcion",
    "BEsSistema",
    "BActivo",
    "INumeroVersionActual",
    "DFechaCreacion",
    "DFechaModificacion"
)
SELECT
    NULL,
    tipo_avaluo."IdTipoAvaluo",
    'Plantilla general de avaluo',
    'Plantilla base del sistema para la creacion inicial de avaluos.',
    true,
    true,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "devpware_tipos_avaluos" tipo_avaluo
WHERE tipo_avaluo."SClave" = 'COMERCIAL'
ON CONFLICT ("SNombre") WHERE "DFechaEliminacion" IS NULL AND "IdOrganizacion" IS NULL AND "BEsSistema" = true
DO UPDATE SET
    "IdTipoAvaluo" = EXCLUDED."IdTipoAvaluo",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BEsSistema" = EXCLUDED."BEsSistema",
    "BActivo" = EXCLUDED."BActivo",
    "INumeroVersionActual" = EXCLUDED."INumeroVersionActual",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

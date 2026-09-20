-- Migracion 007_documentos_dinamicos
-- Secciones, nodos y valores capturados por version de avaluo.

CREATE TABLE "devpware_secciones_documentos" (
    "IdSeccionDocumento" SERIAL NOT NULL,
    "IdVersionAvaluo" INTEGER NOT NULL,
    "IdSeccionPlantilla" INTEGER,
    "SClave" VARCHAR(120) NOT NULL,
    "SNombre" VARCHAR(220) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BVisible" BOOLEAN NOT NULL DEFAULT true,
    "BObligatoria" BOOLEAN NOT NULL DEFAULT false,
    "BEliminable" BOOLEAN NOT NULL DEFAULT true,
    "JConfiguracion" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_secciones_documentos_pkey" PRIMARY KEY ("IdSeccionDocumento"),
    CONSTRAINT "devpware_secciones_documentos_IdVersionAvaluo_SClave_key" UNIQUE ("IdVersionAvaluo", "SClave"),
    CONSTRAINT "devpware_secciones_documentos_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_secciones_documentos_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_secciones_documentos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_secciones_documentos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_secciones_documentos_IdSeccionPlantilla_fkey" FOREIGN KEY ("IdSeccionPlantilla") REFERENCES "devpware_secciones_plantillas" ("IdSeccionPlantilla") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_secciones_documentos_IdVersionAvaluo_idx" ON "devpware_secciones_documentos" ("IdVersionAvaluo");
CREATE INDEX "devpware_secciones_documentos_IdSeccionPlantilla_idx" ON "devpware_secciones_documentos" ("IdSeccionPlantilla");
CREATE INDEX "devpware_secciones_documentos_IOrden_idx" ON "devpware_secciones_documentos" ("IOrden");
CREATE INDEX "devpware_secciones_documentos_BVisible_idx" ON "devpware_secciones_documentos" ("BVisible");

CREATE TABLE "devpware_nodos_documentos" (
    "IdNodoDocumento" SERIAL NOT NULL,
    "IdSeccionDocumento" INTEGER NOT NULL,
    "IdNodoPadre" INTEGER,
    "IdNodoPlantilla" INTEGER,
    "IdTipoNodoDocumento" INTEGER NOT NULL,
    "IdTipoDato" INTEGER,
    "SClave" VARCHAR(140) NOT NULL,
    "STitulo" VARCHAR(250) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BVisible" BOOLEAN NOT NULL DEFAULT true,
    "BObligatorio" BOOLEAN NOT NULL DEFAULT false,
    "BEliminable" BOOLEAN NOT NULL DEFAULT true,
    "BRepetible" BOOLEAN NOT NULL DEFAULT false,
    "JConfiguracion" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_nodos_documentos_pkey" PRIMARY KEY ("IdNodoDocumento"),
    CONSTRAINT "devpware_nodos_documentos_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_nodos_documentos_STitulo_check" CHECK (btrim("STitulo") <> ''),
    CONSTRAINT "devpware_nodos_documentos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_nodos_documentos_padre_check" CHECK ("IdNodoPadre" IS NULL OR "IdNodoPadre" <> "IdNodoDocumento"),
    CONSTRAINT "devpware_nodos_documentos_IdSeccionDocumento_fkey" FOREIGN KEY ("IdSeccionDocumento") REFERENCES "devpware_secciones_documentos" ("IdSeccionDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_documentos_IdNodoPadre_fkey" FOREIGN KEY ("IdNodoPadre") REFERENCES "devpware_nodos_documentos" ("IdNodoDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_documentos_IdNodoPlantilla_fkey" FOREIGN KEY ("IdNodoPlantilla") REFERENCES "devpware_nodos_plantillas" ("IdNodoPlantilla") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_documentos_IdTipoNodoDocumento_fkey" FOREIGN KEY ("IdTipoNodoDocumento") REFERENCES "devpware_tipos_nodos_documentos" ("IdTipoNodoDocumento") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_nodos_documentos_IdTipoDato_fkey" FOREIGN KEY ("IdTipoDato") REFERENCES "devpware_tipos_datos" ("IdTipoDato") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_nodos_documentos_IdSeccionDocumento_SClave_key" ON "devpware_nodos_documentos" ("IdSeccionDocumento", "SClave") WHERE "DFechaEliminacion" IS NULL;
CREATE INDEX "devpware_nodos_documentos_IdSeccionDocumento_idx" ON "devpware_nodos_documentos" ("IdSeccionDocumento");
CREATE INDEX "devpware_nodos_documentos_IdNodoPadre_idx" ON "devpware_nodos_documentos" ("IdNodoPadre");
CREATE INDEX "devpware_nodos_documentos_IdNodoPlantilla_idx" ON "devpware_nodos_documentos" ("IdNodoPlantilla");
CREATE INDEX "devpware_nodos_documentos_IdTipoNodoDocumento_idx" ON "devpware_nodos_documentos" ("IdTipoNodoDocumento");
CREATE INDEX "devpware_nodos_documentos_IdTipoDato_idx" ON "devpware_nodos_documentos" ("IdTipoDato");
CREATE INDEX "devpware_nodos_documentos_IOrden_idx" ON "devpware_nodos_documentos" ("IOrden");
CREATE INDEX "devpware_nodos_documentos_BVisible_idx" ON "devpware_nodos_documentos" ("BVisible");
CREATE INDEX "devpware_nodos_documentos_DFechaEliminacion_idx" ON "devpware_nodos_documentos" ("DFechaEliminacion");

CREATE TABLE "devpware_valores_nodos_documentos" (
    "IdValorNodoDocumento" BIGSERIAL NOT NULL,
    "IdNodoDocumento" INTEGER NOT NULL,
    "IdVersionAvaluo" INTEGER NOT NULL,
    "IdTipoDato" INTEGER NOT NULL,
    "IdOrigenDato" INTEGER NOT NULL,
    "SValorTexto" TEXT,
    "NValorNumerico" NUMERIC(24,8),
    "BValorBooleano" BOOLEAN,
    "DValorFecha" TIMESTAMPTZ(3),
    "JValorComplejo" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_valores_nodos_documentos_pkey" PRIMARY KEY ("IdValorNodoDocumento"),
    CONSTRAINT "devpware_valores_nodos_documentos_IdNodoDocumento_IdVersionAvaluo_key" UNIQUE ("IdNodoDocumento", "IdVersionAvaluo"),
    CONSTRAINT "devpware_valores_nodos_documentos_un_valor_check" CHECK ((
        CASE WHEN "SValorTexto" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "NValorNumerico" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "BValorBooleano" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "DValorFecha" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "JValorComplejo" IS NOT NULL THEN 1 ELSE 0 END
    ) <= 1),
    CONSTRAINT "devpware_valores_nodos_documentos_IdNodoDocumento_fkey" FOREIGN KEY ("IdNodoDocumento") REFERENCES "devpware_nodos_documentos" ("IdNodoDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_nodos_documentos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_nodos_documentos_IdTipoDato_fkey" FOREIGN KEY ("IdTipoDato") REFERENCES "devpware_tipos_datos" ("IdTipoDato") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_valores_nodos_documentos_IdOrigenDato_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_valores_nodos_documentos_IdNodoDocumento_idx" ON "devpware_valores_nodos_documentos" ("IdNodoDocumento");
CREATE INDEX "devpware_valores_nodos_documentos_IdVersionAvaluo_idx" ON "devpware_valores_nodos_documentos" ("IdVersionAvaluo");
CREATE INDEX "devpware_valores_nodos_documentos_IdTipoDato_idx" ON "devpware_valores_nodos_documentos" ("IdTipoDato");
CREATE INDEX "devpware_valores_nodos_documentos_IdOrigenDato_idx" ON "devpware_valores_nodos_documentos" ("IdOrigenDato");
CREATE INDEX "devpware_valores_nodos_documentos_DFechaModificacion_idx" ON "devpware_valores_nodos_documentos" ("DFechaModificacion");

ALTER TABLE "devpware_avaluos"
    ADD COLUMN "IdVersionTrabajo" INTEGER,
    ADD COLUMN "IdVersionFinal" INTEGER;

ALTER TABLE "devpware_avaluos"
    ADD CONSTRAINT "devpware_avaluos_IdVersionTrabajo_fkey" FOREIGN KEY ("IdVersionTrabajo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "devpware_avaluos_IdVersionFinal_fkey" FOREIGN KEY ("IdVersionFinal") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "devpware_avaluos_IdVersionTrabajo_idx" ON "devpware_avaluos" ("IdVersionTrabajo");
CREATE INDEX "devpware_avaluos_IdVersionFinal_idx" ON "devpware_avaluos" ("IdVersionFinal");
CREATE UNIQUE INDEX "devpware_avaluos_IdVersionTrabajo_key" ON "devpware_avaluos" ("IdVersionTrabajo") WHERE "IdVersionTrabajo" IS NOT NULL;
CREATE UNIQUE INDEX "devpware_avaluos_IdVersionFinal_key" ON "devpware_avaluos" ("IdVersionFinal") WHERE "IdVersionFinal" IS NOT NULL;

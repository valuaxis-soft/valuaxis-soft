-- Migracion 002_catalogos_estructurales
-- Catalogos estructurales iniciales para PostgreSQL.

CREATE TABLE "devpware_estados_organizaciones" (
    "IdEstadoOrganizacion" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BPermiteOperacion" BOOLEAN NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_estados_organizaciones_pkey" PRIMARY KEY ("IdEstadoOrganizacion"),
    CONSTRAINT "devpware_estados_organizaciones_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_estados_organizaciones_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_estados_usuarios" (
    "IdEstadoUsuario" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BPermiteAcceso" BOOLEAN NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_estados_usuarios_pkey" PRIMARY KEY ("IdEstadoUsuario"),
    CONSTRAINT "devpware_estados_usuarios_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_estados_usuarios_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_estados_avaluos" (
    "IdEstadoAvaluo" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BEsInicial" BOOLEAN NOT NULL,
    "BEsFinal" BOOLEAN NOT NULL,
    "BPermiteEdicion" BOOLEAN NOT NULL,
    "BBloqueaAvaluo" BOOLEAN NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_estados_avaluos_pkey" PRIMARY KEY ("IdEstadoAvaluo"),
    CONSTRAINT "devpware_estados_avaluos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_estados_avaluos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_estados_versiones_avaluos" (
    "IdEstadoVersionAvaluo" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BPermiteEdicion" BOOLEAN NOT NULL,
    "BEsFinal" BOOLEAN NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_estados_versiones_avaluos_pkey" PRIMARY KEY ("IdEstadoVersionAvaluo"),
    CONSTRAINT "devpware_estados_versiones_avaluos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_estados_versiones_avaluos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_avaluos" (
    "IdTipoAvaluo" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_avaluos_pkey" PRIMARY KEY ("IdTipoAvaluo"),
    CONSTRAINT "devpware_tipos_avaluos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_avaluos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_inmuebles" (
    "IdTipoInmueble" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BPermiteTerreno" BOOLEAN NOT NULL,
    "BPermiteConstruccion" BOOLEAN NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_inmuebles_pkey" PRIMARY KEY ("IdTipoInmueble"),
    CONSTRAINT "devpware_tipos_inmuebles_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_inmuebles_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_operaciones" (
    "IdTipoOperacion" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_operaciones_pkey" PRIMARY KEY ("IdTipoOperacion"),
    CONSTRAINT "devpware_tipos_operaciones_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_operaciones_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_datos" (
    "IdTipoDato" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_datos_pkey" PRIMARY KEY ("IdTipoDato"),
    CONSTRAINT "devpware_tipos_datos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_datos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_nodos_documentos" (
    "IdTipoNodoDocumento" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_nodos_documentos_pkey" PRIMARY KEY ("IdTipoNodoDocumento"),
    CONSTRAINT "devpware_tipos_nodos_documentos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_nodos_documentos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_columnas" (
    "IdTipoColumna" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_columnas_pkey" PRIMARY KEY ("IdTipoColumna"),
    CONSTRAINT "devpware_tipos_columnas_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_columnas_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_tipos_archivos" (
    "IdTipoArchivo" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_tipos_archivos_pkey" PRIMARY KEY ("IdTipoArchivo"),
    CONSTRAINT "devpware_tipos_archivos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_tipos_archivos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_origenes_datos" (
    "IdOrigenDato" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_origenes_datos_pkey" PRIMARY KEY ("IdOrigenDato"),
    CONSTRAINT "devpware_origenes_datos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_origenes_datos_IOrden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_estados_validaciones" (
    "IdEstadoValidacion" SERIAL NOT NULL,
    "SClave" VARCHAR(64) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" TEXT,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "devpware_estados_validaciones_pkey" PRIMARY KEY ("IdEstadoValidacion"),
    CONSTRAINT "devpware_estados_validaciones_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_estados_validaciones_IOrden_check" CHECK ("IOrden" >= 0)
);

INSERT INTO "devpware_estados_organizaciones" ("SClave", "SNombre", "SDescripcion", "BPermiteOperacion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('ACTIVA', 'Activa', 'Organizacion habilitada para operar.', true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SUSPENDIDA', 'Suspendida', 'Organizacion suspendida temporalmente.', false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CANCELADA', 'Cancelada', 'Organizacion cancelada.', false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BPermiteOperacion" = EXCLUDED."BPermiteOperacion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_estados_usuarios" ("SClave", "SNombre", "SDescripcion", "BPermiteAcceso", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('ACTIVO', 'Activo', 'Usuario habilitado para acceder.', true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SUSPENDIDO', 'Suspendido', 'Usuario suspendido temporalmente.', false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('BLOQUEADO', 'Bloqueado', 'Usuario bloqueado por seguridad o administracion.', false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ELIMINADO', 'Eliminado', 'Usuario marcado como eliminado logico.', false, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BPermiteAcceso" = EXCLUDED."BPermiteAcceso",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_estados_avaluos" ("SClave", "SNombre", "SDescripcion", "BEsInicial", "BEsFinal", "BPermiteEdicion", "BBloqueaAvaluo", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('NUEVO', 'Nuevo', 'Avaluo creado y pendiente de captura.', true, false, true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('EN_EDICION', 'En edicion', 'Avaluo en proceso de edicion.', false, false, true, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('EN_REVISION', 'En revision', 'Avaluo enviado a revision.', false, false, false, true, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TERMINADO', 'Terminado', 'Avaluo finalizado.', false, true, false, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('REABIERTO', 'Reabierto', 'Avaluo reabierto para ajustes.', false, false, true, false, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CANCELADO', 'Cancelado', 'Avaluo cancelado.', false, true, false, true, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BEsInicial" = EXCLUDED."BEsInicial",
    "BEsFinal" = EXCLUDED."BEsFinal",
    "BPermiteEdicion" = EXCLUDED."BPermiteEdicion",
    "BBloqueaAvaluo" = EXCLUDED."BBloqueaAvaluo",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_estados_versiones_avaluos" ("SClave", "SNombre", "SDescripcion", "BPermiteEdicion", "BEsFinal", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('TRABAJO', 'Trabajo', 'Version editable de trabajo.', true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FINALIZADA', 'Finalizada', 'Version finalizada.', false, true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('REABIERTA', 'Reabierta', 'Version reabierta para ajustes.', true, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CANCELADA', 'Cancelada', 'Version cancelada.', false, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BPermiteEdicion" = EXCLUDED."BPermiteEdicion",
    "BEsFinal" = EXCLUDED."BEsFinal",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_avaluos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('COMERCIAL', 'Comercial', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('HIPOTECARIO', 'Hipotecario', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FISCAL', 'Fiscal', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('JUDICIAL', 'Judicial', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OTRO', 'Otro', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_inmuebles" ("SClave", "SNombre", "SDescripcion", "BPermiteTerreno", "BPermiteConstruccion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('TERRENO', 'Terreno', NULL, true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CASA_HABITACION', 'Casa habitacion', NULL, true, true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('DEPARTAMENTO', 'Departamento', NULL, false, true, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LOCAL_COMERCIAL', 'Local comercial', NULL, false, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('BODEGA', 'Bodega', NULL, true, true, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OFICINA', 'Oficina', NULL, false, true, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('EDIFICIO', 'Edificio', NULL, true, true, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('INDUSTRIAL', 'Industrial', NULL, true, true, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RURAL', 'Rural', NULL, true, true, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MIXTO', 'Mixto', NULL, true, true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OTRO', 'Otro', NULL, true, true, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BPermiteTerreno" = EXCLUDED."BPermiteTerreno",
    "BPermiteConstruccion" = EXCLUDED."BPermiteConstruccion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_operaciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('VENTA', 'Venta', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RENTA', 'Renta', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('COMPRA', 'Compra', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('GARANTIA', 'Garantia', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FISCAL', 'Fiscal', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OTRA', 'Otra', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_datos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('TEXTO', 'Texto', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TEXTO_LARGO', 'Texto largo', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ENTERO', 'Entero', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('DECIMAL', 'Decimal', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MONEDA', 'Moneda', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PORCENTAJE', 'Porcentaje', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('BOOLEANO', 'Booleano', NULL, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FECHA', 'Fecha', NULL, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LISTA', 'Lista', NULL, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SELECCION_MULTIPLE', 'Seleccion multiple', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ARCHIVO', 'Archivo', NULL, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMAGEN', 'Imagen', NULL, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UBICACION', 'Ubicacion', NULL, true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('JSON', 'JSON', NULL, true, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_nodos_documentos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('BLOQUE', 'Bloque', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SUBBLOQUE', 'Subbloque', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CAMPO', 'Campo', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TEXTO', 'Texto', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TITULO', 'Titulo', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SUBTITULO', 'Subtitulo', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CONCEPTO', 'Concepto', NULL, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TABLA', 'Tabla', NULL, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMAGEN', 'Imagen', NULL, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('GALERIA', 'Galeria', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MAPA', 'Mapa', NULL, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CALCULO', 'Calculo', NULL, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RESULTADO', 'Resultado', NULL, true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FIRMA', 'Firma', NULL, true, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SEPARADOR', 'Separador', NULL, true, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SALTO_PAGINA', 'Salto de pagina', NULL, true, 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ANEXO', 'Anexo', NULL, true, 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_columnas" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('CAPTURA', 'Captura', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CALCULADA', 'Calculada', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('REFERENCIA', 'Referencia', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RESULTADO', 'Resultado', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_archivos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('LOGOTIPO', 'Logotipo', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMAGEN_SUJETO', 'Imagen sujeto', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMAGEN_COMPARABLE', 'Imagen comparable', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CROQUIS', 'Croquis', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MAPA', 'Mapa', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PDF_BORRADOR', 'PDF borrador', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PDF_FINAL', 'PDF final', NULL, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('EXCEL_IMPORTACION', 'Excel importacion', NULL, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('EXCEL_EXPORTACION', 'Excel exportacion', NULL, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('DOCUMENTO_SOPORTE', 'Documento soporte', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NORMA', 'Norma', NULL, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('FIRMA', 'Firma', NULL, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OTRO', 'Otro', NULL, true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_origenes_datos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('USUARIO', 'Usuario', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('API', 'API', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('HTML_ESTRUCTURADO', 'HTML estructurado', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('METADATOS', 'Metadatos', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TEXTO', 'Texto', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMAGEN', 'Imagen', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IA', 'IA', NULL, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('GEOCODIFICACION', 'Geocodificacion', NULL, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('IMPORTACION', 'Importacion', NULL, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CALCULO', 'Calculo', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_estados_validaciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
    ('PROPUESTO', 'Propuesto', NULL, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALIDO', 'Valido', NULL, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('DUDOSO', 'Dudoso', NULL, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CONTRADICTORIO', 'Contradictorio', NULL, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CONFIRMADO', 'Confirmado', NULL, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RECHAZADO', 'Rechazado', NULL, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "IOrden" = EXCLUDED."IOrden",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

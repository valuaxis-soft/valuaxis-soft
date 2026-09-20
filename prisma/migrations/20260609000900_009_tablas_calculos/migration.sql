-- Migracion 009_tablas_calculos
-- Tablas documentales y trazabilidad de calculos permitidos.
-- La base guarda claves, versiones, entradas, salidas, redondeo, errores y sobrescrituras; las operaciones se ejecutan en backend.
-- El backend debe validar que columnas dependientes pertenezcan a la misma tabla y que filas/celdas correspondan a su tabla.

CREATE TABLE "devpware_tablas_documentos" (
    "IdTablaDocumento" SERIAL NOT NULL,
    "IdNodoDocumento" INTEGER NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BPermiteFilas" BOOLEAN NOT NULL DEFAULT true,
    "BPermiteColumnas" BOOLEAN NOT NULL DEFAULT false,
    "BMostrarTotales" BOOLEAN NOT NULL DEFAULT false,
    "JConfiguracion" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_tablas_documentos_pkey" PRIMARY KEY ("IdTablaDocumento"),
    CONSTRAINT "devpware_tablas_documentos_IdNodoDocumento_IOrden_key" UNIQUE ("IdNodoDocumento", "IOrden"),
    CONSTRAINT "devpware_tablas_documentos_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_tablas_documentos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_tablas_documentos_IdNodoDocumento_fkey" FOREIGN KEY ("IdNodoDocumento") REFERENCES "devpware_nodos_documentos" ("IdNodoDocumento") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_tablas_documentos_IdNodoDocumento_idx" ON "devpware_tablas_documentos" ("IdNodoDocumento");
CREATE INDEX "devpware_tablas_documentos_IOrden_idx" ON "devpware_tablas_documentos" ("IOrden");

CREATE TABLE "devpware_calculos_permitidos" (
    "IdCalculoPermitido" SERIAL NOT NULL,
    "SClave" VARCHAR(120) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "SVersionActual" VARCHAR(50) NOT NULL,
    "BPermiteTabla" BOOLEAN NOT NULL DEFAULT false,
    "BPermiteCampo" BOOLEAN NOT NULL DEFAULT false,
    "BPermiteSobrescritura" BOOLEAN NOT NULL DEFAULT false,
    "JParametrosRequeridos" JSONB,
    "JTiposDatosPermitidos" JSONB,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_calculos_permitidos_pkey" PRIMARY KEY ("IdCalculoPermitido"),
    CONSTRAINT "devpware_calculos_permitidos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_calculos_permitidos_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_calculos_permitidos_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_calculos_permitidos_SVersionActual_check" CHECK (btrim("SVersionActual") <> ''),
    CONSTRAINT "devpware_calculos_permitidos_alcance_check" CHECK ("BPermiteTabla" = true OR "BPermiteCampo" = true)
);

CREATE INDEX "devpware_calculos_permitidos_BActivo_idx" ON "devpware_calculos_permitidos" ("BActivo");
CREATE INDEX "devpware_calculos_permitidos_BPermiteTabla_idx" ON "devpware_calculos_permitidos" ("BPermiteTabla");
CREATE INDEX "devpware_calculos_permitidos_BPermiteCampo_idx" ON "devpware_calculos_permitidos" ("BPermiteCampo");

CREATE TABLE "devpware_columnas_tablas_documentos" (
    "IdColumnaTablaDocumento" SERIAL NOT NULL,
    "IdTablaDocumento" INTEGER NOT NULL,
    "IdTipoDato" INTEGER NOT NULL,
    "IdTipoColumna" INTEGER NOT NULL,
    "IdCalculoPermitido" INTEGER,
    "SClave" VARCHAR(120) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(1000),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BEditable" BOOLEAN NOT NULL DEFAULT true,
    "BObligatoria" BOOLEAN NOT NULL DEFAULT false,
    "BVisible" BOOLEAN NOT NULL DEFAULT true,
    "BPermiteNulos" BOOLEAN NOT NULL DEFAULT true,
    "BResultadoSobrescribible" BOOLEAN NOT NULL DEFAULT false,
    "INumeroDecimales" INTEGER,
    "SFormatoVisual" VARCHAR(100),
    "SUnidad" VARCHAR(50),
    "JConfiguracion" JSONB,
    "JValidaciones" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_columnas_tablas_documentos_pkey" PRIMARY KEY ("IdColumnaTablaDocumento"),
    CONSTRAINT "devpware_columnas_tablas_documentos_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_columnas_tablas_documentos_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_columnas_tablas_documentos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_columnas_tablas_documentos_decimales_check" CHECK ("INumeroDecimales" IS NULL OR ("INumeroDecimales" BETWEEN 0 AND 12)),
    CONSTRAINT "devpware_columnas_tablas_documentos_IdTablaDocumento_fkey" FOREIGN KEY ("IdTablaDocumento") REFERENCES "devpware_tablas_documentos" ("IdTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_columnas_tablas_documentos_IdTipoDato_fkey" FOREIGN KEY ("IdTipoDato") REFERENCES "devpware_tipos_datos" ("IdTipoDato") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_columnas_tablas_documentos_IdTipoColumna_fkey" FOREIGN KEY ("IdTipoColumna") REFERENCES "devpware_tipos_columnas" ("IdTipoColumna") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_columnas_tablas_documentos_IdCalculoPermitido_fkey" FOREIGN KEY ("IdCalculoPermitido") REFERENCES "devpware_calculos_permitidos" ("IdCalculoPermitido") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_columnas_tablas_documentos_IdTablaDocumento_SClave_key" ON "devpware_columnas_tablas_documentos" ("IdTablaDocumento", "SClave") WHERE "DFechaEliminacion" IS NULL;
CREATE INDEX "devpware_columnas_tablas_documentos_IdTablaDocumento_idx" ON "devpware_columnas_tablas_documentos" ("IdTablaDocumento");
CREATE INDEX "devpware_columnas_tablas_documentos_IdTipoDato_idx" ON "devpware_columnas_tablas_documentos" ("IdTipoDato");
CREATE INDEX "devpware_columnas_tablas_documentos_IdTipoColumna_idx" ON "devpware_columnas_tablas_documentos" ("IdTipoColumna");
CREATE INDEX "devpware_columnas_tablas_documentos_IdCalculoPermitido_idx" ON "devpware_columnas_tablas_documentos" ("IdCalculoPermitido");
CREATE INDEX "devpware_columnas_tablas_documentos_IOrden_idx" ON "devpware_columnas_tablas_documentos" ("IOrden");
CREATE INDEX "devpware_columnas_tablas_documentos_BVisible_idx" ON "devpware_columnas_tablas_documentos" ("BVisible");
CREATE INDEX "devpware_columnas_tablas_documentos_DFechaEliminacion_idx" ON "devpware_columnas_tablas_documentos" ("DFechaEliminacion");

CREATE TABLE "devpware_dependencias_columnas_calculadas" (
    "IdDependenciaColumnaCalculada" SERIAL NOT NULL,
    "IdColumnaCalculada" INTEGER NOT NULL,
    "IdColumnaOrigen" INTEGER NOT NULL,
    "SParametroDestino" VARCHAR(120) NOT NULL,
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_dependencias_columnas_calculadas_pkey" PRIMARY KEY ("IdDependenciaColumnaCalculada"),
    CONSTRAINT "devpware_dependencias_columnas_calculadas_unique" UNIQUE ("IdColumnaCalculada", "IdColumnaOrigen", "SParametroDestino"),
    CONSTRAINT "devpware_dependencias_columnas_calculadas_columnas_check" CHECK ("IdColumnaCalculada" <> "IdColumnaOrigen"),
    CONSTRAINT "devpware_dependencias_columnas_calculadas_parametro_check" CHECK (btrim("SParametroDestino") <> ''),
    CONSTRAINT "devpware_dependencias_columnas_calculadas_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_dependencias_columnas_calculadas_IdColumnaCalculada_fkey" FOREIGN KEY ("IdColumnaCalculada") REFERENCES "devpware_columnas_tablas_documentos" ("IdColumnaTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_dependencias_columnas_calculadas_IdColumnaOrigen_fkey" FOREIGN KEY ("IdColumnaOrigen") REFERENCES "devpware_columnas_tablas_documentos" ("IdColumnaTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_dependencias_columnas_calculadas_IdColumnaCalculada_idx" ON "devpware_dependencias_columnas_calculadas" ("IdColumnaCalculada");
CREATE INDEX "devpware_dependencias_columnas_calculadas_IdColumnaOrigen_idx" ON "devpware_dependencias_columnas_calculadas" ("IdColumnaOrigen");
CREATE INDEX "devpware_dependencias_columnas_calculadas_IOrden_idx" ON "devpware_dependencias_columnas_calculadas" ("IOrden");

CREATE TABLE "devpware_filas_tablas_documentos" (
    "IdFilaTablaDocumento" BIGSERIAL NOT NULL,
    "IdTablaDocumento" INTEGER NOT NULL,
    "SClave" VARCHAR(120),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "JMetadatos" JSONB,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_filas_tablas_documentos_pkey" PRIMARY KEY ("IdFilaTablaDocumento"),
    CONSTRAINT "devpware_filas_tablas_documentos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_filas_tablas_documentos_SClave_check" CHECK ("SClave" IS NULL OR btrim("SClave") <> ''),
    CONSTRAINT "devpware_filas_tablas_documentos_IdTablaDocumento_fkey" FOREIGN KEY ("IdTablaDocumento") REFERENCES "devpware_tablas_documentos" ("IdTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_filas_tablas_documentos_IdTablaDocumento_SClave_key" ON "devpware_filas_tablas_documentos" ("IdTablaDocumento", "SClave") WHERE "SClave" IS NOT NULL;
CREATE INDEX "devpware_filas_tablas_documentos_IdTablaDocumento_idx" ON "devpware_filas_tablas_documentos" ("IdTablaDocumento");
CREATE INDEX "devpware_filas_tablas_documentos_IOrden_idx" ON "devpware_filas_tablas_documentos" ("IOrden");
CREATE INDEX "devpware_filas_tablas_documentos_BActivo_idx" ON "devpware_filas_tablas_documentos" ("BActivo");

CREATE TABLE "devpware_celdas_tablas_documentos" (
    "IdCeldaTablaDocumento" BIGSERIAL NOT NULL,
    "IdFilaTablaDocumento" BIGINT NOT NULL,
    "IdColumnaTablaDocumento" INTEGER NOT NULL,
    "IdOrigenDato" INTEGER NOT NULL,
    "SValorTexto" TEXT,
    "NValorNumerico" NUMERIC(24,8),
    "BValorBooleano" BOOLEAN,
    "DValorFecha" TIMESTAMPTZ(3),
    "JValorComplejo" JSONB,
    "BEsCalculado" BOOLEAN NOT NULL DEFAULT false,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_celdas_tablas_documentos_pkey" PRIMARY KEY ("IdCeldaTablaDocumento"),
    CONSTRAINT "devpware_celdas_tablas_documentos_IdFilaTablaDocumento_IdColumnaTablaDocumento_key" UNIQUE ("IdFilaTablaDocumento", "IdColumnaTablaDocumento"),
    CONSTRAINT "devpware_celdas_tablas_documentos_un_valor_check" CHECK ((
        CASE WHEN "SValorTexto" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "NValorNumerico" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "BValorBooleano" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "DValorFecha" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "JValorComplejo" IS NOT NULL THEN 1 ELSE 0 END
    ) <= 1),
    CONSTRAINT "devpware_celdas_tablas_documentos_IdFilaTablaDocumento_fkey" FOREIGN KEY ("IdFilaTablaDocumento") REFERENCES "devpware_filas_tablas_documentos" ("IdFilaTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_celdas_tablas_documentos_IdColumnaTablaDocumento_fkey" FOREIGN KEY ("IdColumnaTablaDocumento") REFERENCES "devpware_columnas_tablas_documentos" ("IdColumnaTablaDocumento") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_celdas_tablas_documentos_IdOrigenDato_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_celdas_tablas_documentos_IdFilaTablaDocumento_idx" ON "devpware_celdas_tablas_documentos" ("IdFilaTablaDocumento");
CREATE INDEX "devpware_celdas_tablas_documentos_IdColumnaTablaDocumento_idx" ON "devpware_celdas_tablas_documentos" ("IdColumnaTablaDocumento");
CREATE INDEX "devpware_celdas_tablas_documentos_IdOrigenDato_idx" ON "devpware_celdas_tablas_documentos" ("IdOrigenDato");
CREATE INDEX "devpware_celdas_tablas_documentos_BEsCalculado_idx" ON "devpware_celdas_tablas_documentos" ("BEsCalculado");
CREATE INDEX "devpware_celdas_tablas_documentos_DFechaModificacion_idx" ON "devpware_celdas_tablas_documentos" ("DFechaModificacion");

CREATE TABLE "devpware_ejecuciones_calculos" (
    "IdEjecucionCalculo" BIGSERIAL NOT NULL,
    "IdVersionAvaluo" INTEGER NOT NULL,
    "IdNodoDocumento" INTEGER,
    "IdTablaDocumento" INTEGER,
    "IdFilaTablaDocumento" BIGINT,
    "IdCalculoPermitido" INTEGER NOT NULL,
    "SClaveCalculo" VARCHAR(120) NOT NULL,
    "SVersionCalculo" VARCHAR(50) NOT NULL,
    "JValoresEntrada" JSONB NOT NULL,
    "JValoresSalida" JSONB,
    "SPoliticaRedondeo" VARCHAR(120),
    "BResultadoSobrescrito" BOOLEAN NOT NULL DEFAULT false,
    "IdUsuarioSobrescritura" INTEGER,
    "SMotivoSobrescritura" VARCHAR(1000),
    "BExitoso" BOOLEAN NOT NULL DEFAULT false,
    "SMensajeError" TEXT,
    "DFechaEjecucion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaSobrescritura" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_ejecuciones_calculos_pkey" PRIMARY KEY ("IdEjecucionCalculo"),
    CONSTRAINT "devpware_ejecuciones_calculos_SClaveCalculo_check" CHECK (btrim("SClaveCalculo") <> ''),
    CONSTRAINT "devpware_ejecuciones_calculos_SVersionCalculo_check" CHECK (btrim("SVersionCalculo") <> ''),
    CONSTRAINT "devpware_ejecuciones_calculos_contexto_check" CHECK ("IdNodoDocumento" IS NOT NULL OR "IdTablaDocumento" IS NOT NULL),
    CONSTRAINT "devpware_ejecuciones_calculos_fila_tabla_check" CHECK ("IdFilaTablaDocumento" IS NULL OR "IdTablaDocumento" IS NOT NULL),
    CONSTRAINT "devpware_ejecuciones_calculos_sobrescritura_check" CHECK (
        "BResultadoSobrescrito" = false OR (
            "IdUsuarioSobrescritura" IS NOT NULL AND
            "SMotivoSobrescritura" IS NOT NULL AND btrim("SMotivoSobrescritura") <> '' AND
            "DFechaSobrescritura" IS NOT NULL
        )
    ),
    CONSTRAINT "devpware_ejecuciones_calculos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_ejecuciones_calculos_IdNodoDocumento_fkey" FOREIGN KEY ("IdNodoDocumento") REFERENCES "devpware_nodos_documentos" ("IdNodoDocumento") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_ejecuciones_calculos_IdTablaDocumento_fkey" FOREIGN KEY ("IdTablaDocumento") REFERENCES "devpware_tablas_documentos" ("IdTablaDocumento") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_ejecuciones_calculos_IdFilaTablaDocumento_fkey" FOREIGN KEY ("IdFilaTablaDocumento") REFERENCES "devpware_filas_tablas_documentos" ("IdFilaTablaDocumento") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_ejecuciones_calculos_IdCalculoPermitido_fkey" FOREIGN KEY ("IdCalculoPermitido") REFERENCES "devpware_calculos_permitidos" ("IdCalculoPermitido") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_ejecuciones_calculos_IdUsuarioSobrescritura_fkey" FOREIGN KEY ("IdUsuarioSobrescritura") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_ejecuciones_calculos_IdVersionAvaluo_idx" ON "devpware_ejecuciones_calculos" ("IdVersionAvaluo");
CREATE INDEX "devpware_ejecuciones_calculos_IdNodoDocumento_idx" ON "devpware_ejecuciones_calculos" ("IdNodoDocumento");
CREATE INDEX "devpware_ejecuciones_calculos_IdTablaDocumento_idx" ON "devpware_ejecuciones_calculos" ("IdTablaDocumento");
CREATE INDEX "devpware_ejecuciones_calculos_IdFilaTablaDocumento_idx" ON "devpware_ejecuciones_calculos" ("IdFilaTablaDocumento");
CREATE INDEX "devpware_ejecuciones_calculos_IdCalculoPermitido_idx" ON "devpware_ejecuciones_calculos" ("IdCalculoPermitido");
CREATE INDEX "devpware_ejecuciones_calculos_IdUsuarioSobrescritura_idx" ON "devpware_ejecuciones_calculos" ("IdUsuarioSobrescritura");
CREATE INDEX "devpware_ejecuciones_calculos_BExitoso_idx" ON "devpware_ejecuciones_calculos" ("BExitoso");
CREATE INDEX "devpware_ejecuciones_calculos_BResultadoSobrescrito_idx" ON "devpware_ejecuciones_calculos" ("BResultadoSobrescrito");
CREATE INDEX "devpware_ejecuciones_calculos_DFechaEjecucion_idx" ON "devpware_ejecuciones_calculos" ("DFechaEjecucion");

CREATE TABLE "devpware_resultados_calculos" (
    "IdResultadoCalculo" BIGSERIAL NOT NULL,
    "IdEjecucionCalculo" BIGINT NOT NULL,
    "SClaveResultado" VARCHAR(120) NOT NULL,
    "NValorNumerico" NUMERIC(24,8),
    "SValorTexto" TEXT,
    "SUnidad" VARCHAR(50),
    "IOrden" INTEGER NOT NULL DEFAULT 0,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_resultados_calculos_pkey" PRIMARY KEY ("IdResultadoCalculo"),
    CONSTRAINT "devpware_resultados_calculos_IdEjecucionCalculo_SClaveResultado_key" UNIQUE ("IdEjecucionCalculo", "SClaveResultado"),
    CONSTRAINT "devpware_resultados_calculos_SClaveResultado_check" CHECK (btrim("SClaveResultado") <> ''),
    CONSTRAINT "devpware_resultados_calculos_IOrden_check" CHECK ("IOrden" >= 0),
    CONSTRAINT "devpware_resultados_calculos_un_valor_check" CHECK (
        (CASE WHEN "NValorNumerico" IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN "SValorTexto" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    ),
    CONSTRAINT "devpware_resultados_calculos_IdEjecucionCalculo_fkey" FOREIGN KEY ("IdEjecucionCalculo") REFERENCES "devpware_ejecuciones_calculos" ("IdEjecucionCalculo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_resultados_calculos_IdEjecucionCalculo_idx" ON "devpware_resultados_calculos" ("IdEjecucionCalculo");
CREATE INDEX "devpware_resultados_calculos_IOrden_idx" ON "devpware_resultados_calculos" ("IOrden");

INSERT INTO "devpware_calculos_permitidos" (
    "SClave",
    "SNombre",
    "SDescripcion",
    "SVersionActual",
    "BPermiteTabla",
    "BPermiteCampo",
    "BPermiteSobrescritura",
    "JParametrosRequeridos",
    "JTiposDatosPermitidos",
    "BActivo",
    "DFechaCreacion",
    "DFechaModificacion"
) VALUES
    ('SUMA', 'Suma', 'Calculo permitido de suma.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RESTA', 'Resta', 'Calculo permitido de resta.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MULTIPLICACION', 'Multiplicacion', 'Calculo permitido de multiplicacion.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('DIVISION', 'Division', 'Calculo permitido de division.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PROMEDIO', 'Promedio', 'Calculo permitido de promedio.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PORCENTAJE', 'Porcentaje', 'Calculo permitido de porcentaje.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PRODUCTO_FACTORES', 'Producto de factores', 'Calculo permitido de producto de factores.', '1.0.0', true, true, false, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALOR_UNITARIO', 'Valor unitario', 'Calculo permitido de valor unitario.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALOR_HOMOLOGADO', 'Valor homologado', 'Calculo permitido de valor homologado.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALOR_REPOSICION_NUEVO', 'Valor reposicion nuevo', 'Calculo permitido de valor de reposicion nuevo.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALOR_NETO_REPOSICION', 'Valor neto reposicion', 'Calculo permitido de valor neto de reposicion.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('RENTA_NETA', 'Renta neta', 'Calculo permitido de renta neta.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CAPITALIZACION', 'Capitalizacion', 'Calculo permitido de capitalizacion.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALOR_FINAL', 'Valor final', 'Calculo permitido de valor final.', '1.0.0', true, true, true, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "SVersionActual" = EXCLUDED."SVersionActual",
    "BPermiteTabla" = EXCLUDED."BPermiteTabla",
    "BPermiteCampo" = EXCLUDED."BPermiteCampo",
    "BPermiteSobrescritura" = EXCLUDED."BPermiteSobrescritura",
    "JParametrosRequeridos" = EXCLUDED."JParametrosRequeridos",
    "JTiposDatosPermitidos" = EXCLUDED."JTiposDatosPermitidos",
    "BActivo" = EXCLUDED."BActivo",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

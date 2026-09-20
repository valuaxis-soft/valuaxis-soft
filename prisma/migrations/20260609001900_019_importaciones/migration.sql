-- Migracion 019_importaciones

CREATE TABLE "devpware_estados_importaciones" (
  "IdEstadoImportacion" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BEsInicial" BOOLEAN NOT NULL DEFAULT false,
  "BEsProceso" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BEsExitoso" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteReintento" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_estados_importaciones_pkey" PRIMARY KEY ("IdEstadoImportacion"),
  CONSTRAINT "devpware_estados_importaciones_sclave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_importaciones_sclave_no_vacia_chk" CHECK (length(btrim("SClave")) > 0),
  CONSTRAINT "devpware_estados_importaciones_snombre_no_vacio_chk" CHECK (length(btrim("SNombre")) > 0),
  CONSTRAINT "devpware_estados_importaciones_iorden_no_negativo_chk" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_estados_importaciones_inicial_final_chk" CHECK (NOT ("BEsInicial" AND "BEsFinal")),
  CONSTRAINT "devpware_estados_importaciones_exitoso_final_chk" CHECK (NOT "BEsExitoso" OR "BEsFinal")
);

CREATE TABLE "devpware_tipos_importaciones" (
  "IdTipoImportacion" SERIAL NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "BRequiereAvaluo" BOOLEAN NOT NULL DEFAULT false,
  "BRequiereVersionAvaluo" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteAplicacionParcial" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "JConfiguracionEsperada" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_tipos_importaciones_pkey" PRIMARY KEY ("IdTipoImportacion"),
  CONSTRAINT "devpware_tipos_importaciones_sclave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_importaciones_sclave_no_vacia_chk" CHECK (length(btrim("SClave")) > 0),
  CONSTRAINT "devpware_tipos_importaciones_snombre_no_vacio_chk" CHECK (length(btrim("SNombre")) > 0)
);

CREATE TABLE "devpware_importaciones" (
  "IdImportacion" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdTipoImportacion" INTEGER NOT NULL,
  "IdEstadoImportacion" INTEGER NOT NULL,
  "IdArchivo" BIGINT NOT NULL,
  "IdTrabajo" BIGINT,
  "IdAvaluo" INTEGER,
  "IdVersionAvaluo" INTEGER,
  "SNombre" VARCHAR(220) NOT NULL,
  "SFormatoArchivo" VARCHAR(40) NOT NULL,
  "SHoja" VARCHAR(180),
  "SClaveIdempotencia" VARCHAR(255),
  "ITotalFilas" INTEGER NOT NULL DEFAULT 0,
  "IFilasValidas" INTEGER NOT NULL DEFAULT 0,
  "IFilasConError" INTEGER NOT NULL DEFAULT 0,
  "IFilasAplicadas" INTEGER NOT NULL DEFAULT 0,
  "IFilasOmitidas" INTEGER NOT NULL DEFAULT 0,
  "JConfiguracion" JSONB,
  "JResumen" JSONB,
  "SMensajeResultado" TEXT,
  "DFechaCarga" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaInicioAnalisis" TIMESTAMPTZ(3),
  "DFechaFinAnalisis" TIMESTAMPTZ(3),
  "DFechaInicioAplicacion" TIMESTAMPTZ(3),
  "DFechaFinAplicacion" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_importaciones_pkey" PRIMARY KEY ("IdImportacion"),
  CONSTRAINT "devpware_importaciones_uidentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_importaciones_idorganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones"("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idusuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios"("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idtipo_fkey" FOREIGN KEY ("IdTipoImportacion") REFERENCES "devpware_tipos_importaciones"("IdTipoImportacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idestado_fkey" FOREIGN KEY ("IdEstadoImportacion") REFERENCES "devpware_estados_importaciones"("IdEstadoImportacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idarchivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos"("IdArchivo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idtrabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos"("IdTrabajo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idavaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos"("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_idversion_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos"("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_importaciones_snombre_no_vacio_chk" CHECK (length(btrim("SNombre")) > 0),
  CONSTRAINT "devpware_importaciones_sformato_no_vacio_chk" CHECK (length(btrim("SFormatoArchivo")) > 0),
  CONSTRAINT "devpware_importaciones_contadores_no_negativos_chk" CHECK ("ITotalFilas" >= 0 AND "IFilasValidas" >= 0 AND "IFilasConError" >= 0 AND "IFilasAplicadas" >= 0 AND "IFilasOmitidas" >= 0),
  CONSTRAINT "devpware_importaciones_validas_errores_chk" CHECK ("IFilasValidas" + "IFilasConError" <= "ITotalFilas"),
  CONSTRAINT "devpware_importaciones_aplicadas_omitidas_chk" CHECK ("IFilasAplicadas" + "IFilasOmitidas" <= "ITotalFilas"),
  CONSTRAINT "devpware_importaciones_fin_analisis_chk" CHECK ("DFechaFinAnalisis" IS NULL OR ("DFechaInicioAnalisis" IS NOT NULL AND "DFechaFinAnalisis" >= "DFechaInicioAnalisis")),
  CONSTRAINT "devpware_importaciones_fin_aplicacion_chk" CHECK ("DFechaFinAplicacion" IS NULL OR ("DFechaInicioAplicacion" IS NOT NULL AND "DFechaFinAplicacion" >= "DFechaInicioAplicacion")),
  CONSTRAINT "devpware_importaciones_cancelacion_chk" CHECK ("DFechaCancelacion" IS NULL OR "DFechaCancelacion" >= "DFechaCarga")
);

CREATE TABLE "devpware_columnas_importaciones" (
  "IdColumnaImportacion" BIGSERIAL NOT NULL,
  "IdImportacion" BIGINT NOT NULL,
  "IIndiceOrigen" INTEGER NOT NULL,
  "SNombreOrigen" VARCHAR(220) NOT NULL,
  "SClaveDestino" VARCHAR(180),
  "STipoDatoDetectado" VARCHAR(120),
  "STipoDatoDestino" VARCHAR(120),
  "BObligatoria" BOOLEAN NOT NULL DEFAULT false,
  "BMapeada" BOOLEAN NOT NULL DEFAULT false,
  "JConfiguracionMapeo" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_columnas_importaciones_pkey" PRIMARY KEY ("IdColumnaImportacion"),
  CONSTRAINT "devpware_columnas_importaciones_importacion_indice_key" UNIQUE ("IdImportacion", "IIndiceOrigen"),
  CONSTRAINT "devpware_columnas_importaciones_idimportacion_fkey" FOREIGN KEY ("IdImportacion") REFERENCES "devpware_importaciones"("IdImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_columnas_importaciones_indice_no_negativo_chk" CHECK ("IIndiceOrigen" >= 0),
  CONSTRAINT "devpware_columnas_importaciones_nombre_no_vacio_chk" CHECK (length(btrim("SNombreOrigen")) > 0),
  CONSTRAINT "devpware_columnas_importaciones_mapeada_destino_chk" CHECK (NOT "BMapeada" OR ("SClaveDestino" IS NOT NULL AND length(btrim("SClaveDestino")) > 0))
);

CREATE TABLE "devpware_filas_importaciones" (
  "IdFilaImportacion" BIGSERIAL NOT NULL,
  "IdImportacion" BIGINT NOT NULL,
  "INumeroFila" INTEGER NOT NULL,
  "BValida" BOOLEAN NOT NULL DEFAULT false,
  "BAplicada" BOOLEAN NOT NULL DEFAULT false,
  "BOmitida" BOOLEAN NOT NULL DEFAULT false,
  "SIdentificadorDestino" VARCHAR(180),
  "JDatosOriginales" JSONB NOT NULL,
  "JDatosNormalizados" JSONB,
  "JDatosAplicados" JSONB,
  "DFechaValidacion" TIMESTAMPTZ(3),
  "DFechaAplicacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_filas_importaciones_pkey" PRIMARY KEY ("IdFilaImportacion"),
  CONSTRAINT "devpware_filas_importaciones_importacion_fila_key" UNIQUE ("IdImportacion", "INumeroFila"),
  CONSTRAINT "devpware_filas_importaciones_idimportacion_fkey" FOREIGN KEY ("IdImportacion") REFERENCES "devpware_importaciones"("IdImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_filas_importaciones_numero_fila_chk" CHECK ("INumeroFila" >= 1),
  CONSTRAINT "devpware_filas_importaciones_datos_no_null_chk" CHECK (jsonb_typeof("JDatosOriginales") <> 'null'),
  CONSTRAINT "devpware_filas_importaciones_aplicada_omitida_chk" CHECK (NOT ("BAplicada" AND "BOmitida")),
  CONSTRAINT "devpware_filas_importaciones_aplicada_fecha_chk" CHECK (NOT "BAplicada" OR "DFechaAplicacion" IS NOT NULL),
  CONSTRAINT "devpware_filas_importaciones_valida_fecha_chk" CHECK (NOT "BValida" OR "DFechaValidacion" IS NOT NULL)
);

CREATE TABLE "devpware_valores_filas_importaciones" (
  "IdValorFilaImportacion" BIGSERIAL NOT NULL,
  "IdFilaImportacion" BIGINT NOT NULL,
  "IdColumnaImportacion" BIGINT NOT NULL,
  "SValorOriginal" TEXT,
  "SValorNormalizado" TEXT,
  "NValorNumerico" NUMERIC(24,8),
  "BValorBooleano" BOOLEAN,
  "DValorFecha" TIMESTAMPTZ(3),
  "JValorComplejo" JSONB,
  "BValido" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_valores_filas_importaciones_pkey" PRIMARY KEY ("IdValorFilaImportacion"),
  CONSTRAINT "devpware_valores_filas_importaciones_fila_columna_key" UNIQUE ("IdFilaImportacion", "IdColumnaImportacion"),
  CONSTRAINT "devpware_valores_filas_importaciones_idfila_fkey" FOREIGN KEY ("IdFilaImportacion") REFERENCES "devpware_filas_importaciones"("IdFilaImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_valores_filas_importaciones_idcolumna_fkey" FOREIGN KEY ("IdColumnaImportacion") REFERENCES "devpware_columnas_importaciones"("IdColumnaImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_valores_filas_importaciones_un_valor_chk" CHECK (num_nonnulls("SValorNormalizado", "NValorNumerico", "BValorBooleano", "DValorFecha", "JValorComplejo") <= 1)
);

CREATE TABLE "devpware_errores_importaciones" (
  "IdErrorImportacion" BIGSERIAL NOT NULL,
  "IdImportacion" BIGINT NOT NULL,
  "IdFilaImportacion" BIGINT,
  "IdColumnaImportacion" BIGINT,
  "SCodigoError" VARCHAR(180),
  "SNivel" VARCHAR(40) NOT NULL,
  "SMensaje" TEXT NOT NULL,
  "SValorRecibido" TEXT,
  "JContexto" JSONB,
  "BCorregido" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaCorreccion" TIMESTAMPTZ(3),

  CONSTRAINT "devpware_errores_importaciones_pkey" PRIMARY KEY ("IdErrorImportacion"),
  CONSTRAINT "devpware_errores_importaciones_idimportacion_fkey" FOREIGN KEY ("IdImportacion") REFERENCES "devpware_importaciones"("IdImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_errores_importaciones_idfila_fkey" FOREIGN KEY ("IdFilaImportacion") REFERENCES "devpware_filas_importaciones"("IdFilaImportacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_errores_importaciones_idcolumna_fkey" FOREIGN KEY ("IdColumnaImportacion") REFERENCES "devpware_columnas_importaciones"("IdColumnaImportacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_errores_importaciones_snivel_no_vacio_chk" CHECK (length(btrim("SNivel")) > 0),
  CONSTRAINT "devpware_errores_importaciones_smensaje_no_vacio_chk" CHECK (length(btrim("SMensaje")) > 0),
  CONSTRAINT "devpware_errores_importaciones_corregido_fecha_chk" CHECK (NOT "BCorregido" OR "DFechaCorreccion" IS NOT NULL)
);

CREATE TABLE "devpware_eventos_importaciones" (
  "IdEventoImportacion" BIGSERIAL NOT NULL,
  "IdImportacion" BIGINT NOT NULL,
  "IdEstadoImportacionAnterior" INTEGER,
  "IdEstadoImportacionNuevo" INTEGER NOT NULL,
  "IdUsuario" INTEGER,
  "IdTrabajo" BIGINT,
  "SMotivo" VARCHAR(1000),
  "JMetadatos" JSONB,
  "DFechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "devpware_eventos_importaciones_pkey" PRIMARY KEY ("IdEventoImportacion"),
  CONSTRAINT "devpware_eventos_importaciones_idimportacion_fkey" FOREIGN KEY ("IdImportacion") REFERENCES "devpware_importaciones"("IdImportacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_importaciones_idestado_anterior_fkey" FOREIGN KEY ("IdEstadoImportacionAnterior") REFERENCES "devpware_estados_importaciones"("IdEstadoImportacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_importaciones_idestado_nuevo_fkey" FOREIGN KEY ("IdEstadoImportacionNuevo") REFERENCES "devpware_estados_importaciones"("IdEstadoImportacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_importaciones_idusuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios"("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_importaciones_idtrabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos"("IdTrabajo") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_estados_importaciones_besinicial_idx" ON "devpware_estados_importaciones"("BEsInicial");
CREATE INDEX "devpware_estados_importaciones_besproceso_idx" ON "devpware_estados_importaciones"("BEsProceso");
CREATE INDEX "devpware_estados_importaciones_besfinal_idx" ON "devpware_estados_importaciones"("BEsFinal");
CREATE INDEX "devpware_estados_importaciones_besexitoso_idx" ON "devpware_estados_importaciones"("BEsExitoso");
CREATE INDEX "devpware_estados_importaciones_bpermitereintento_idx" ON "devpware_estados_importaciones"("BPermiteReintento");
CREATE INDEX "devpware_estados_importaciones_bactivo_idx" ON "devpware_estados_importaciones"("BActivo");
CREATE INDEX "devpware_estados_importaciones_iorden_idx" ON "devpware_estados_importaciones"("IOrden");

CREATE INDEX "devpware_tipos_importaciones_brequiereavaluo_idx" ON "devpware_tipos_importaciones"("BRequiereAvaluo");
CREATE INDEX "devpware_tipos_importaciones_brequiereversion_idx" ON "devpware_tipos_importaciones"("BRequiereVersionAvaluo");
CREATE INDEX "devpware_tipos_importaciones_bpermiteparcial_idx" ON "devpware_tipos_importaciones"("BPermiteAplicacionParcial");
CREATE INDEX "devpware_tipos_importaciones_bactivo_idx" ON "devpware_tipos_importaciones"("BActivo");

CREATE INDEX "devpware_importaciones_idorganizacion_idx" ON "devpware_importaciones"("IdOrganizacion");
CREATE INDEX "devpware_importaciones_idusuario_idx" ON "devpware_importaciones"("IdUsuario");
CREATE INDEX "devpware_importaciones_idtipo_idx" ON "devpware_importaciones"("IdTipoImportacion");
CREATE INDEX "devpware_importaciones_idestado_idx" ON "devpware_importaciones"("IdEstadoImportacion");
CREATE INDEX "devpware_importaciones_idarchivo_idx" ON "devpware_importaciones"("IdArchivo");
CREATE INDEX "devpware_importaciones_idtrabajo_idx" ON "devpware_importaciones"("IdTrabajo");
CREATE INDEX "devpware_importaciones_idavaluo_idx" ON "devpware_importaciones"("IdAvaluo");
CREATE INDEX "devpware_importaciones_idversion_idx" ON "devpware_importaciones"("IdVersionAvaluo");
CREATE INDEX "devpware_importaciones_sformato_idx" ON "devpware_importaciones"("SFormatoArchivo");
CREATE INDEX "devpware_importaciones_dfechacarga_idx" ON "devpware_importaciones"("DFechaCarga");
CREATE INDEX "devpware_importaciones_dfechafinanalisis_idx" ON "devpware_importaciones"("DFechaFinAnalisis");
CREATE INDEX "devpware_importaciones_dfechafinaplicacion_idx" ON "devpware_importaciones"("DFechaFinAplicacion");
CREATE UNIQUE INDEX "devpware_importaciones_idempotencia_activa_uidx" ON "devpware_importaciones"("IdOrganizacion", "SClaveIdempotencia") WHERE "SClaveIdempotencia" IS NOT NULL AND "DFechaFinAplicacion" IS NULL AND "DFechaCancelacion" IS NULL;

CREATE INDEX "devpware_columnas_importaciones_idimportacion_idx" ON "devpware_columnas_importaciones"("IdImportacion");
CREATE INDEX "devpware_columnas_importaciones_sclavedestino_idx" ON "devpware_columnas_importaciones"("SClaveDestino");
CREATE INDEX "devpware_columnas_importaciones_bobligatoria_idx" ON "devpware_columnas_importaciones"("BObligatoria");
CREATE INDEX "devpware_columnas_importaciones_bmapeada_idx" ON "devpware_columnas_importaciones"("BMapeada");
CREATE UNIQUE INDEX "devpware_columnas_importaciones_destino_uidx" ON "devpware_columnas_importaciones"("IdImportacion", "SClaveDestino") WHERE "SClaveDestino" IS NOT NULL;

CREATE INDEX "devpware_filas_importaciones_idimportacion_idx" ON "devpware_filas_importaciones"("IdImportacion");
CREATE INDEX "devpware_filas_importaciones_inumerofila_idx" ON "devpware_filas_importaciones"("INumeroFila");
CREATE INDEX "devpware_filas_importaciones_bvalida_idx" ON "devpware_filas_importaciones"("BValida");
CREATE INDEX "devpware_filas_importaciones_baplicada_idx" ON "devpware_filas_importaciones"("BAplicada");
CREATE INDEX "devpware_filas_importaciones_bomitida_idx" ON "devpware_filas_importaciones"("BOmitida");
CREATE INDEX "devpware_filas_importaciones_sidentificador_idx" ON "devpware_filas_importaciones"("SIdentificadorDestino");

CREATE INDEX "devpware_valores_filas_importaciones_idfila_idx" ON "devpware_valores_filas_importaciones"("IdFilaImportacion");
CREATE INDEX "devpware_valores_filas_importaciones_idcolumna_idx" ON "devpware_valores_filas_importaciones"("IdColumnaImportacion");
CREATE INDEX "devpware_valores_filas_importaciones_bvalido_idx" ON "devpware_valores_filas_importaciones"("BValido");

CREATE INDEX "devpware_errores_importaciones_idimportacion_idx" ON "devpware_errores_importaciones"("IdImportacion");
CREATE INDEX "devpware_errores_importaciones_idfila_idx" ON "devpware_errores_importaciones"("IdFilaImportacion");
CREATE INDEX "devpware_errores_importaciones_idcolumna_idx" ON "devpware_errores_importaciones"("IdColumnaImportacion");
CREATE INDEX "devpware_errores_importaciones_scodigoerror_idx" ON "devpware_errores_importaciones"("SCodigoError");
CREATE INDEX "devpware_errores_importaciones_snivel_idx" ON "devpware_errores_importaciones"("SNivel");
CREATE INDEX "devpware_errores_importaciones_bcorregido_idx" ON "devpware_errores_importaciones"("BCorregido");
CREATE INDEX "devpware_errores_importaciones_dfechacreacion_idx" ON "devpware_errores_importaciones"("DFechaCreacion");

CREATE INDEX "devpware_eventos_importaciones_idimportacion_idx" ON "devpware_eventos_importaciones"("IdImportacion");
CREATE INDEX "devpware_eventos_importaciones_idestado_anterior_idx" ON "devpware_eventos_importaciones"("IdEstadoImportacionAnterior");
CREATE INDEX "devpware_eventos_importaciones_idestado_nuevo_idx" ON "devpware_eventos_importaciones"("IdEstadoImportacionNuevo");
CREATE INDEX "devpware_eventos_importaciones_idusuario_idx" ON "devpware_eventos_importaciones"("IdUsuario");
CREATE INDEX "devpware_eventos_importaciones_idtrabajo_idx" ON "devpware_eventos_importaciones"("IdTrabajo");
CREATE INDEX "devpware_eventos_importaciones_dfechaevento_idx" ON "devpware_eventos_importaciones"("DFechaEvento");

CREATE TRIGGER "devpware_eventos_importaciones_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_eventos_importaciones"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

INSERT INTO "devpware_estados_importaciones" (
  "SClave",
  "SNombre",
  "SDescripcion",
  "BEsInicial",
  "BEsProceso",
  "BEsFinal",
  "BEsExitoso",
  "BPermiteReintento",
  "BActivo",
  "IOrden",
  "DFechaCreacion",
  "DFechaModificacion"
) VALUES
  ('CARGADA', 'Cargada', 'Importacion cargada y pendiente de analisis.', true, false, false, false, false, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ANALIZANDO', 'Analizando', 'Importacion en analisis de estructura y contenido.', false, true, false, false, false, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VALIDANDO', 'Validando', 'Importacion en validacion de datos y reglas.', false, true, false, false, false, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CON_ERRORES', 'Con errores', 'Importacion con errores corregibles antes de aplicar.', false, false, false, false, true, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('LISTA_PARA_APLICAR', 'Lista para aplicar', 'Importacion validada y lista para aplicacion controlada.', false, false, false, false, false, true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('APLICANDO', 'Aplicando', 'Importacion en aplicacion transaccional por worker.', false, true, false, false, false, true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COMPLETADA', 'Completada', 'Importacion completada exitosamente.', false, false, true, true, false, true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COMPLETADA_PARCIAL', 'Completada parcial', 'Importacion aplicada parcialmente de forma controlada.', false, false, true, true, false, true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FALLIDA', 'Fallida', 'Importacion finalizada con fallo y susceptible de reintento si aplica.', false, false, true, false, true, true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CANCELADA', 'Cancelada', 'Importacion cancelada antes de su aplicacion final.', false, false, true, false, false, true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BEsInicial" = EXCLUDED."BEsInicial",
  "BEsProceso" = EXCLUDED."BEsProceso",
  "BEsFinal" = EXCLUDED."BEsFinal",
  "BEsExitoso" = EXCLUDED."BEsExitoso",
  "BPermiteReintento" = EXCLUDED."BPermiteReintento",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_importaciones" (
  "SClave",
  "SNombre",
  "SDescripcion",
  "BRequiereAvaluo",
  "BRequiereVersionAvaluo",
  "BPermiteAplicacionParcial",
  "BActivo",
  "JConfiguracionEsperada",
  "DFechaCreacion",
  "DFechaModificacion"
) VALUES
  ('PROPIEDADES', 'Propiedades', 'Importacion de propiedades base.', false, false, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PUBLICACIONES', 'Publicaciones', 'Importacion de publicaciones de propiedades.', false, false, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COMPARABLES', 'Comparables', 'Importacion de comparables asociados a valuacion.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CAMPOS_PERSONALIZADOS', 'Campos personalizados', 'Importacion de valores para campos personalizados.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TABLA_DOCUMENTO', 'Tabla de documento', 'Importacion de datos tabulares de documento.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COSTOS_TERRENO', 'Costos de terreno', 'Importacion de costos de terreno.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COSTOS_CONSTRUCCION', 'Costos de construccion', 'Importacion de costos de construccion.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COSTOS_INSTALACIONES', 'Costos de instalaciones', 'Importacion de costos de instalaciones especiales.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DATOS_TECNICOS', 'Datos tecnicos', 'Importacion de datos tecnicos de avaluo.', true, true, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CATALOGO_AUXILIAR', 'Catalogo auxiliar', 'Importacion de catalogo auxiliar controlado por backend.', false, false, false, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BRequiereAvaluo" = EXCLUDED."BRequiereAvaluo",
  "BRequiereVersionAvaluo" = EXCLUDED."BRequiereVersionAvaluo",
  "BPermiteAplicacionParcial" = EXCLUDED."BPermiteAplicacionParcial",
  "BActivo" = EXCLUDED."BActivo",
  "JConfiguracionEsperada" = EXCLUDED."JConfiguracionEsperada",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

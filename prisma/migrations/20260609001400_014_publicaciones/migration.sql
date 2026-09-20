-- Migracion 014_publicaciones

CREATE TABLE "devpware_estados_publicaciones" (
  "IdEstadoPublicacion" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BDisponible" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_estados_publicaciones_pkey" PRIMARY KEY ("IdEstadoPublicacion"),
  CONSTRAINT "devpware_estados_publicaciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_publicaciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_estados_publicaciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_estados_publicaciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_estados_publicaciones_BDisponible_idx" ON "devpware_estados_publicaciones" ("BDisponible");
CREATE INDEX "devpware_estados_publicaciones_BEsFinal_idx" ON "devpware_estados_publicaciones" ("BEsFinal");
CREATE INDEX "devpware_estados_publicaciones_BActivo_idx" ON "devpware_estados_publicaciones" ("BActivo");
CREATE INDEX "devpware_estados_publicaciones_IOrden_idx" ON "devpware_estados_publicaciones" ("IOrden");

CREATE TABLE "devpware_publicaciones_propiedades" (
  "IdPublicacionPropiedad" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdPropiedad" INTEGER NOT NULL,
  "IdFuenteInmobiliaria" INTEGER NOT NULL,
  "IdTipoOperacion" INTEGER NOT NULL,
  "IdEstadoPublicacion" INTEGER NOT NULL,
  "SIdentificadorExterno" VARCHAR(220),
  "SURL" TEXT NOT NULL,
  "STitulo" VARCHAR(500),
  "SDescripcion" TEXT,
  "NPrecio" NUMERIC(24,2),
  "SMoneda" VARCHAR(10) NOT NULL DEFAULT 'MXN',
  "SNombreContacto" VARCHAR(220),
  "STelefonoContacto" VARCHAR(60),
  "SCorreoContacto" VARCHAR(220),
  "DFechaPublicacion" TIMESTAMPTZ(3),
  "DFechaPrimeraConsulta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaUltimaConsulta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaRetiro" TIMESTAMPTZ(3),
  "JDatosOriginales" JSONB,
  "JDatosNormalizados" JSONB,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_publicaciones_propiedades_pkey" PRIMARY KEY ("IdPublicacionPropiedad"),
  CONSTRAINT "devpware_publicaciones_propiedades_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_publicaciones_propiedades_SURL_check" CHECK (btrim("SURL") <> ''),
  CONSTRAINT "devpware_publicaciones_propiedades_SMoneda_check" CHECK (btrim("SMoneda") <> ''),
  CONSTRAINT "devpware_publicaciones_propiedades_NPrecio_check" CHECK ("NPrecio" IS NULL OR "NPrecio" >= 0),
  CONSTRAINT "devpware_publicaciones_propiedades_consultas_check" CHECK ("DFechaUltimaConsulta" >= "DFechaPrimeraConsulta"),
  CONSTRAINT "devpware_publicaciones_propiedades_retiro_check" CHECK ("DFechaRetiro" IS NULL OR "DFechaRetiro" >= "DFechaPrimeraConsulta"),
  CONSTRAINT "devpware_publicaciones_propiedades_IdPropiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_pub_prop_fuente_fkey" FOREIGN KEY ("IdFuenteInmobiliaria") REFERENCES "devpware_fuentes_inmobiliarias" ("IdFuenteInmobiliaria") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_pub_prop_tipo_operacion_fkey" FOREIGN KEY ("IdTipoOperacion") REFERENCES "devpware_tipos_operaciones" ("IdTipoOperacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_pub_prop_estado_fkey" FOREIGN KEY ("IdEstadoPublicacion") REFERENCES "devpware_estados_publicaciones" ("IdEstadoPublicacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devpware_pub_prop_fuente_identificador_key" ON "devpware_publicaciones_propiedades" ("IdFuenteInmobiliaria", "SIdentificadorExterno") WHERE "SIdentificadorExterno" IS NOT NULL AND "DFechaEliminacion" IS NULL;
CREATE INDEX "devpware_publicaciones_propiedades_IdPropiedad_idx" ON "devpware_publicaciones_propiedades" ("IdPropiedad");
CREATE INDEX "devpware_pub_prop_IdFuenteInmobiliaria_idx" ON "devpware_publicaciones_propiedades" ("IdFuenteInmobiliaria");
CREATE INDEX "devpware_publicaciones_propiedades_IdTipoOperacion_idx" ON "devpware_publicaciones_propiedades" ("IdTipoOperacion");
CREATE INDEX "devpware_publicaciones_propiedades_IdEstado_idx" ON "devpware_publicaciones_propiedades" ("IdEstadoPublicacion");
CREATE INDEX "devpware_publicaciones_propiedades_SURL_idx" ON "devpware_publicaciones_propiedades" ("SURL");
CREATE INDEX "devpware_publicaciones_propiedades_NPrecio_idx" ON "devpware_publicaciones_propiedades" ("NPrecio");
CREATE INDEX "devpware_publicaciones_propiedades_SMoneda_idx" ON "devpware_publicaciones_propiedades" ("SMoneda");
CREATE INDEX "devpware_publicaciones_propiedades_DFechaPublicacion_idx" ON "devpware_publicaciones_propiedades" ("DFechaPublicacion");
CREATE INDEX "devpware_publicaciones_propiedades_DFechaUltima_idx" ON "devpware_publicaciones_propiedades" ("DFechaUltimaConsulta");
CREATE INDEX "devpware_publicaciones_propiedades_BActivo_idx" ON "devpware_publicaciones_propiedades" ("BActivo");
CREATE INDEX "devpware_publicaciones_propiedades_DFechaEliminacion_idx" ON "devpware_publicaciones_propiedades" ("DFechaEliminacion");

CREATE TABLE "devpware_historiales_publicaciones" (
  "IdHistorialPublicacion" BIGSERIAL NOT NULL,
  "IdPublicacionPropiedad" BIGINT NOT NULL,
  "IdEstadoPublicacionAnterior" INTEGER,
  "IdEstadoPublicacionNuevo" INTEGER NOT NULL,
  "NPrecioAnterior" NUMERIC(24,2),
  "NPrecioNuevo" NUMERIC(24,2),
  "JDatosAnteriores" JSONB,
  "JDatosNuevos" JSONB,
  "SMotivoCambio" VARCHAR(1000),
  "DFechaCambio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_historiales_publicaciones_pkey" PRIMARY KEY ("IdHistorialPublicacion"),
  CONSTRAINT "devpware_hist_publicaciones_precios_check" CHECK (
    ("NPrecioAnterior" IS NULL OR "NPrecioAnterior" >= 0) AND
    ("NPrecioNuevo" IS NULL OR "NPrecioNuevo" >= 0)
  ),
  CONSTRAINT "devpware_hist_publicaciones_cambio_check" CHECK (
    "IdEstadoPublicacionAnterior" IS NULL OR
    "IdEstadoPublicacionAnterior" <> "IdEstadoPublicacionNuevo" OR
    "NPrecioAnterior" IS DISTINCT FROM "NPrecioNuevo" OR
    "JDatosAnteriores" IS DISTINCT FROM "JDatosNuevos" OR
    ("SMotivoCambio" IS NOT NULL AND btrim("SMotivoCambio") <> '')
  ),
  CONSTRAINT "devpware_hist_publicaciones_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_publicaciones_estado_ant_fkey" FOREIGN KEY ("IdEstadoPublicacionAnterior") REFERENCES "devpware_estados_publicaciones" ("IdEstadoPublicacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_publicaciones_estado_nuevo_fkey" FOREIGN KEY ("IdEstadoPublicacionNuevo") REFERENCES "devpware_estados_publicaciones" ("IdEstadoPublicacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_hist_publicaciones_Publicacion_idx" ON "devpware_historiales_publicaciones" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_hist_publicaciones_EstadoAnterior_idx" ON "devpware_historiales_publicaciones" ("IdEstadoPublicacionAnterior");
CREATE INDEX "devpware_hist_publicaciones_EstadoNuevo_idx" ON "devpware_historiales_publicaciones" ("IdEstadoPublicacionNuevo");
CREATE INDEX "devpware_historiales_publicaciones_DFechaCambio_idx" ON "devpware_historiales_publicaciones" ("DFechaCambio");

CREATE TABLE "devpware_imagenes_publicaciones" (
  "IdImagenPublicacion" BIGSERIAL NOT NULL,
  "IdPublicacionPropiedad" BIGINT NOT NULL,
  "IdArchivo" BIGINT,
  "SURLOrigen" TEXT,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "BPrincipal" BOOLEAN NOT NULL DEFAULT false,
  "BPermitidaParaReporte" BOOLEAN NOT NULL DEFAULT false,
  "BConfirmada" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCaptura" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_imagenes_publicaciones_pkey" PRIMARY KEY ("IdImagenPublicacion"),
  CONSTRAINT "devpware_imagenes_publicaciones_origen_check" CHECK ("IdArchivo" IS NOT NULL OR ("SURLOrigen" IS NOT NULL AND btrim("SURLOrigen") <> '')),
  CONSTRAINT "devpware_imagenes_publicaciones_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_imagenes_publicaciones_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_imagenes_publicaciones_IdArchivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devpware_imagenes_publicaciones_principal_key" ON "devpware_imagenes_publicaciones" ("IdPublicacionPropiedad") WHERE "BPrincipal" = true;
CREATE INDEX "devpware_imagenes_publicaciones_Publicacion_idx" ON "devpware_imagenes_publicaciones" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_imagenes_publicaciones_IdArchivo_idx" ON "devpware_imagenes_publicaciones" ("IdArchivo");
CREATE INDEX "devpware_imagenes_publicaciones_IOrden_idx" ON "devpware_imagenes_publicaciones" ("IOrden");
CREATE INDEX "devpware_imagenes_publicaciones_BPrincipal_idx" ON "devpware_imagenes_publicaciones" ("BPrincipal");
CREATE INDEX "devpware_imagenes_publicaciones_BReporte_idx" ON "devpware_imagenes_publicaciones" ("BPermitidaParaReporte");
CREATE INDEX "devpware_imagenes_publicaciones_BConfirmada_idx" ON "devpware_imagenes_publicaciones" ("BConfirmada");

INSERT INTO "devpware_estados_publicaciones" ("SClave", "SNombre", "SDescripcion", "BDisponible", "BEsFinal", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('ACTIVA', 'Activa', 'Publicacion disponible.', true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INACTIVA', 'Inactiva', 'Publicacion no disponible temporalmente.', false, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RETIRADA', 'Retirada', 'Publicacion retirada.', false, true, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VENDIDA', 'Vendida', 'Publicacion vendida.', false, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RENTADA', 'Rentada', 'Publicacion rentada.', false, true, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DESCONOCIDA', 'Desconocida', 'Estado de publicacion desconocido.', false, false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BDisponible" = EXCLUDED."BDisponible",
  "BEsFinal" = EXCLUDED."BEsFinal",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

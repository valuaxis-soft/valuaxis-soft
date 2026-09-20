-- Migracion 013_propiedades

CREATE TABLE "devpware_propiedades" (
  "IdPropiedad" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdTipoInmueble" INTEGER NOT NULL,
  "SNombre" VARCHAR(220),
  "SDescripcion" TEXT,
  "NSuperficieTerreno" NUMERIC(18,4),
  "NSuperficieConstruccion" NUMERIC(18,4),
  "NSuperficieRentable" NUMERIC(18,4),
  "NEdad" NUMERIC(10,2),
  "IRecamaras" INTEGER,
  "IBanosCompletos" INTEGER,
  "IMediosBanos" INTEGER,
  "IEstacionamientos" INTEGER,
  "INumeroNiveles" INTEGER,
  "INumeroFrentes" INTEGER,
  "NFrente" NUMERIC(18,4),
  "NFondo" NUMERIC(18,4),
  "SForma" VARCHAR(180),
  "STopografia" VARCHAR(180),
  "SUsoSuelo" VARCHAR(220),
  "SZona" VARCHAR(220),
  "SConservacion" VARCHAR(180),
  "SCalidad" VARCHAR(180),
  "BPrivada" BOOLEAN NOT NULL DEFAULT true,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "JCaracteristicas" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_propiedades_pkey" PRIMARY KEY ("IdPropiedad"),
  CONSTRAINT "devpware_propiedades_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_propiedades_no_negativos_check" CHECK (
    ("NSuperficieTerreno" IS NULL OR "NSuperficieTerreno" >= 0) AND
    ("NSuperficieConstruccion" IS NULL OR "NSuperficieConstruccion" >= 0) AND
    ("NSuperficieRentable" IS NULL OR "NSuperficieRentable" >= 0) AND
    ("NEdad" IS NULL OR "NEdad" >= 0) AND
    ("IRecamaras" IS NULL OR "IRecamaras" >= 0) AND
    ("IBanosCompletos" IS NULL OR "IBanosCompletos" >= 0) AND
    ("IMediosBanos" IS NULL OR "IMediosBanos" >= 0) AND
    ("IEstacionamientos" IS NULL OR "IEstacionamientos" >= 0) AND
    ("INumeroNiveles" IS NULL OR "INumeroNiveles" >= 0) AND
    ("INumeroFrentes" IS NULL OR "INumeroFrentes" >= 0) AND
    ("NFrente" IS NULL OR "NFrente" >= 0) AND
    ("NFondo" IS NULL OR "NFondo" >= 0)
  ),
  CONSTRAINT "devpware_propiedades_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_propiedades_IdTipoInmueble_fkey" FOREIGN KEY ("IdTipoInmueble") REFERENCES "devpware_tipos_inmuebles" ("IdTipoInmueble") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_propiedades_IdOrganizacion_idx" ON "devpware_propiedades" ("IdOrganizacion");
CREATE INDEX "devpware_propiedades_IdTipoInmueble_idx" ON "devpware_propiedades" ("IdTipoInmueble");
CREATE INDEX "devpware_propiedades_BPrivada_idx" ON "devpware_propiedades" ("BPrivada");
CREATE INDEX "devpware_propiedades_BActiva_idx" ON "devpware_propiedades" ("BActiva");
CREATE INDEX "devpware_propiedades_NSuperficieTerreno_idx" ON "devpware_propiedades" ("NSuperficieTerreno");
CREATE INDEX "devpware_propiedades_NSuperficieConstruccion_idx" ON "devpware_propiedades" ("NSuperficieConstruccion");
CREATE INDEX "devpware_propiedades_NSuperficieRentable_idx" ON "devpware_propiedades" ("NSuperficieRentable");
CREATE INDEX "devpware_propiedades_DFechaEliminacion_idx" ON "devpware_propiedades" ("DFechaEliminacion");

ALTER TABLE "devpware_avaluos" ADD COLUMN "IdPropiedadSujeto" INTEGER;
ALTER TABLE "devpware_avaluos" ADD CONSTRAINT "devpware_avaluos_IdPropiedadSujeto_fkey" FOREIGN KEY ("IdPropiedadSujeto") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "devpware_avaluos_IdPropiedadSujeto_idx" ON "devpware_avaluos" ("IdPropiedadSujeto");

CREATE TABLE "devpware_direcciones_propiedades" (
  "IdDireccionPropiedad" BIGSERIAL NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "IdOrigenDato" INTEGER NOT NULL,
  "SCalle" VARCHAR(220),
  "SNumeroExterior" VARCHAR(80),
  "SNumeroInterior" VARCHAR(80),
  "SColonia" VARCHAR(220),
  "SCodigoPostal" VARCHAR(20),
  "SMunicipio" VARCHAR(220),
  "SEstado" VARCHAR(220),
  "SPais" VARCHAR(120) NOT NULL DEFAULT 'México',
  "SDireccionCompleta" TEXT NOT NULL,
  "SReferencia" TEXT,
  "NLatitud" NUMERIC(10,7) NOT NULL,
  "NLongitud" NUMERIC(10,7) NOT NULL,
  "NPrecisionMetros" NUMERIC(18,4),
  "GUbicacion" geography(Point,4326) NOT NULL,
  "BEsDireccionActual" BOOLEAN NOT NULL DEFAULT true,
  "BConfirmada" BOOLEAN NOT NULL DEFAULT false,
  "IdUsuarioConfirmacion" INTEGER,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaConfirmacion" TIMESTAMPTZ(3),
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_direcciones_propiedades_pkey" PRIMARY KEY ("IdDireccionPropiedad"),
  CONSTRAINT "devpware_direcciones_propiedades_direccion_check" CHECK (btrim("SDireccionCompleta") <> ''),
  CONSTRAINT "devpware_direcciones_propiedades_latitud_check" CHECK ("NLatitud" BETWEEN -90 AND 90),
  CONSTRAINT "devpware_direcciones_propiedades_longitud_check" CHECK ("NLongitud" BETWEEN -180 AND 180),
  CONSTRAINT "devpware_direcciones_propiedades_precision_check" CHECK ("NPrecisionMetros" IS NULL OR "NPrecisionMetros" >= 0),
  CONSTRAINT "devpware_direcciones_propiedades_confirmacion_check" CHECK ("BConfirmada" = false OR ("IdUsuarioConfirmacion" IS NOT NULL AND "DFechaConfirmacion" IS NOT NULL)),
  CONSTRAINT "devpware_direcciones_propiedades_IdPropiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_direcciones_propiedades_IdOrigenDato_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_direcciones_propiedades_IdUsuarioConfirmacion_fkey" FOREIGN KEY ("IdUsuarioConfirmacion") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_direcciones_propiedades_IdPropiedad_idx" ON "devpware_direcciones_propiedades" ("IdPropiedad");
CREATE INDEX "devpware_direcciones_propiedades_IdOrigenDato_idx" ON "devpware_direcciones_propiedades" ("IdOrigenDato");
CREATE INDEX "devpware_direcciones_propiedades_IdUsuarioConfirmacion_idx" ON "devpware_direcciones_propiedades" ("IdUsuarioConfirmacion");
CREATE INDEX "devpware_direcciones_propiedades_SCodigoPostal_idx" ON "devpware_direcciones_propiedades" ("SCodigoPostal");
CREATE INDEX "devpware_direcciones_propiedades_SMunicipio_idx" ON "devpware_direcciones_propiedades" ("SMunicipio");
CREATE INDEX "devpware_direcciones_propiedades_SEstado_idx" ON "devpware_direcciones_propiedades" ("SEstado");
CREATE INDEX "devpware_direcciones_propiedades_BEsActual_idx" ON "devpware_direcciones_propiedades" ("BEsDireccionActual");
CREATE INDEX "devpware_direcciones_propiedades_BConfirmada_idx" ON "devpware_direcciones_propiedades" ("BConfirmada");
CREATE UNIQUE INDEX "devpware_direcciones_propiedades_actual_key" ON "devpware_direcciones_propiedades" ("IdPropiedad") WHERE "BEsDireccionActual" = true;
CREATE INDEX "devpware_direcciones_propiedades_GUbicacion_gist_idx" ON "devpware_direcciones_propiedades" USING GIST ("GUbicacion");
CREATE INDEX "devpware_direcciones_propiedades_dir_trgm_idx" ON "devpware_direcciones_propiedades" USING GIN ("SDireccionCompleta" gin_trgm_ops);

CREATE OR REPLACE FUNCTION "devpware_sincronizar_gubicacion_direccion_propiedad"()
RETURNS trigger AS $$
BEGIN
  NEW."GUbicacion" := ST_SetSRID(
    ST_MakePoint(NEW."NLongitud", NEW."NLatitud"),
    4326
  )::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "devpware_direcciones_propiedades_sync_gubicacion"
BEFORE INSERT OR UPDATE OF "NLongitud", "NLatitud" ON "devpware_direcciones_propiedades"
FOR EACH ROW
EXECUTE FUNCTION "devpware_sincronizar_gubicacion_direccion_propiedad"();

CREATE TABLE "devpware_motivos_correcciones_ubicaciones" (
  "IdMotivoCorreccionUbicacion" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_motivos_correcciones_ubicaciones_pkey" PRIMARY KEY ("IdMotivoCorreccionUbicacion"),
  CONSTRAINT "devpware_motivos_correcciones_ubicaciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_motivos_correcciones_ubicaciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_motivos_correcciones_ubicaciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_motivos_correcciones_ubicaciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_motivos_correcciones_ubicaciones_BActivo_idx" ON "devpware_motivos_correcciones_ubicaciones" ("BActivo");
CREATE INDEX "devpware_motivos_correcciones_ubicaciones_IOrden_idx" ON "devpware_motivos_correcciones_ubicaciones" ("IOrden");

CREATE TABLE "devpware_historiales_ubicaciones_propiedades" (
  "IdHistorialUbicacionPropiedad" BIGSERIAL NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "IdDireccionAnterior" BIGINT,
  "IdDireccionNueva" BIGINT NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdMotivoCorreccionUbicacion" INTEGER NOT NULL,
  "SMotivoDetalle" VARCHAR(1000),
  "NLatitudAnterior" NUMERIC(10,7),
  "NLongitudAnterior" NUMERIC(10,7),
  "NLatitudNueva" NUMERIC(10,7) NOT NULL,
  "NLongitudNueva" NUMERIC(10,7) NOT NULL,
  "NDistanciaCorreccionMetros" NUMERIC(18,4),
  "BConfirmadaVisualmente" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCorreccion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_hist_ubic_propiedades_pkey" PRIMARY KEY ("IdHistorialUbicacionPropiedad"),
  CONSTRAINT "devpware_hist_ubic_propiedades_coords_check" CHECK (
    ("NLatitudAnterior" IS NULL OR "NLatitudAnterior" BETWEEN -90 AND 90) AND
    ("NLongitudAnterior" IS NULL OR "NLongitudAnterior" BETWEEN -180 AND 180) AND
    "NLatitudNueva" BETWEEN -90 AND 90 AND
    "NLongitudNueva" BETWEEN -180 AND 180
  ),
  CONSTRAINT "devpware_hist_ubic_propiedades_distancia_check" CHECK ("NDistanciaCorreccionMetros" IS NULL OR "NDistanciaCorreccionMetros" >= 0),
  CONSTRAINT "devpware_hist_ubic_propiedades_direcciones_check" CHECK ("IdDireccionAnterior" IS NULL OR "IdDireccionAnterior" <> "IdDireccionNueva"),
  CONSTRAINT "devpware_hist_ubic_propiedades_IdPropiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_ubic_propiedades_dir_ant_fkey" FOREIGN KEY ("IdDireccionAnterior") REFERENCES "devpware_direcciones_propiedades" ("IdDireccionPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_ubic_propiedades_dir_nueva_fkey" FOREIGN KEY ("IdDireccionNueva") REFERENCES "devpware_direcciones_propiedades" ("IdDireccionPropiedad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_ubic_propiedades_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_ubic_propiedades_motivo_fkey" FOREIGN KEY ("IdMotivoCorreccionUbicacion") REFERENCES "devpware_motivos_correcciones_ubicaciones" ("IdMotivoCorreccionUbicacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_hist_ubic_propiedades_IdPropiedad_idx" ON "devpware_historiales_ubicaciones_propiedades" ("IdPropiedad");
CREATE INDEX "devpware_hist_ubic_propiedades_DirAnterior_idx" ON "devpware_historiales_ubicaciones_propiedades" ("IdDireccionAnterior");
CREATE INDEX "devpware_hist_ubic_propiedades_DirNueva_idx" ON "devpware_historiales_ubicaciones_propiedades" ("IdDireccionNueva");
CREATE INDEX "devpware_hist_ubic_propiedades_IdUsuario_idx" ON "devpware_historiales_ubicaciones_propiedades" ("IdUsuario");
CREATE INDEX "devpware_hist_ubic_propiedades_Motivo_idx" ON "devpware_historiales_ubicaciones_propiedades" ("IdMotivoCorreccionUbicacion");
CREATE INDEX "devpware_hist_ubic_propiedades_DFechaCorreccion_idx" ON "devpware_historiales_ubicaciones_propiedades" ("DFechaCorreccion");

CREATE TABLE "devpware_caracteristicas_propiedades" (
  "IdCaracteristicaPropiedad" BIGSERIAL NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SValor" TEXT,
  "NValorNumerico" NUMERIC(24,8),
  "BValorBooleano" BOOLEAN,
  "DValorFecha" TIMESTAMPTZ(3),
  "JValorComplejo" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_caracteristicas_propiedades_pkey" PRIMARY KEY ("IdCaracteristicaPropiedad"),
  CONSTRAINT "devpware_caracteristicas_propiedades_IdPropiedad_SClave_key" UNIQUE ("IdPropiedad", "SClave"),
  CONSTRAINT "devpware_caracteristicas_propiedades_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_caracteristicas_propiedades_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_caracteristicas_propiedades_un_valor_check" CHECK (
    num_nonnulls("SValor", "NValorNumerico", "BValorBooleano", "DValorFecha", "JValorComplejo") <= 1
  ),
  CONSTRAINT "devpware_caracteristicas_propiedades_IdPropiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_caracteristicas_propiedades_IdPropiedad_idx" ON "devpware_caracteristicas_propiedades" ("IdPropiedad");
CREATE INDEX "devpware_caracteristicas_propiedades_SClave_idx" ON "devpware_caracteristicas_propiedades" ("SClave");
CREATE INDEX "devpware_caracteristicas_propiedades_DFechaModificacion_idx" ON "devpware_caracteristicas_propiedades" ("DFechaModificacion");

CREATE TABLE "devpware_fuentes_inmobiliarias" (
  "IdFuenteInmobiliaria" SERIAL NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SSitioWeb" VARCHAR(500),
  "STipoIntegracion" VARCHAR(120),
  "BAPIOficial" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteAlmacenamiento" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteImagenes" BOOLEAN NOT NULL DEFAULT false,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_fuentes_inmobiliarias_pkey" PRIMARY KEY ("IdFuenteInmobiliaria"),
  CONSTRAINT "devpware_fuentes_inmobiliarias_SNombre_key" UNIQUE ("SNombre"),
  CONSTRAINT "devpware_fuentes_inmobiliarias_SNombre_check" CHECK (btrim("SNombre") <> '')
);
CREATE INDEX "devpware_fuentes_inmobiliarias_BAPIOficial_idx" ON "devpware_fuentes_inmobiliarias" ("BAPIOficial");
CREATE INDEX "devpware_fuentes_inmobiliarias_BPermiteAlmacenamiento_idx" ON "devpware_fuentes_inmobiliarias" ("BPermiteAlmacenamiento");
CREATE INDEX "devpware_fuentes_inmobiliarias_BPermiteImagenes_idx" ON "devpware_fuentes_inmobiliarias" ("BPermiteImagenes");
CREATE INDEX "devpware_fuentes_inmobiliarias_BActiva_idx" ON "devpware_fuentes_inmobiliarias" ("BActiva");

INSERT INTO "devpware_motivos_correcciones_ubicaciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('PUNTO_CENTRO_COLONIA', 'Punto al centro de colonia', 'La ubicacion automatica corresponde al centroide de la colonia.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('NUMERO_INEXACTO', 'Numero inexacto', 'El numero exterior no coincide con la ubicacion real.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CALLE_INCORRECTA', 'Calle incorrecta', 'La calle detectada no corresponde con la propiedad.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CODIGO_POSTAL_INSUFICIENTE', 'Codigo postal insuficiente', 'El codigo postal no permite ubicar con precision la propiedad.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('UBICACION_VISUAL_CONFIRMADA', 'Ubicacion visual confirmada', 'La ubicacion fue ajustada y confirmada visualmente.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DIRECCION_INCOMPLETA', 'Direccion incompleta', 'La direccion inicial estaba incompleta.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OTRO', 'Otro', 'Otro motivo de correccion de ubicacion.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

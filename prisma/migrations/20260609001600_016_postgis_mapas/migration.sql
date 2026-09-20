-- Migracion 016_postgis_mapas

CREATE TABLE "devpware_tipos_busquedas_geograficas" (
  "IdTipoBusquedaGeografica" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BRequiereRadio" BOOLEAN NOT NULL DEFAULT false,
  "BRequierePoligono" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_busquedas_geograficas_pkey" PRIMARY KEY ("IdTipoBusquedaGeografica"),
  CONSTRAINT "devpware_tipos_busquedas_geograficas_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_busquedas_geograficas_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_busquedas_geograficas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_busquedas_geograficas_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_tipos_busquedas_geograficas_modo_check" CHECK (NOT ("BRequiereRadio" = true AND "BRequierePoligono" = true))
);
CREATE INDEX "devpware_tipos_busquedas_geograficas_BActivo_idx" ON "devpware_tipos_busquedas_geograficas" ("BActivo");
CREATE INDEX "devpware_tipos_busquedas_geograficas_IOrden_idx" ON "devpware_tipos_busquedas_geograficas" ("IOrden");

CREATE TABLE "devpware_busquedas_comparables" (
  "IdBusquedaComparable" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdTipoBusquedaGeografica" INTEGER NOT NULL,
  "IdTipoComparable" INTEGER,
  "GCentroBusqueda" geography(Point,4326),
  "GPoligonoBusqueda" geometry(Polygon,4326),
  "NLatitudCentro" NUMERIC(10,7),
  "NLongitudCentro" NUMERIC(10,7),
  "NRadioMetros" NUMERIC(18,4),
  "SCodigoPostal" VARCHAR(20),
  "SMunicipio" VARCHAR(220),
  "SColonia" VARCHAR(220),
  "NPrecioMinimo" NUMERIC(24,2),
  "NPrecioMaximo" NUMERIC(24,2),
  "NSuperficieMinima" NUMERIC(18,4),
  "NSuperficieMaxima" NUMERIC(18,4),
  "NDistanciaMaximaMetros" NUMERIC(18,4),
  "ILimiteResultados" INTEGER NOT NULL DEFAULT 100,
  "JFiltros" JSONB,
  "ITotalResultados" INTEGER NOT NULL DEFAULT 0,
  "DFechaEjecucion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_busquedas_comparables_pkey" PRIMARY KEY ("IdBusquedaComparable"),
  CONSTRAINT "devpware_busquedas_comparables_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_busquedas_comparables_latitud_check" CHECK ("NLatitudCentro" IS NULL OR "NLatitudCentro" BETWEEN -90 AND 90),
  CONSTRAINT "devpware_busquedas_comparables_longitud_check" CHECK ("NLongitudCentro" IS NULL OR "NLongitudCentro" BETWEEN -180 AND 180),
  CONSTRAINT "devpware_busquedas_comparables_no_negativos_check" CHECK (
    ("NRadioMetros" IS NULL OR "NRadioMetros" >= 0) AND
    ("NPrecioMinimo" IS NULL OR "NPrecioMinimo" >= 0) AND
    ("NPrecioMaximo" IS NULL OR "NPrecioMaximo" >= 0) AND
    ("NSuperficieMinima" IS NULL OR "NSuperficieMinima" >= 0) AND
    ("NSuperficieMaxima" IS NULL OR "NSuperficieMaxima" >= 0) AND
    ("NDistanciaMaximaMetros" IS NULL OR "NDistanciaMaximaMetros" >= 0)
  ),
  CONSTRAINT "devpware_busquedas_comparables_rangos_check" CHECK (
    ("NPrecioMinimo" IS NULL OR "NPrecioMaximo" IS NULL OR "NPrecioMaximo" >= "NPrecioMinimo") AND
    ("NSuperficieMinima" IS NULL OR "NSuperficieMaxima" IS NULL OR "NSuperficieMaxima" >= "NSuperficieMinima")
  ),
  CONSTRAINT "devpware_busquedas_comparables_limite_check" CHECK ("ILimiteResultados" BETWEEN 1 AND 1000),
  CONSTRAINT "devpware_busquedas_comparables_total_check" CHECK ("ITotalResultados" >= 0),
  CONSTRAINT "devpware_busq_comp_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_busq_comp_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_busq_comp_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_busq_comp_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_busq_comp_tipo_busqueda_fkey" FOREIGN KEY ("IdTipoBusquedaGeografica") REFERENCES "devpware_tipos_busquedas_geograficas" ("IdTipoBusquedaGeografica") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_busq_comp_tipo_comparable_fkey" FOREIGN KEY ("IdTipoComparable") REFERENCES "devpware_tipos_comparables" ("IdTipoComparable") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_busq_comp_IdOrganizacion_idx" ON "devpware_busquedas_comparables" ("IdOrganizacion");
CREATE INDEX "devpware_busq_comp_IdAvaluo_idx" ON "devpware_busquedas_comparables" ("IdAvaluo");
CREATE INDEX "devpware_busq_comp_IdVersion_idx" ON "devpware_busquedas_comparables" ("IdVersionAvaluo");
CREATE INDEX "devpware_busq_comp_IdUsuario_idx" ON "devpware_busquedas_comparables" ("IdUsuario");
CREATE INDEX "devpware_busq_comp_IdTipoBusqueda_idx" ON "devpware_busquedas_comparables" ("IdTipoBusquedaGeografica");
CREATE INDEX "devpware_busq_comp_IdTipoComparable_idx" ON "devpware_busquedas_comparables" ("IdTipoComparable");
CREATE INDEX "devpware_busq_comp_SCodigoPostal_idx" ON "devpware_busquedas_comparables" ("SCodigoPostal");
CREATE INDEX "devpware_busq_comp_SMunicipio_idx" ON "devpware_busquedas_comparables" ("SMunicipio");
CREATE INDEX "devpware_busq_comp_SColonia_idx" ON "devpware_busquedas_comparables" ("SColonia");
CREATE INDEX "devpware_busq_comp_DFechaEjecucion_idx" ON "devpware_busquedas_comparables" ("DFechaEjecucion");
CREATE INDEX "devpware_busq_comp_GCentro_gist_idx" ON "devpware_busquedas_comparables" USING GIST ("GCentroBusqueda");
CREATE INDEX "devpware_busq_comp_GPoligono_gist_idx" ON "devpware_busquedas_comparables" USING GIST ("GPoligonoBusqueda");

CREATE TABLE "devpware_resultados_busquedas_comparables" (
  "IdResultadoBusquedaComparable" BIGSERIAL NOT NULL,
  "IdBusquedaComparable" BIGINT NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "IdPublicacionPropiedad" BIGINT,
  "IPosicion" INTEGER NOT NULL,
  "NDistanciaMetros" NUMERIC(18,4),
  "NPorcentajeSimilitud" NUMERIC(8,4),
  "NPrecio" NUMERIC(24,2),
  "NSuperficieReferencia" NUMERIC(18,4),
  "NValorUnitario" NUMERIC(24,8),
  "BPasaFiltros" BOOLEAN NOT NULL DEFAULT true,
  "BSeleccionadoComoComparable" BOOLEAN NOT NULL DEFAULT false,
  "IdComparableAvaluo" BIGINT,
  "JResumenPropiedad" JSONB NOT NULL,
  "JResumenPublicacion" JSONB,
  "JExplicacionCoincidencia" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_resultados_busquedas_comparables_pkey" PRIMARY KEY ("IdResultadoBusquedaComparable"),
  CONSTRAINT "devpware_resultados_busq_comp_busq_prop_pub_key" UNIQUE ("IdBusquedaComparable", "IdPropiedad", "IdPublicacionPropiedad"),
  CONSTRAINT "devpware_resultados_busq_comp_posicion_check" CHECK ("IPosicion" >= 1),
  CONSTRAINT "devpware_resultados_busq_comp_no_negativos_check" CHECK (
    ("NDistanciaMetros" IS NULL OR "NDistanciaMetros" >= 0) AND
    ("NPrecio" IS NULL OR "NPrecio" >= 0) AND
    ("NSuperficieReferencia" IS NULL OR "NSuperficieReferencia" >= 0) AND
    ("NValorUnitario" IS NULL OR "NValorUnitario" >= 0)
  ),
  CONSTRAINT "devpware_resultados_busq_comp_similitud_check" CHECK ("NPorcentajeSimilitud" IS NULL OR ("NPorcentajeSimilitud" >= 0 AND "NPorcentajeSimilitud" <= 100)),
  CONSTRAINT "devpware_resultados_busq_comp_resumen_check" CHECK (jsonb_typeof("JResumenPropiedad") <> 'null'),
  CONSTRAINT "devpware_resultados_busq_comp_seleccion_check" CHECK ("BSeleccionadoComoComparable" = false OR "IdComparableAvaluo" IS NOT NULL),
  CONSTRAINT "devpware_resultados_busq_comp_busqueda_fkey" FOREIGN KEY ("IdBusquedaComparable") REFERENCES "devpware_busquedas_comparables" ("IdBusquedaComparable") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_resultados_busq_comp_propiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_resultados_busq_comp_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_resultados_busq_comp_comparable_fkey" FOREIGN KEY ("IdComparableAvaluo") REFERENCES "devpware_comparables_avaluos" ("IdComparableAvaluo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devpware_resultados_busq_comp_sin_pub_key" ON "devpware_resultados_busquedas_comparables" ("IdBusquedaComparable", "IdPropiedad") WHERE "IdPublicacionPropiedad" IS NULL;
CREATE UNIQUE INDEX "devpware_resultados_busq_comp_comparable_key" ON "devpware_resultados_busquedas_comparables" ("IdComparableAvaluo") WHERE "IdComparableAvaluo" IS NOT NULL;
CREATE INDEX "devpware_resultados_busq_comp_IdBusqueda_idx" ON "devpware_resultados_busquedas_comparables" ("IdBusquedaComparable");
CREATE INDEX "devpware_resultados_busq_comp_IdPropiedad_idx" ON "devpware_resultados_busquedas_comparables" ("IdPropiedad");
CREATE INDEX "devpware_resultados_busq_comp_IdPublicacion_idx" ON "devpware_resultados_busquedas_comparables" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_resultados_busq_comp_IdComparable_idx" ON "devpware_resultados_busquedas_comparables" ("IdComparableAvaluo");
CREATE INDEX "devpware_resultados_busq_comp_IPosicion_idx" ON "devpware_resultados_busquedas_comparables" ("IPosicion");
CREATE INDEX "devpware_resultados_busq_comp_Distancia_idx" ON "devpware_resultados_busquedas_comparables" ("NDistanciaMetros");
CREATE INDEX "devpware_resultados_busq_comp_Similitud_idx" ON "devpware_resultados_busquedas_comparables" ("NPorcentajeSimilitud");
CREATE INDEX "devpware_resultados_busq_comp_BPasaFiltros_idx" ON "devpware_resultados_busquedas_comparables" ("BPasaFiltros");
CREATE INDEX "devpware_resultados_busq_comp_BSeleccionado_idx" ON "devpware_resultados_busquedas_comparables" ("BSeleccionadoComoComparable");

CREATE TABLE "devpware_geocodificaciones" (
  "IdGeocodificacion" BIGSERIAL NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdUsuario" INTEGER,
  "IdPropiedad" INTEGER,
  "IdOrigenDato" INTEGER NOT NULL,
  "SProveedor" VARCHAR(180) NOT NULL,
  "SConsulta" TEXT NOT NULL,
  "SDireccionNormalizada" TEXT,
  "NLatitud" NUMERIC(10,7),
  "NLongitud" NUMERIC(10,7),
  "NPrecisionMetros" NUMERIC(18,4),
  "GNodoResultado" geography(Point,4326),
  "SCalidadResultado" VARCHAR(120),
  "BExitoso" BOOLEAN NOT NULL DEFAULT false,
  "SMensajeError" TEXT,
  "JRespuestaProveedor" JSONB,
  "DFechaConsulta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_geocodificaciones_pkey" PRIMARY KEY ("IdGeocodificacion"),
  CONSTRAINT "devpware_geocodificaciones_SProveedor_check" CHECK (btrim("SProveedor") <> ''),
  CONSTRAINT "devpware_geocodificaciones_SConsulta_check" CHECK (btrim("SConsulta") <> ''),
  CONSTRAINT "devpware_geocodificaciones_latitud_check" CHECK ("NLatitud" IS NULL OR "NLatitud" BETWEEN -90 AND 90),
  CONSTRAINT "devpware_geocodificaciones_longitud_check" CHECK ("NLongitud" IS NULL OR "NLongitud" BETWEEN -180 AND 180),
  CONSTRAINT "devpware_geocodificaciones_precision_check" CHECK ("NPrecisionMetros" IS NULL OR "NPrecisionMetros" >= 0),
  CONSTRAINT "devpware_geocodificaciones_exitoso_check" CHECK ("BExitoso" = false OR ("NLatitud" IS NOT NULL AND "NLongitud" IS NOT NULL)),
  CONSTRAINT "devpware_geocodificaciones_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_geocodificaciones_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_geocodificaciones_propiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_geocodificaciones_origen_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_geocodificaciones_IdOrganizacion_idx" ON "devpware_geocodificaciones" ("IdOrganizacion");
CREATE INDEX "devpware_geocodificaciones_IdUsuario_idx" ON "devpware_geocodificaciones" ("IdUsuario");
CREATE INDEX "devpware_geocodificaciones_IdPropiedad_idx" ON "devpware_geocodificaciones" ("IdPropiedad");
CREATE INDEX "devpware_geocodificaciones_IdOrigenDato_idx" ON "devpware_geocodificaciones" ("IdOrigenDato");
CREATE INDEX "devpware_geocodificaciones_SProveedor_idx" ON "devpware_geocodificaciones" ("SProveedor");
CREATE INDEX "devpware_geocodificaciones_BExitoso_idx" ON "devpware_geocodificaciones" ("BExitoso");
CREATE INDEX "devpware_geocodificaciones_DFechaConsulta_idx" ON "devpware_geocodificaciones" ("DFechaConsulta");
CREATE INDEX "devpware_geocodificaciones_GNodo_gist_idx" ON "devpware_geocodificaciones" USING GIST ("GNodoResultado");

CREATE TABLE "devpware_zonas_busquedas_comparables" (
  "IdZonaBusquedaComparable" BIGSERIAL NOT NULL,
  "IdBusquedaComparable" BIGINT NOT NULL,
  "SNombre" VARCHAR(180),
  "GPoligono" geometry(Polygon,4326) NOT NULL,
  "NAreaMetrosCuadrados" NUMERIC(24,4),
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_zonas_busquedas_comparables_pkey" PRIMARY KEY ("IdZonaBusquedaComparable"),
  CONSTRAINT "devpware_zonas_busq_comp_area_check" CHECK ("NAreaMetrosCuadrados" IS NULL OR "NAreaMetrosCuadrados" >= 0),
  CONSTRAINT "devpware_zonas_busq_comp_busqueda_fkey" FOREIGN KEY ("IdBusquedaComparable") REFERENCES "devpware_busquedas_comparables" ("IdBusquedaComparable") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_zonas_busq_comp_IdBusqueda_idx" ON "devpware_zonas_busquedas_comparables" ("IdBusquedaComparable");
CREATE INDEX "devpware_zonas_busq_comp_BActiva_idx" ON "devpware_zonas_busquedas_comparables" ("BActiva");
CREATE INDEX "devpware_zonas_busq_comp_GPoligono_gist_idx" ON "devpware_zonas_busquedas_comparables" USING GIST ("GPoligono");

CREATE TABLE "devpware_capturas_mapas" (
  "IdCapturaMapa" BIGSERIAL NOT NULL,
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdBusquedaComparable" BIGINT,
  "IdArchivo" BIGINT NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "STitulo" VARCHAR(220),
  "SDescripcion" VARCHAR(1000),
  "NCentroLatitud" NUMERIC(10,7),
  "NCentroLongitud" NUMERIC(10,7),
  "NNivelZoom" NUMERIC(8,3),
  "JConfiguracionMapa" JSONB,
  "BIncluidaEnReporte" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCaptura" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_capturas_mapas_pkey" PRIMARY KEY ("IdCapturaMapa"),
  CONSTRAINT "devpware_capturas_mapas_latitud_check" CHECK ("NCentroLatitud" IS NULL OR "NCentroLatitud" BETWEEN -90 AND 90),
  CONSTRAINT "devpware_capturas_mapas_longitud_check" CHECK ("NCentroLongitud" IS NULL OR "NCentroLongitud" BETWEEN -180 AND 180),
  CONSTRAINT "devpware_capturas_mapas_zoom_check" CHECK ("NNivelZoom" IS NULL OR "NNivelZoom" >= 0),
  CONSTRAINT "devpware_capturas_mapas_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_capturas_mapas_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_capturas_mapas_busqueda_fkey" FOREIGN KEY ("IdBusquedaComparable") REFERENCES "devpware_busquedas_comparables" ("IdBusquedaComparable") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_capturas_mapas_archivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_capturas_mapas_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_capturas_mapas_IdAvaluo_idx" ON "devpware_capturas_mapas" ("IdAvaluo");
CREATE INDEX "devpware_capturas_mapas_IdVersion_idx" ON "devpware_capturas_mapas" ("IdVersionAvaluo");
CREATE INDEX "devpware_capturas_mapas_IdBusqueda_idx" ON "devpware_capturas_mapas" ("IdBusquedaComparable");
CREATE INDEX "devpware_capturas_mapas_IdArchivo_idx" ON "devpware_capturas_mapas" ("IdArchivo");
CREATE INDEX "devpware_capturas_mapas_IdUsuario_idx" ON "devpware_capturas_mapas" ("IdUsuario");
CREATE INDEX "devpware_capturas_mapas_BReporte_idx" ON "devpware_capturas_mapas" ("BIncluidaEnReporte");
CREATE INDEX "devpware_capturas_mapas_DFechaCaptura_idx" ON "devpware_capturas_mapas" ("DFechaCaptura");

CREATE OR REPLACE FUNCTION "devpware_sync_gcentro_busqueda_comparable"()
RETURNS trigger AS $$
BEGIN
  IF NEW."NLongitudCentro" IS NOT NULL AND NEW."NLatitudCentro" IS NOT NULL THEN
    NEW."GCentroBusqueda" := ST_SetSRID(ST_MakePoint(NEW."NLongitudCentro", NEW."NLatitudCentro"), 4326)::geography;
  ELSE
    NEW."GCentroBusqueda" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "devpware_busquedas_comparables_sync_gcentro"
BEFORE INSERT OR UPDATE OF "NLongitudCentro", "NLatitudCentro" ON "devpware_busquedas_comparables"
FOR EACH ROW
EXECUTE FUNCTION "devpware_sync_gcentro_busqueda_comparable"();

CREATE OR REPLACE FUNCTION "devpware_sync_gnodo_geocodificacion"()
RETURNS trigger AS $$
BEGIN
  IF NEW."NLongitud" IS NOT NULL AND NEW."NLatitud" IS NOT NULL THEN
    NEW."GNodoResultado" := ST_SetSRID(ST_MakePoint(NEW."NLongitud", NEW."NLatitud"), 4326)::geography;
  ELSE
    NEW."GNodoResultado" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "devpware_geocodificaciones_sync_gnodo"
BEFORE INSERT OR UPDATE OF "NLongitud", "NLatitud" ON "devpware_geocodificaciones"
FOR EACH ROW
EXECUTE FUNCTION "devpware_sync_gnodo_geocodificacion"();

CREATE OR REPLACE FUNCTION "devpware_calc_area_zona_busqueda"()
RETURNS trigger AS $$
BEGIN
  NEW."NAreaMetrosCuadrados" := ST_Area(NEW."GPoligono"::geography);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "devpware_zonas_busquedas_calc_area"
BEFORE INSERT OR UPDATE OF "GPoligono" ON "devpware_zonas_busquedas_comparables"
FOR EACH ROW
EXECUTE FUNCTION "devpware_calc_area_zona_busqueda"();

INSERT INTO "devpware_tipos_busquedas_geograficas" ("SClave", "SNombre", "SDescripcion", "BRequiereRadio", "BRequierePoligono", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('RADIO', 'Radio', 'Busqueda geografica por radio.', true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('POLIGONO', 'Poligono', 'Busqueda geografica por poligono.', false, true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VISTA_MAPA', 'Vista de mapa', 'Busqueda basada en vista actual de mapa.', false, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CODIGO_POSTAL', 'Codigo postal', 'Busqueda por codigo postal.', false, false, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MUNICIPIO', 'Municipio', 'Busqueda por municipio.', false, false, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COLONIA', 'Colonia', 'Busqueda por colonia.', false, false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BRequiereRadio" = EXCLUDED."BRequiereRadio",
  "BRequierePoligono" = EXCLUDED."BRequierePoligono",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

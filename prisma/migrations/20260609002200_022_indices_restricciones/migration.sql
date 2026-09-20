-- Migration 022: Índices, estadísticas y restricciones
-- No crea tablas, columnas, datos ni extensiones.
-- Solo índices, estadísticas extendidas y restricciones faltantes.

-- ============================================================
-- 1. Índices GIN trigram (búsqueda textual parcial)
-- ============================================================

-- Organizaciones
CREATE INDEX IF NOT EXISTS "idx_org_snombre_trgm" ON "devpware_organizaciones" USING GIN ("SNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_org_srazonsocial_trgm" ON "devpware_organizaciones" USING GIN ("SRazonSocial" gin_trgm_ops);

-- Usuarios
CREATE INDEX IF NOT EXISTS "idx_usu_snombre_trgm" ON "devpware_usuarios" USING GIN ("SNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_usu_sapellidopaterno_trgm" ON "devpware_usuarios" USING GIN ("SApellidoPaterno" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_usu_sapellidomaterno_trgm" ON "devpware_usuarios" USING GIN ("SApellidoMaterno" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_usu_scorreo_trgm" ON "devpware_usuarios" USING GIN ("SCorreo" gin_trgm_ops);

-- Avalúos
CREATE INDEX IF NOT EXISTS "idx_avl_sfolio_trgm" ON "devpware_avaluos" USING GIN ("SFolio" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_avl_stitulo_trgm" ON "devpware_avaluos" USING GIN ("STitulo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_avl_snombrecliente_trgm" ON "devpware_avaluos" USING GIN ("SNombreCliente" gin_trgm_ops);

-- Propiedades
CREATE INDEX IF NOT EXISTS "idx_prop_snombre_trgm" ON "devpware_propiedades" USING GIN ("SNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_prop_sdescripcion_trgm" ON "devpware_propiedades" USING GIN ("SDescripcion" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_prop_szona_trgm" ON "devpware_propiedades" USING GIN ("SZona" gin_trgm_ops);

-- Publicaciones (solo STitulo; SDescripcion es texto largo, se omite por costo)
CREATE INDEX IF NOT EXISTS "idx_pub_prop_stitulo_trgm" ON "devpware_publicaciones_propiedades" USING GIN ("STitulo" gin_trgm_ops);

-- Normas
CREATE INDEX IF NOT EXISTS "idx_norm_sclave_trgm" ON "devpware_normas" USING GIN ("SClave" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_norm_snombre_trgm" ON "devpware_normas" USING GIN ("SNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_norm_snombrecorto_trgm" ON "devpware_normas" USING GIN ("SNombreCorto" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_norm_sautoridad_trgm" ON "devpware_normas" USING GIN ("SAutoridadEmisora" gin_trgm_ops);

-- Fuentes inmobiliarias
CREATE INDEX IF NOT EXISTS "idx_fuente_snombre_trgm" ON "devpware_fuentes_inmobiliarias" USING GIN ("SNombre" gin_trgm_ops);

-- ============================================================
-- 2. Índices GIN JSONB (consulta dentro de documentos JSON)
-- ============================================================

CREATE INDEX IF NOT EXISTS "idx_prop_jcaracteristicas_gin" ON "devpware_propiedades" USING GIN ("JCaracteristicas" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "idx_pub_prop_jdatosnormalizados_gin" ON "devpware_publicaciones_propiedades" USING GIN ("JDatosNormalizados" jsonb_path_ops);

-- ============================================================
-- 3. Índices compuestos y parciales operativos
-- ============================================================

-- devpware_avaluos
CREATE INDEX IF NOT EXISTS "idx_avl_activos_org" ON "devpware_avaluos" ("IdOrganizacion", "IdEstadoAvaluo", "DFechaModificacion" DESC) WHERE "DFechaEliminacion" IS NULL AND "BActivo" = true;
CREATE INDEX IF NOT EXISTS "idx_avl_bloqueados" ON "devpware_avaluos" ("IdOrganizacion", "DFechaBloqueo") WHERE "BBloqueado" = true AND "DFechaEliminacion" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_avl_responsable" ON "devpware_avaluos" ("IdUsuarioResponsable", "IdEstadoAvaluo", "DFechaModificacion" DESC) WHERE "IdUsuarioResponsable" IS NOT NULL AND "DFechaEliminacion" IS NULL AND "BActivo" = true;

-- devpware_versiones_avaluos
CREATE INDEX IF NOT EXISTS "idx_veravl_compuesto" ON "devpware_versiones_avaluos" ("IdAvaluo", "IdEstadoVersionAvaluo", "INumeroVersion" DESC);
CREATE INDEX IF NOT EXISTS "idx_veravl_no_finalizadas" ON "devpware_versiones_avaluos" ("IdAvaluo", "DFechaModificacion" DESC) WHERE "DFechaFinalizacion" IS NULL;

-- devpware_secciones_documentos
CREATE INDEX IF NOT EXISTS "idx_sec_doc_compuesto" ON "devpware_secciones_documentos" ("IdVersionAvaluo", "BVisible", "IOrden");

-- devpware_nodos_documentos
CREATE INDEX IF NOT EXISTS "idx_ndo_doc_visibles" ON "devpware_nodos_documentos" ("IdSeccionDocumento", "IdNodoPadre", "IOrden") WHERE "DFechaEliminacion" IS NULL AND "BVisible" = true;
CREATE INDEX IF NOT EXISTS "idx_ndo_doc_obligatorios" ON "devpware_nodos_documentos" ("IdSeccionDocumento", "IOrden") WHERE "BObligatorio" = true AND "DFechaEliminacion" IS NULL;

-- devpware_valores_nodos_documentos
CREATE INDEX IF NOT EXISTS "idx_val_ndo_compuesto" ON "devpware_valores_nodos_documentos" ("IdVersionAvaluo", "DFechaModificacion" DESC);

-- devpware_campos_personalizados
CREATE INDEX IF NOT EXISTS "idx_camp_pers_activos" ON "devpware_campos_personalizados" ("IdOrganizacion", "BActivo", "IOrden") WHERE "DFechaEliminacion" IS NULL;

-- devpware_valores_campos_personalizados
CREATE INDEX IF NOT EXISTS "idx_val_camp_pers_comp" ON "devpware_valores_campos_personalizados" ("IdAvaluo", "IdVersionAvaluo", "DFechaModificacion" DESC);

-- devpware_columnas_tablas_documentos
CREATE INDEX IF NOT EXISTS "idx_col_tab_doc_visibles" ON "devpware_columnas_tablas_documentos" ("IdTablaDocumento", "BVisible", "IOrden") WHERE "DFechaEliminacion" IS NULL;

-- devpware_filas_tablas_documentos
CREATE INDEX IF NOT EXISTS "idx_fil_tab_doc_comp" ON "devpware_filas_tablas_documentos" ("IdTablaDocumento", "BActivo", "IOrden");

-- devpware_ejecuciones_calculos
CREATE INDEX IF NOT EXISTS "idx_eje_calc_comp" ON "devpware_ejecuciones_calculos" ("IdVersionAvaluo", "IdCalculoPermitido", "DFechaEjecucion" DESC);
CREATE INDEX IF NOT EXISTS "idx_eje_calc_errores" ON "devpware_ejecuciones_calculos" ("IdVersionAvaluo", "DFechaEjecucion" DESC) WHERE "BExitoso" = false;
CREATE INDEX IF NOT EXISTS "idx_eje_calc_sobrescrituras" ON "devpware_ejecuciones_calculos" ("IdVersionAvaluo", "IdUsuarioSobrescritura", "DFechaSobrescritura" DESC) WHERE "BResultadoSobrescrito" = true;

-- devpware_archivos
CREATE INDEX IF NOT EXISTS "idx_arch_activos" ON "devpware_archivos" ("IdOrganizacion", "IdTipoArchivo", "DFechaCreacion" DESC) WHERE "BActivo" = true AND "DFechaEliminacion" IS NULL;

-- devpware_relaciones_archivos
CREATE INDEX IF NOT EXISTS "idx_rel_arch_principal" ON "devpware_relaciones_archivos" ("SEntidad", "SIdentificadorEntidad") WHERE "BPrincipal" = true;

-- devpware_cargas_archivos
CREATE INDEX IF NOT EXISTS "idx_carg_arch_pendientes" ON "devpware_cargas_archivos" ("IdOrganizacion", "DFechaExpiracion") WHERE "BCompletada" = false AND "BCancelada" = false;

-- devpware_propiedades
CREATE INDEX IF NOT EXISTS "idx_prop_activas" ON "devpware_propiedades" ("IdOrganizacion", "IdTipoInmueble", "DFechaModificacion" DESC) WHERE "BActiva" = true AND "DFechaEliminacion" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_prop_superficies" ON "devpware_propiedades" ("IdTipoInmueble", "NSuperficieTerreno", "NSuperficieConstruccion");

-- devpware_direcciones_propiedades
CREATE INDEX IF NOT EXISTS "idx_dir_prop_ubicacion" ON "devpware_direcciones_propiedades" ("SEstado", "SMunicipio", "SColonia", "SCodigoPostal");

-- devpware_publicaciones_propiedades
CREATE INDEX IF NOT EXISTS "idx_pub_prop_activas" ON "devpware_publicaciones_propiedades" ("IdFuenteInmobiliaria", "IdTipoOperacion", "NPrecio", "DFechaUltimaConsulta" DESC) WHERE "BActivo" = true AND "DFechaEliminacion" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_pub_prop_ultimas" ON "devpware_publicaciones_propiedades" ("IdPropiedad", "IdEstadoPublicacion", "DFechaUltimaConsulta" DESC) WHERE "DFechaEliminacion" IS NULL;

-- devpware_comparables_avaluos
CREATE INDEX IF NOT EXISTS "idx_cmp_avl_orden" ON "devpware_comparables_avaluos" ("IdVersionAvaluo", "BIncluido", "IOrden");
CREATE INDEX IF NOT EXISTS "idx_cmp_avl_similitud" ON "devpware_comparables_avaluos" ("IdVersionAvaluo", "IdTipoComparable", "NPorcentajeSimilitud" DESC);
CREATE INDEX IF NOT EXISTS "idx_cmp_avl_distancia" ON "devpware_comparables_avaluos" ("IdVersionAvaluo", "NDistanciaMetros");

-- devpware_factores_homologacion
CREATE INDEX IF NOT EXISTS "idx_fac_hom_comp" ON "devpware_factores_homologacion" ("IdComparableAvaluo", "BConfirmado", "IOrden");

-- devpware_historiales_uso_comparables
CREATE INDEX IF NOT EXISTS "idx_huso_cmp_propiedad" ON "devpware_historiales_uso_comparables" ("IdPropiedad", "DFechaUso" DESC);
CREATE INDEX IF NOT EXISTS "idx_huso_cmp_avaluo" ON "devpware_historiales_uso_comparables" ("IdAvaluo", "IdVersionAvaluo", "DFechaUso" DESC);

-- devpware_busquedas_comparables
CREATE INDEX IF NOT EXISTS "idx_busq_comp_org" ON "devpware_busquedas_comparables" ("IdOrganizacion", "IdAvaluo", "DFechaEjecucion" DESC);
CREATE INDEX IF NOT EXISTS "idx_busq_comp_version" ON "devpware_busquedas_comparables" ("IdVersionAvaluo", "IdTipoBusquedaGeografica", "DFechaEjecucion" DESC);

-- devpware_resultados_busquedas_comparables
CREATE INDEX IF NOT EXISTS "idx_res_busq_filtros" ON "devpware_resultados_busquedas_comparables" ("IdBusquedaComparable", "BPasaFiltros", "IPosicion");
CREATE INDEX IF NOT EXISTS "idx_res_busq_seleccion" ON "devpware_resultados_busquedas_comparables" ("IdBusquedaComparable", "BSeleccionadoComoComparable", "IPosicion");

-- devpware_geocodificaciones
CREATE INDEX IF NOT EXISTS "idx_geo_org_exitoso" ON "devpware_geocodificaciones" ("IdOrganizacion", "BExitoso", "DFechaConsulta" DESC);

-- devpware_capturas_mapas
CREATE INDEX IF NOT EXISTS "idx_cap_mapa_reporte" ON "devpware_capturas_mapas" ("IdVersionAvaluo", "BIncluidaEnReporte", "DFechaCaptura" DESC);

-- devpware_auditorias
CREATE INDEX IF NOT EXISTS "idx_aud_org_fecha" ON "devpware_auditorias" ("IdOrganizacion", "DFechaEvento" DESC);
CREATE INDEX IF NOT EXISTS "idx_aud_usr_fecha" ON "devpware_auditorias" ("IdUsuario", "DFechaEvento" DESC);
CREATE INDEX IF NOT EXISTS "idx_aud_resultados_fallidos" ON "devpware_auditorias" ("IdOrganizacion", "DFechaEvento" DESC) WHERE "SResultado" IS NOT NULL AND upper("SResultado") IN ('ERROR', 'FALLIDO', 'DENEGADO');

-- devpware_trabajos
CREATE INDEX IF NOT EXISTS "idx_trab_disponibles" ON "devpware_trabajos" ("SCola", "SPrioridad", "DFechaDisponible", "DFechaCreacion") WHERE "DFechaInicio" IS NULL AND "DFechaFinalizacion" IS NULL AND "DFechaCancelacion" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_trab_bloqueados" ON "devpware_trabajos" ("SCola", "DFechaUltimoLatido", "DFechaBloqueo") WHERE "SWorkerBloqueo" IS NOT NULL AND "DFechaFinalizacion" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_trab_fallidos" ON "devpware_trabajos" ("IdTipoTrabajo", "DFechaFinalizacion" DESC) WHERE "SMensajeResultado" IS NOT NULL AND "DFechaFinalizacion" IS NOT NULL;

-- devpware_importaciones
CREATE INDEX IF NOT EXISTS "idx_imp_org_estado" ON "devpware_importaciones" ("IdOrganizacion", "IdEstadoImportacion", "DFechaCarga" DESC);
CREATE INDEX IF NOT EXISTS "idx_imp_sin_terminar" ON "devpware_importaciones" ("IdOrganizacion", "DFechaCarga" DESC) WHERE "DFechaFinAplicacion" IS NULL AND "DFechaCancelacion" IS NULL;

-- devpware_filas_importaciones
CREATE INDEX IF NOT EXISTS "idx_fil_imp_estados" ON "devpware_filas_importaciones" ("IdImportacion", "BValida", "BAplicada", "BOmitida", "INumeroFila");

-- devpware_errores_importaciones
CREATE INDEX IF NOT EXISTS "idx_err_imp_comp" ON "devpware_errores_importaciones" ("IdImportacion", "BCorregido", "SNivel", "DFechaCreacion");

-- devpware_extracciones_ia
CREATE INDEX IF NOT EXISTS "idx_ext_ia_org_estado" ON "devpware_extracciones_ia" ("IdOrganizacion", "IdEstadoExtraccionIA", "DFechaSolicitud" DESC);
CREATE INDEX IF NOT EXISTS "idx_ext_ia_revision" ON "devpware_extracciones_ia" ("IdOrganizacion", "DFechaRespuesta" DESC) WHERE "BRequiereRevision" = true AND "BAplicada" = false;

-- devpware_campos_extraidos_ia
CREATE INDEX IF NOT EXISTS "idx_cmp_ext_ia_validacion" ON "devpware_campos_extraidos_ia" ("IdExtraccionIA", "IdEstadoValidacion", "NConfianza" DESC);
CREATE INDEX IF NOT EXISTS "idx_cmp_ext_ia_no_aplicados" ON "devpware_campos_extraidos_ia" ("IdExtraccionIA", "NConfianza" DESC) WHERE "BAplicado" = false;

-- devpware_versiones_normas
CREATE INDEX IF NOT EXISTS "idx_ver_norm_vigencia" ON "devpware_versiones_normas" ("IdEstadoNorma", "DFechaInicioVigencia", "DFechaFinVigencia");
CREATE INDEX IF NOT EXISTS "idx_ver_norm_fechas" ON "devpware_versiones_normas" ("IdNorma", "DFechaInicioVigencia" DESC, "DFechaFinVigencia");

-- devpware_aplicaciones_normativas_avaluos
CREATE INDEX IF NOT EXISTS "idx_ap_norm_avl_comp" ON "devpware_aplicaciones_normativas_avaluos" ("IdVersionAvaluo", "BAplicada", "BConfirmada", "DFechaAplicacion" DESC);

-- devpware_aplicaciones_reglas_normativas
CREATE INDEX IF NOT EXISTS "idx_ap_reg_norm_comp" ON "devpware_aplicaciones_reglas_normativas" ("IdAplicacionNormativaAvaluo", "BNoAplica", "BCumple");

-- ============================================================
-- 4. Estadísticas extendidas (dependencias funcionales)
-- ============================================================

CREATE STATISTICS IF NOT EXISTS "st_avl_dependencies" (dependencies) ON "IdOrganizacion", "IdEstadoAvaluo", "BActivo" FROM "devpware_avaluos";
CREATE STATISTICS IF NOT EXISTS "st_pub_prop_dependencies" (dependencies) ON "IdFuenteInmobiliaria", "IdTipoOperacion", "IdEstadoPublicacion", "BActivo" FROM "devpware_publicaciones_propiedades";
CREATE STATISTICS IF NOT EXISTS "st_trab_dependencies" (dependencies) ON "SCola", "IdEstadoTrabajo", "DFechaDisponible" FROM "devpware_trabajos";

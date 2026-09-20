-- Migracion 012_enfoques_valuatorios

CREATE TABLE "devpware_enfoques_costos" (
  "IdEnfoqueCosto" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "NValorTerreno" NUMERIC(24,2),
  "NValorConstrucciones" NUMERIC(24,2),
  "NValorInstalaciones" NUMERIC(24,2),
  "NValorIndirectos" NUMERIC(24,2),
  "NValorFisicoTotal" NUMERIC(24,2),
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_enfoques_costos_pkey" PRIMARY KEY ("IdEnfoqueCosto"),
  CONSTRAINT "devpware_enfoques_costos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_enfoques_costos_valores_check" CHECK (
    ("NValorTerreno" IS NULL OR "NValorTerreno" >= 0) AND
    ("NValorConstrucciones" IS NULL OR "NValorConstrucciones" >= 0) AND
    ("NValorInstalaciones" IS NULL OR "NValorInstalaciones" >= 0) AND
    ("NValorIndirectos" IS NULL OR "NValorIndirectos" >= 0) AND
    ("NValorFisicoTotal" IS NULL OR "NValorFisicoTotal" >= 0)
  ),
  CONSTRAINT "devpware_enfoques_costos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_enfoques_costos_IdVersionAvaluo_idx" ON "devpware_enfoques_costos" ("IdVersionAvaluo");

CREATE TABLE "devpware_costos_terrenos" (
  "IdCostoTerreno" BIGSERIAL NOT NULL,
  "IdEnfoqueCosto" INTEGER NOT NULL,
  "SFraccion" VARCHAR(120),
  "NSuperficieSujeto" NUMERIC(18,4),
  "NValorUnitario" NUMERIC(24,8),
  "NFactorNegociacion" NUMERIC(16,8),
  "NFactorUbicacion" NUMERIC(16,8),
  "NFactorSuperficie" NUMERIC(16,8),
  "NFactorServicios" NUMERIC(16,8),
  "NFactorClasificacion" NUMERIC(16,8),
  "NFactorTopografia" NUMERIC(16,8),
  "NFactorResultante" NUMERIC(16,8),
  "NValorUnitarioNeto" NUMERIC(24,8),
  "NValorParcial" NUMERIC(24,2),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_costos_terrenos_pkey" PRIMARY KEY ("IdCostoTerreno"),
  CONSTRAINT "devpware_costos_terrenos_no_negativos_check" CHECK (
    ("NSuperficieSujeto" IS NULL OR "NSuperficieSujeto" >= 0) AND
    ("NValorUnitario" IS NULL OR "NValorUnitario" >= 0) AND
    ("NFactorNegociacion" IS NULL OR "NFactorNegociacion" >= 0) AND
    ("NFactorUbicacion" IS NULL OR "NFactorUbicacion" >= 0) AND
    ("NFactorSuperficie" IS NULL OR "NFactorSuperficie" >= 0) AND
    ("NFactorServicios" IS NULL OR "NFactorServicios" >= 0) AND
    ("NFactorClasificacion" IS NULL OR "NFactorClasificacion" >= 0) AND
    ("NFactorTopografia" IS NULL OR "NFactorTopografia" >= 0) AND
    ("NFactorResultante" IS NULL OR "NFactorResultante" >= 0) AND
    ("NValorUnitarioNeto" IS NULL OR "NValorUnitarioNeto" >= 0) AND
    ("NValorParcial" IS NULL OR "NValorParcial" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_costos_terrenos_IdEnfoqueCosto_fkey" FOREIGN KEY ("IdEnfoqueCosto") REFERENCES "devpware_enfoques_costos" ("IdEnfoqueCosto") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_costos_terrenos_IdEnfoqueCosto_idx" ON "devpware_costos_terrenos" ("IdEnfoqueCosto");
CREATE INDEX "devpware_costos_terrenos_IOrden_idx" ON "devpware_costos_terrenos" ("IOrden");

CREATE TABLE "devpware_costos_construcciones" (
  "IdCostoConstruccion" BIGSERIAL NOT NULL,
  "IdEnfoqueCosto" INTEGER NOT NULL,
  "IdTipoConstruccionAvaluo" INTEGER NOT NULL,
  "NValorUnitarioReposicionNuevo" NUMERIC(24,8),
  "NValorParcialVRN" NUMERIC(24,2),
  "NFactorEdad" NUMERIC(16,8),
  "NFactorConservacion" NUMERIC(16,8),
  "NFactorOtro" NUMERIC(16,8),
  "NFactorResultante" NUMERIC(16,8),
  "NValorUnitarioVNR" NUMERIC(24,8),
  "NValorParcialVNR" NUMERIC(24,2),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_costos_construcciones_pkey" PRIMARY KEY ("IdCostoConstruccion"),
  CONSTRAINT "devpware_costos_constr_enfoque_tipo_key" UNIQUE ("IdEnfoqueCosto", "IdTipoConstruccionAvaluo"),
  CONSTRAINT "devpware_costos_construcciones_no_negativos_check" CHECK (
    ("NValorUnitarioReposicionNuevo" IS NULL OR "NValorUnitarioReposicionNuevo" >= 0) AND
    ("NValorParcialVRN" IS NULL OR "NValorParcialVRN" >= 0) AND
    ("NFactorEdad" IS NULL OR "NFactorEdad" >= 0) AND
    ("NFactorConservacion" IS NULL OR "NFactorConservacion" >= 0) AND
    ("NFactorOtro" IS NULL OR "NFactorOtro" >= 0) AND
    ("NFactorResultante" IS NULL OR "NFactorResultante" >= 0) AND
    ("NValorUnitarioVNR" IS NULL OR "NValorUnitarioVNR" >= 0) AND
    ("NValorParcialVNR" IS NULL OR "NValorParcialVNR" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_costos_constr_enfoque_fkey" FOREIGN KEY ("IdEnfoqueCosto") REFERENCES "devpware_enfoques_costos" ("IdEnfoqueCosto") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_costos_constr_tipo_fkey" FOREIGN KEY ("IdTipoConstruccionAvaluo") REFERENCES "devpware_tipos_construcciones_avaluos" ("IdTipoConstruccionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_costos_construcciones_IdEnfoqueCosto_idx" ON "devpware_costos_construcciones" ("IdEnfoqueCosto");
CREATE INDEX "devpware_costos_constr_IdTipoConstruccion_idx" ON "devpware_costos_construcciones" ("IdTipoConstruccionAvaluo");
CREATE INDEX "devpware_costos_construcciones_IOrden_idx" ON "devpware_costos_construcciones" ("IOrden");

CREATE TABLE "devpware_costos_instalaciones" (
  "IdCostoInstalacion" BIGSERIAL NOT NULL,
  "IdEnfoqueCosto" INTEGER NOT NULL,
  "IdInstalacionEspecialAvaluo" INTEGER NOT NULL,
  "NValorUnitarioVRN" NUMERIC(24,8),
  "NValorParcialVRN" NUMERIC(24,2),
  "NFactorEdad" NUMERIC(16,8),
  "NFactorConservacion" NUMERIC(16,8),
  "NFactorOtro" NUMERIC(16,8),
  "NFactorResultante" NUMERIC(16,8),
  "NValorUnitarioVNR" NUMERIC(24,8),
  "NValorParcialVNR" NUMERIC(24,2),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_costos_instalaciones_pkey" PRIMARY KEY ("IdCostoInstalacion"),
  CONSTRAINT "devpware_costos_inst_enfoque_inst_key" UNIQUE ("IdEnfoqueCosto", "IdInstalacionEspecialAvaluo"),
  CONSTRAINT "devpware_costos_inst_no_negativos_check" CHECK (
    ("NValorUnitarioVRN" IS NULL OR "NValorUnitarioVRN" >= 0) AND
    ("NValorParcialVRN" IS NULL OR "NValorParcialVRN" >= 0) AND
    ("NFactorEdad" IS NULL OR "NFactorEdad" >= 0) AND
    ("NFactorConservacion" IS NULL OR "NFactorConservacion" >= 0) AND
    ("NFactorOtro" IS NULL OR "NFactorOtro" >= 0) AND
    ("NFactorResultante" IS NULL OR "NFactorResultante" >= 0) AND
    ("NValorUnitarioVNR" IS NULL OR "NValorUnitarioVNR" >= 0) AND
    ("NValorParcialVNR" IS NULL OR "NValorParcialVNR" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_costos_inst_enfoque_fkey" FOREIGN KEY ("IdEnfoqueCosto") REFERENCES "devpware_enfoques_costos" ("IdEnfoqueCosto") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_costos_inst_instalacion_fkey" FOREIGN KEY ("IdInstalacionEspecialAvaluo") REFERENCES "devpware_instalaciones_especiales_avaluos" ("IdInstalacionEspecialAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_costos_instalaciones_IdEnfoqueCosto_idx" ON "devpware_costos_instalaciones" ("IdEnfoqueCosto");
CREATE INDEX "devpware_costos_inst_IdInstalacion_idx" ON "devpware_costos_instalaciones" ("IdInstalacionEspecialAvaluo");
CREATE INDEX "devpware_costos_instalaciones_IOrden_idx" ON "devpware_costos_instalaciones" ("IOrden");

CREATE TABLE "devpware_costos_indirectos" (
  "IdCostoIndirecto" BIGSERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "SConcepto" VARCHAR(220) NOT NULL,
  "SUnidad" VARCHAR(80),
  "NCantidad" NUMERIC(18,4),
  "NPorcentaje" NUMERIC(12,8),
  "NValorBase" NUMERIC(24,2),
  "NValorCalculado" NUMERIC(24,2),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_costos_indirectos_pkey" PRIMARY KEY ("IdCostoIndirecto"),
  CONSTRAINT "devpware_costos_indirectos_SConcepto_check" CHECK (btrim("SConcepto") <> ''),
  CONSTRAINT "devpware_costos_indirectos_no_negativos_check" CHECK (
    ("NCantidad" IS NULL OR "NCantidad" >= 0) AND
    ("NPorcentaje" IS NULL OR "NPorcentaje" >= 0) AND
    ("NValorBase" IS NULL OR "NValorBase" >= 0) AND
    ("NValorCalculado" IS NULL OR "NValorCalculado" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_costos_indirectos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_costos_indirectos_IdVersionAvaluo_idx" ON "devpware_costos_indirectos" ("IdVersionAvaluo");
CREATE INDEX "devpware_costos_indirectos_IOrden_idx" ON "devpware_costos_indirectos" ("IOrden");

CREATE TABLE "devpware_tipos_comparables" (
  "IdTipoComparable" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_comparables_pkey" PRIMARY KEY ("IdTipoComparable"),
  CONSTRAINT "devpware_tipos_comparables_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_comparables_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_comparables_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_comparables_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_comparables_BActivo_idx" ON "devpware_tipos_comparables" ("BActivo");
CREATE INDEX "devpware_tipos_comparables_IOrden_idx" ON "devpware_tipos_comparables" ("IOrden");

CREATE TABLE "devpware_enfoques_mercados" (
  "IdEnfoqueMercado" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdTipoComparable" INTEGER NOT NULL,
  "NNivelOferta" NUMERIC(12,8),
  "NValorPromedioHomologado" NUMERIC(24,8),
  "NValorMasParecido" NUMERIC(24,8),
  "NValorHomologadoUtilizado" NUMERIC(24,8),
  "NSuperficieSujeto" NUMERIC(18,4),
  "NMontoAdicional" NUMERIC(24,2),
  "NValorMercado" NUMERIC(24,2),
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_enfoques_mercados_pkey" PRIMARY KEY ("IdEnfoqueMercado"),
  CONSTRAINT "devpware_enfoques_mercados_version_tipo_key" UNIQUE ("IdVersionAvaluo", "IdTipoComparable"),
  CONSTRAINT "devpware_enfoques_mercados_no_negativos_check" CHECK (
    ("NNivelOferta" IS NULL OR "NNivelOferta" >= 0) AND
    ("NValorPromedioHomologado" IS NULL OR "NValorPromedioHomologado" >= 0) AND
    ("NValorMasParecido" IS NULL OR "NValorMasParecido" >= 0) AND
    ("NValorHomologadoUtilizado" IS NULL OR "NValorHomologadoUtilizado" >= 0) AND
    ("NSuperficieSujeto" IS NULL OR "NSuperficieSujeto" >= 0) AND
    ("NMontoAdicional" IS NULL OR "NMontoAdicional" >= 0) AND
    ("NValorMercado" IS NULL OR "NValorMercado" >= 0)
  ),
  CONSTRAINT "devpware_enfoques_mercados_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_enfoques_mercados_tipo_fkey" FOREIGN KEY ("IdTipoComparable") REFERENCES "devpware_tipos_comparables" ("IdTipoComparable") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_enfoques_mercados_IdVersionAvaluo_idx" ON "devpware_enfoques_mercados" ("IdVersionAvaluo");
CREATE INDEX "devpware_enfoques_mercados_IdTipoComparable_idx" ON "devpware_enfoques_mercados" ("IdTipoComparable");

CREATE TABLE "devpware_enfoques_rentas" (
  "IdEnfoqueRenta" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "NNivelOferta" NUMERIC(12,8),
  "NValorPromedioHomologado" NUMERIC(24,8),
  "NValorMasParecido" NUMERIC(24,8),
  "NValorHomologadoUtilizado" NUMERIC(24,8),
  "NSuperficieRentableSujeto" NUMERIC(18,4),
  "NMontoAdicional" NUMERIC(24,2),
  "NValorRentaMensual" NUMERIC(24,2),
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_enfoques_rentas_pkey" PRIMARY KEY ("IdEnfoqueRenta"),
  CONSTRAINT "devpware_enfoques_rentas_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_enfoques_rentas_no_negativos_check" CHECK (
    ("NNivelOferta" IS NULL OR "NNivelOferta" >= 0) AND
    ("NValorPromedioHomologado" IS NULL OR "NValorPromedioHomologado" >= 0) AND
    ("NValorMasParecido" IS NULL OR "NValorMasParecido" >= 0) AND
    ("NValorHomologadoUtilizado" IS NULL OR "NValorHomologadoUtilizado" >= 0) AND
    ("NSuperficieRentableSujeto" IS NULL OR "NSuperficieRentableSujeto" >= 0) AND
    ("NMontoAdicional" IS NULL OR "NMontoAdicional" >= 0) AND
    ("NValorRentaMensual" IS NULL OR "NValorRentaMensual" >= 0)
  ),
  CONSTRAINT "devpware_enfoques_rentas_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_enfoques_ingresos" (
  "IdEnfoqueIngreso" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "NIngresoBrutoMensual" NUMERIC(24,2),
  "NPorcentajeDeducciones" NUMERIC(12,8),
  "NRentaNetaMensual" NUMERIC(24,2),
  "NRentaNetaAnual" NUMERIC(24,2),
  "NTasaResultante" NUMERIC(12,8),
  "NTasaMercado" NUMERIC(12,8),
  "NTasaPonderada" NUMERIC(12,8),
  "NTasaAplicada" NUMERIC(12,8),
  "NValorCapitalizacion" NUMERIC(24,2),
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_enfoques_ingresos_pkey" PRIMARY KEY ("IdEnfoqueIngreso"),
  CONSTRAINT "devpware_enfoques_ingresos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_enfoques_ingresos_no_negativos_check" CHECK (
    ("NIngresoBrutoMensual" IS NULL OR "NIngresoBrutoMensual" >= 0) AND
    ("NPorcentajeDeducciones" IS NULL OR "NPorcentajeDeducciones" >= 0) AND
    ("NRentaNetaMensual" IS NULL OR "NRentaNetaMensual" >= 0) AND
    ("NRentaNetaAnual" IS NULL OR "NRentaNetaAnual" >= 0) AND
    ("NTasaResultante" IS NULL OR "NTasaResultante" >= 0) AND
    ("NTasaMercado" IS NULL OR "NTasaMercado" >= 0) AND
    ("NTasaPonderada" IS NULL OR "NTasaPonderada" >= 0) AND
    ("NTasaAplicada" IS NULL OR "NTasaAplicada" >= 0) AND
    ("NValorCapitalizacion" IS NULL OR "NValorCapitalizacion" >= 0)
  ),
  CONSTRAINT "devpware_enfoques_ingresos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_deducciones_ingresos" (
  "IdDeduccionIngreso" BIGSERIAL NOT NULL,
  "IdEnfoqueIngreso" INTEGER NOT NULL,
  "SConcepto" VARCHAR(220) NOT NULL,
  "NPorcentaje" NUMERIC(12,8),
  "NValor" NUMERIC(24,2),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_deducciones_ingresos_pkey" PRIMARY KEY ("IdDeduccionIngreso"),
  CONSTRAINT "devpware_deducciones_ingresos_SConcepto_check" CHECK (btrim("SConcepto") <> ''),
  CONSTRAINT "devpware_deducciones_ingresos_no_negativos_check" CHECK (
    ("NPorcentaje" IS NULL OR "NPorcentaje" >= 0) AND
    ("NValor" IS NULL OR "NValor" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_deducciones_ingresos_enfoque_fkey" FOREIGN KEY ("IdEnfoqueIngreso") REFERENCES "devpware_enfoques_ingresos" ("IdEnfoqueIngreso") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_deducciones_ingresos_IdEnfoqueIngreso_idx" ON "devpware_deducciones_ingresos" ("IdEnfoqueIngreso");
CREATE INDEX "devpware_deducciones_ingresos_IOrden_idx" ON "devpware_deducciones_ingresos" ("IOrden");

CREATE TABLE "devpware_resumenes_valores" (
  "IdResumenValor" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "NValorEnfoqueCostos" NUMERIC(24,2),
  "NValorEnfoqueMercado" NUMERIC(24,2),
  "NValorEnfoqueIngresos" NUMERIC(24,2),
  "NValorConcluido" NUMERIC(24,2),
  "SValorConLetra" VARCHAR(500),
  "SJustificacion" TEXT,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_resumenes_valores_pkey" PRIMARY KEY ("IdResumenValor"),
  CONSTRAINT "devpware_resumenes_valores_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_resumenes_valores_no_negativos_check" CHECK (
    ("NValorEnfoqueCostos" IS NULL OR "NValorEnfoqueCostos" >= 0) AND
    ("NValorEnfoqueMercado" IS NULL OR "NValorEnfoqueMercado" >= 0) AND
    ("NValorEnfoqueIngresos" IS NULL OR "NValorEnfoqueIngresos" >= 0) AND
    ("NValorConcluido" IS NULL OR "NValorConcluido" >= 0)
  ),
  CONSTRAINT "devpware_resumenes_valores_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_conclusiones_avaluos" (
  "IdConclusionAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuarioValuador" INTEGER NOT NULL,
  "IdArchivoFirma" BIGINT,
  "NValorConcluido" NUMERIC(24,2) NOT NULL,
  "SValorConLetra" VARCHAR(500) NOT NULL,
  "SJustificacion" TEXT NOT NULL,
  "SDeclaracionFinal" TEXT,
  "DFechaConclusion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_conclusiones_avaluos_pkey" PRIMARY KEY ("IdConclusionAvaluo"),
  CONSTRAINT "devpware_conclusiones_avaluos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_conclusiones_avaluos_NValorConcluido_check" CHECK ("NValorConcluido" >= 0),
  CONSTRAINT "devpware_conclusiones_avaluos_SValorConLetra_check" CHECK (btrim("SValorConLetra") <> ''),
  CONSTRAINT "devpware_conclusiones_avaluos_SJustificacion_check" CHECK (btrim("SJustificacion") <> ''),
  CONSTRAINT "devpware_conclusiones_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_conclusiones_avaluos_IdUsuarioValuador_fkey" FOREIGN KEY ("IdUsuarioValuador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_conclusiones_avaluos_IdArchivoFirma_fkey" FOREIGN KEY ("IdArchivoFirma") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_conclusiones_avaluos_IdUsuarioValuador_idx" ON "devpware_conclusiones_avaluos" ("IdUsuarioValuador");
CREATE INDEX "devpware_conclusiones_avaluos_IdArchivoFirma_idx" ON "devpware_conclusiones_avaluos" ("IdArchivoFirma");
CREATE INDEX "devpware_conclusiones_avaluos_DFechaConclusion_idx" ON "devpware_conclusiones_avaluos" ("DFechaConclusion");

INSERT INTO "devpware_tipos_comparables" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('TERRENO_VENTA', 'Terreno en venta', 'Comparable de terreno en venta.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INMUEBLE_VENTA', 'Inmueble en venta', 'Comparable de inmueble en venta.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INMUEBLE_RENTA', 'Inmueble en renta', 'Comparable de inmueble en renta.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

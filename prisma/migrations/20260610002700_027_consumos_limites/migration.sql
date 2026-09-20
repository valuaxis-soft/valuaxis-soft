-- Migracion 027_consumos_limites
-- Medicion de uso, reservas atomicas y limites por plan/concesion.
BEGIN;

CREATE TABLE "devpware_periodos_consumos" (
  "IdPeriodoConsumo" BIGSERIAL NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdSuscripcion" BIGINT,
  "SClavePeriodo" VARCHAR(120) NOT NULL,
  "STipoPeriodo" VARCHAR(40) NOT NULL,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL,
  "DFechaFin" TIMESTAMPTZ(3),
  "BCerrado" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCierre" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_periodos_consumos_pkey" PRIMARY KEY ("IdPeriodoConsumo"),
  CONSTRAINT "devpware_periodos_consumos_org_clave_key" UNIQUE ("IdOrganizacion","SClavePeriodo"),
  CONSTRAINT "devpware_periodos_consumos_clave_check" CHECK (btrim("SClavePeriodo")<>''),
  CONSTRAINT "devpware_periodos_consumos_tipo_check" CHECK ("STipoPeriodo" IN ('TOTAL','DIA','SEMANA','MES','CICLO_FACTURACION','ANO')),
  CONSTRAINT "devpware_periodos_consumos_fechas_check" CHECK ("DFechaFin" IS NULL OR "DFechaFin">"DFechaInicio"),
  CONSTRAINT "devpware_periodos_consumos_cierre_check" CHECK (("BCerrado"=false) OR "DFechaCierre" IS NOT NULL),
  CONSTRAINT "devpware_periodos_consumos_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_periodos_consumos_suscripcion_fkey" FOREIGN KEY ("IdSuscripcion") REFERENCES "devpware_suscripciones" ("IdSuscripcion") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_contadores_consumos" (
  "IdContadorConsumo" BIGSERIAL NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdFuncionalidad" INTEGER NOT NULL,
  "IdPeriodoConsumo" BIGINT NOT NULL,
  "ICantidadConsumida" BIGINT NOT NULL DEFAULT 0,
  "ICantidadReservada" BIGINT NOT NULL DEFAULT 0,
  "ILimiteAplicado" BIGINT,
  "BSinLimite" BOOLEAN NOT NULL DEFAULT false,
  "IVersionFila" INTEGER NOT NULL DEFAULT 1,
  "DFechaUltimoConsumo" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_contadores_consumos_pkey" PRIMARY KEY ("IdContadorConsumo"),
  CONSTRAINT "devpware_contadores_consumos_org_func_periodo_key" UNIQUE ("IdOrganizacion","IdFuncionalidad","IdPeriodoConsumo"),
  CONSTRAINT "devpware_contadores_consumos_cantidades_check" CHECK ("ICantidadConsumida">=0 AND "ICantidadReservada">=0 AND ("ILimiteAplicado" IS NULL OR "ILimiteAplicado">=0)),
  CONSTRAINT "devpware_contadores_consumos_limite_check" CHECK (("BSinLimite"=true AND "ILimiteAplicado" IS NULL) OR "BSinLimite"=false),
  CONSTRAINT "devpware_contadores_consumos_version_check" CHECK ("IVersionFila">=1),
  CONSTRAINT "devpware_contadores_consumos_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_contadores_consumos_func_fkey" FOREIGN KEY ("IdFuncionalidad") REFERENCES "devpware_funcionalidades" ("IdFuncionalidad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_contadores_consumos_periodo_fkey" FOREIGN KEY ("IdPeriodoConsumo") REFERENCES "devpware_periodos_consumos" ("IdPeriodoConsumo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_reservas_consumos" (
  "IdReservaConsumo" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdContadorConsumo" BIGINT NOT NULL,
  "IdUsuario" INTEGER,
  "IdAvaluo" INTEGER,
  "SClaveIdempotencia" VARCHAR(255) NOT NULL,
  "ICantidad" BIGINT NOT NULL,
  "SEstado" VARCHAR(40) NOT NULL DEFAULT 'RESERVADA',
  "SMotivo" VARCHAR(500),
  "DFechaReserva" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3),
  "DFechaConfirmacion" TIMESTAMPTZ(3),
  "DFechaLiberacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_reservas_consumos_pkey" PRIMARY KEY ("IdReservaConsumo"),
  CONSTRAINT "devpware_reservas_consumos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_reservas_consumos_idempotencia_key" UNIQUE ("SClaveIdempotencia"),
  CONSTRAINT "devpware_reservas_consumos_idempotencia_check" CHECK (btrim("SClaveIdempotencia")<>''),
  CONSTRAINT "devpware_reservas_consumos_cantidad_check" CHECK ("ICantidad">0),
  CONSTRAINT "devpware_reservas_consumos_estado_check" CHECK ("SEstado" IN ('RESERVADA','CONFIRMADA','LIBERADA','EXPIRADA','CANCELADA')),
  CONSTRAINT "devpware_reservas_consumos_fechas_check" CHECK (("DFechaExpiracion" IS NULL OR "DFechaExpiracion">"DFechaReserva") AND (("SEstado"<>'CONFIRMADA') OR "DFechaConfirmacion" IS NOT NULL) AND (("SEstado" NOT IN ('LIBERADA','EXPIRADA','CANCELADA')) OR "DFechaLiberacion" IS NOT NULL)),
  CONSTRAINT "devpware_reservas_consumos_contador_fkey" FOREIGN KEY ("IdContadorConsumo") REFERENCES "devpware_contadores_consumos" ("IdContadorConsumo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_reservas_consumos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_reservas_consumos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_movimientos_consumos" (
  "IdMovimientoConsumo" BIGSERIAL NOT NULL,
  "IdContadorConsumo" BIGINT NOT NULL,
  "IdReservaConsumo" BIGINT,
  "IdUsuario" INTEGER,
  "IdAvaluo" INTEGER,
  "IdExportacionAvaluo" BIGINT,
  "STipoMovimiento" VARCHAR(40) NOT NULL,
  "ICantidad" BIGINT NOT NULL,
  "SSource" VARCHAR(120),
  "SIdentificadorSource" VARCHAR(180),
  "SClaveIdempotencia" VARCHAR(255) NOT NULL,
  "JMetadatos" JSONB,
  "DFechaMovimiento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_movimientos_consumos_pkey" PRIMARY KEY ("IdMovimientoConsumo"),
  CONSTRAINT "devpware_movimientos_consumos_idempotencia_key" UNIQUE ("SClaveIdempotencia"),
  CONSTRAINT "devpware_movimientos_consumos_tipo_check" CHECK ("STipoMovimiento" IN ('CONSUMO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','REVERSO')),
  CONSTRAINT "devpware_movimientos_consumos_cantidad_check" CHECK ("ICantidad"<>0),
  CONSTRAINT "devpware_movimientos_consumos_idempotencia_check" CHECK (btrim("SClaveIdempotencia")<>''),
  CONSTRAINT "devpware_movimientos_consumos_contador_fkey" FOREIGN KEY ("IdContadorConsumo") REFERENCES "devpware_contadores_consumos" ("IdContadorConsumo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_consumos_reserva_fkey" FOREIGN KEY ("IdReservaConsumo") REFERENCES "devpware_reservas_consumos" ("IdReservaConsumo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_consumos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_consumos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_consumos_exportacion_fkey" FOREIGN KEY ("IdExportacionAvaluo") REFERENCES "devpware_exportaciones_avaluos" ("IdExportacionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE
);

COMMIT;

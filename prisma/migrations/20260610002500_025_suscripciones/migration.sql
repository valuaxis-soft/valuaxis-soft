-- Migracion 025_suscripciones
-- Suscripciones por organizacion, periodos, cambios de plan y concesiones comerciales.
BEGIN;

CREATE TABLE "devpware_estados_suscripciones" (
  "IdEstadoSuscripcion" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BPermiteUsoPagado" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_estados_suscripciones_pkey" PRIMARY KEY ("IdEstadoSuscripcion"),
  CONSTRAINT "devpware_estados_suscripciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_suscripciones_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_estados_suscripciones_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_estados_suscripciones_orden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_suscripciones" (
  "IdSuscripcion" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdPlan" INTEGER NOT NULL,
  "IdPrecioPlan" BIGINT,
  "IdEstadoSuscripcion" INTEGER NOT NULL,
  "IdUsuarioAlta" INTEGER,
  "SProveedorPago" VARCHAR(80),
  "SIdentificadorExterno" VARCHAR(255),
  "BCancelarAlFinalPeriodo" BOOLEAN NOT NULL DEFAULT false,
  "BRenovacionAutomatica" BOOLEAN NOT NULL DEFAULT false,
  "BEsPrueba" BOOLEAN NOT NULL DEFAULT false,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaFinPrueba" TIMESTAMPTZ(3),
  "DFechaPeriodoActualInicio" TIMESTAMPTZ(3),
  "DFechaPeriodoActualFin" TIMESTAMPTZ(3),
  "DFechaGraciaFin" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  "SMotivoCancelacion" VARCHAR(1000),
  "JMetadatos" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_suscripciones_pkey" PRIMARY KEY ("IdSuscripcion"),
  CONSTRAINT "devpware_suscripciones_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_suscripciones_prueba_check" CHECK (("BEsPrueba" = false) OR ("DFechaFinPrueba" IS NOT NULL AND "DFechaFinPrueba" > "DFechaInicio")),
  CONSTRAINT "devpware_suscripciones_periodo_check" CHECK (("DFechaPeriodoActualInicio" IS NULL AND "DFechaPeriodoActualFin" IS NULL) OR ("DFechaPeriodoActualInicio" IS NOT NULL AND "DFechaPeriodoActualFin" IS NOT NULL AND "DFechaPeriodoActualFin" > "DFechaPeriodoActualInicio")),
  CONSTRAINT "devpware_suscripciones_cancelacion_check" CHECK (("DFechaCancelacion" IS NULL) OR ("SMotivoCancelacion" IS NOT NULL AND btrim("SMotivoCancelacion") <> '')),
  CONSTRAINT "devpware_suscripciones_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_suscripciones_plan_fkey" FOREIGN KEY ("IdPlan") REFERENCES "devpware_planes" ("IdPlan") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_suscripciones_precio_fkey" FOREIGN KEY ("IdPrecioPlan") REFERENCES "devpware_precios_planes" ("IdPrecioPlan") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_suscripciones_estado_fkey" FOREIGN KEY ("IdEstadoSuscripcion") REFERENCES "devpware_estados_suscripciones" ("IdEstadoSuscripcion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_suscripciones_usuario_alta_fkey" FOREIGN KEY ("IdUsuarioAlta") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_periodos_suscripciones" (
  "IdPeriodoSuscripcion" BIGSERIAL NOT NULL,
  "IdSuscripcion" BIGINT NOT NULL,
  "INumeroPeriodo" INTEGER NOT NULL,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL,
  "DFechaFin" TIMESTAMPTZ(3) NOT NULL,
  "BEsPrueba" BOOLEAN NOT NULL DEFAULT false,
  "BCerrado" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCierre" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_periodos_suscripciones_pkey" PRIMARY KEY ("IdPeriodoSuscripcion"),
  CONSTRAINT "devpware_periodos_suscripciones_numero_key" UNIQUE ("IdSuscripcion","INumeroPeriodo"),
  CONSTRAINT "devpware_periodos_suscripciones_numero_check" CHECK ("INumeroPeriodo" >= 1),
  CONSTRAINT "devpware_periodos_suscripciones_fechas_check" CHECK ("DFechaFin" > "DFechaInicio"),
  CONSTRAINT "devpware_periodos_suscripciones_cierre_check" CHECK (("BCerrado" = false) OR ("DFechaCierre" IS NOT NULL)),
  CONSTRAINT "devpware_periodos_suscripciones_suscripcion_fkey" FOREIGN KEY ("IdSuscripcion") REFERENCES "devpware_suscripciones" ("IdSuscripcion") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_cambios_suscripciones" (
  "IdCambioSuscripcion" BIGSERIAL NOT NULL,
  "IdSuscripcion" BIGINT NOT NULL,
  "IdPlanAnterior" INTEGER,
  "IdPlanNuevo" INTEGER NOT NULL,
  "IdPrecioAnterior" BIGINT,
  "IdPrecioNuevo" BIGINT,
  "IdUsuario" INTEGER,
  "STipoCambio" VARCHAR(80) NOT NULL,
  "SMotivo" VARCHAR(1000),
  "DFechaEfectiva" TIMESTAMPTZ(3) NOT NULL,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_cambios_suscripciones_pkey" PRIMARY KEY ("IdCambioSuscripcion"),
  CONSTRAINT "devpware_cambios_suscripciones_tipo_check" CHECK ("STipoCambio" IN ('ALTA','UPGRADE','DOWNGRADE','RENOVACION','CANCELACION','REACTIVACION','CORRECCION')),
  CONSTRAINT "devpware_cambios_suscripciones_suscripcion_fkey" FOREIGN KEY ("IdSuscripcion") REFERENCES "devpware_suscripciones" ("IdSuscripcion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_cambios_suscripciones_plan_anterior_fkey" FOREIGN KEY ("IdPlanAnterior") REFERENCES "devpware_planes" ("IdPlan") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_cambios_suscripciones_plan_nuevo_fkey" FOREIGN KEY ("IdPlanNuevo") REFERENCES "devpware_planes" ("IdPlan") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_cambios_suscripciones_precio_anterior_fkey" FOREIGN KEY ("IdPrecioAnterior") REFERENCES "devpware_precios_planes" ("IdPrecioPlan") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_cambios_suscripciones_precio_nuevo_fkey" FOREIGN KEY ("IdPrecioNuevo") REFERENCES "devpware_precios_planes" ("IdPrecioPlan") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_cambios_suscripciones_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_concesiones_funcionalidades" (
  "IdConcesionFuncionalidad" BIGSERIAL NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdFuncionalidad" INTEGER NOT NULL,
  "IdUsuarioAutorizador" INTEGER,
  "BConcedida" BOOLEAN NOT NULL DEFAULT true,
  "BSinLimite" BOOLEAN NOT NULL DEFAULT false,
  "ILimitePersonalizado" BIGINT,
  "SPeriodoLimite" VARCHAR(40),
  "SMotivo" VARCHAR(1000) NOT NULL,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaFin" TIMESTAMPTZ(3),
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_concesiones_funcionalidades_pkey" PRIMARY KEY ("IdConcesionFuncionalidad"),
  CONSTRAINT "devpware_concesiones_funcionalidades_motivo_check" CHECK (btrim("SMotivo") <> ''),
  CONSTRAINT "devpware_concesiones_funcionalidades_limite_check" CHECK ("ILimitePersonalizado" IS NULL OR "ILimitePersonalizado" >= 0),
  CONSTRAINT "devpware_concesiones_funcionalidades_periodo_check" CHECK ("SPeriodoLimite" IS NULL OR "SPeriodoLimite" IN ('TOTAL','DIA','SEMANA','MES','CICLO_FACTURACION','ANO')),
  CONSTRAINT "devpware_concesiones_funcionalidades_fechas_check" CHECK ("DFechaFin" IS NULL OR "DFechaFin" > "DFechaInicio"),
  CONSTRAINT "devpware_concesiones_funcionalidades_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_concesiones_funcionalidades_func_fkey" FOREIGN KEY ("IdFuncionalidad") REFERENCES "devpware_funcionalidades" ("IdFuncionalidad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_concesiones_funcionalidades_usuario_fkey" FOREIGN KEY ("IdUsuarioAutorizador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "devpware_estados_suscripciones" ("SClave","SNombre","SDescripcion","BPermiteUsoPagado","BEsFinal","BActivo","IOrden","DFechaCreacion","DFechaModificacion") VALUES
 ('BORRADOR','Borrador','Suscripcion gratuita base para trabajar borradores.',false,false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('PRUEBA','Prueba','Periodo de prueba activo.',true,false,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('ACTIVA','Activa','Suscripcion pagada vigente.',true,false,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('PAGO_PENDIENTE','Pago pendiente','Pago pendiente o en proceso.',false,false,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('VENCIDA','Vencida','Suscripcion fuera de vigencia.',false,false,true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('SUSPENDIDA','Suspendida','Suscripcion suspendida.',false,false,true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('CANCELADA','Cancelada','Suscripcion cancelada.',false,true,true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BPermiteUsoPagado"=EXCLUDED."BPermiteUsoPagado","BEsFinal"=EXCLUDED."BEsFinal","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

-- Toda organizacion debe tener una suscripcion base. El backend puede cambiarla al confirmar un pago.
INSERT INTO "devpware_suscripciones" (
  "IdOrganizacion","IdPlan","IdEstadoSuscripcion","IdUsuarioAlta","BCancelarAlFinalPeriodo","BRenovacionAutomatica","BEsPrueba","DFechaInicio","DFechaCreacion","DFechaModificacion"
)
SELECT o."IdOrganizacion",p."IdPlan",e."IdEstadoSuscripcion",NULL,false,false,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "devpware_organizaciones" o
JOIN "devpware_planes" p ON p."SClave"='BORRADOR'
JOIN "devpware_estados_suscripciones" e ON e."SClave"='BORRADOR'
WHERE o."DFechaEliminacion" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "devpware_suscripciones" s WHERE s."IdOrganizacion"=o."IdOrganizacion" AND s."DFechaFinalizacion" IS NULL);

CREATE OR REPLACE FUNCTION "devpware_fn_asignar_suscripcion_borrador"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_plan INTEGER; v_estado INTEGER;
BEGIN
  SELECT "IdPlan" INTO v_plan FROM "devpware_planes" WHERE "SClave"='BORRADOR' AND "BActivo"=true;
  SELECT "IdEstadoSuscripcion" INTO v_estado FROM "devpware_estados_suscripciones" WHERE "SClave"='BORRADOR' AND "BActivo"=true;
  IF v_plan IS NULL OR v_estado IS NULL THEN
    RAISE EXCEPTION 'No existe el plan/estado BORRADOR requerido para registrar organizaciones';
  END IF;
  INSERT INTO "devpware_suscripciones" ("IdOrganizacion","IdPlan","IdEstadoSuscripcion","BCancelarAlFinalPeriodo","BRenovacionAutomatica","BEsPrueba","DFechaInicio","DFechaCreacion","DFechaModificacion")
  VALUES (NEW."IdOrganizacion",v_plan,v_estado,false,false,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "devpware_organizaciones_suscripcion_borrador"
AFTER INSERT ON "devpware_organizaciones"
FOR EACH ROW EXECUTE FUNCTION "devpware_fn_asignar_suscripcion_borrador"();

COMMIT;

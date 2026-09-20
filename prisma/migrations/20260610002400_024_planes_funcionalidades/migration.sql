-- Migracion 024_planes_funcionalidades
-- Catalogo comercial de planes, funcionalidades, precios y capacidades incluidas.
BEGIN;

CREATE TABLE "devpware_tipos_funcionalidades" (
  "IdTipoFuncionalidad" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_funcionalidades_pkey" PRIMARY KEY ("IdTipoFuncionalidad"),
  CONSTRAINT "devpware_tipos_funcionalidades_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_funcionalidades_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_funcionalidades_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_funcionalidades_orden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_funcionalidades" (
  "IdFuncionalidad" SERIAL NOT NULL,
  "IdTipoFuncionalidad" INTEGER NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "SUnidadConsumo" VARCHAR(80),
  "BRequiereSuscripcionActiva" BOOLEAN NOT NULL DEFAULT false,
  "BControlaLimite" BOOLEAN NOT NULL DEFAULT false,
  "BEsVisibleComercialmente" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_funcionalidades_pkey" PRIMARY KEY ("IdFuncionalidad"),
  CONSTRAINT "devpware_funcionalidades_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_funcionalidades_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_funcionalidades_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_funcionalidades_unidad_check" CHECK (("BControlaLimite" = false) OR ("SUnidadConsumo" IS NOT NULL AND btrim("SUnidadConsumo") <> '')),
  CONSTRAINT "devpware_funcionalidades_orden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_funcionalidades_tipo_fkey" FOREIGN KEY ("IdTipoFuncionalidad") REFERENCES "devpware_tipos_funcionalidades" ("IdTipoFuncionalidad") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "devpware_planes" (
  "IdPlan" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "BEsGratuito" BOOLEAN NOT NULL DEFAULT false,
  "BEsPublico" BOOLEAN NOT NULL DEFAULT true,
  "BPermitePrueba" BOOLEAN NOT NULL DEFAULT false,
  "IDiasPrueba" INTEGER,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_planes_pkey" PRIMARY KEY ("IdPlan"),
  CONSTRAINT "devpware_planes_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_planes_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_planes_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_planes_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_planes_prueba_check" CHECK (("BPermitePrueba" = false AND "IDiasPrueba" IS NULL) OR ("BPermitePrueba" = true AND "IDiasPrueba" BETWEEN 1 AND 365)),
  CONSTRAINT "devpware_planes_orden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_funcionalidades_planes" (
  "IdFuncionalidadPlan" BIGSERIAL NOT NULL,
  "IdPlan" INTEGER NOT NULL,
  "IdFuncionalidad" INTEGER NOT NULL,
  "BIncluida" BOOLEAN NOT NULL DEFAULT true,
  "BSinLimite" BOOLEAN NOT NULL DEFAULT false,
  "ILimiteIncluido" BIGINT,
  "SPeriodoLimite" VARCHAR(40),
  "BPermiteCompraAdicional" BOOLEAN NOT NULL DEFAULT false,
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_funcionalidades_planes_pkey" PRIMARY KEY ("IdFuncionalidadPlan"),
  CONSTRAINT "devpware_funcionalidades_planes_plan_func_key" UNIQUE ("IdPlan", "IdFuncionalidad"),
  CONSTRAINT "devpware_funcionalidades_planes_limite_check" CHECK (
    ("BIncluida" = false AND "BSinLimite" = false AND "ILimiteIncluido" IS NULL AND "SPeriodoLimite" IS NULL)
    OR
    ("BIncluida" = true AND (("BSinLimite" = true AND "ILimiteIncluido" IS NULL) OR ("BSinLimite" = false AND "ILimiteIncluido" IS NOT NULL AND "ILimiteIncluido" >= 0)))
  ),
  CONSTRAINT "devpware_funcionalidades_planes_periodo_check" CHECK ("SPeriodoLimite" IS NULL OR "SPeriodoLimite" IN ('TOTAL','DIA','SEMANA','MES','CICLO_FACTURACION','ANO')),
  CONSTRAINT "devpware_funcionalidades_planes_plan_fkey" FOREIGN KEY ("IdPlan") REFERENCES "devpware_planes" ("IdPlan") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_funcionalidades_planes_funcionalidad_fkey" FOREIGN KEY ("IdFuncionalidad") REFERENCES "devpware_funcionalidades" ("IdFuncionalidad") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "devpware_precios_planes" (
  "IdPrecioPlan" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdPlan" INTEGER NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SMoneda" VARCHAR(3) NOT NULL,
  "SIntervaloCobro" VARCHAR(40) NOT NULL,
  "IIntervalos" INTEGER NOT NULL DEFAULT 1,
  "NImporte" NUMERIC(24,2) NOT NULL,
  "NImpuestoPorcentaje" NUMERIC(8,4) NOT NULL DEFAULT 0,
  "SIdentificadorExterno" VARCHAR(255),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaVigenciaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaVigenciaFin" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_precios_planes_pkey" PRIMARY KEY ("IdPrecioPlan"),
  CONSTRAINT "devpware_precios_planes_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_precios_planes_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_precios_planes_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_precios_planes_moneda_check" CHECK ("SMoneda" ~ '^[A-Z]{3}$'),
  CONSTRAINT "devpware_precios_planes_intervalo_check" CHECK ("SIntervaloCobro" IN ('UNICO','DIA','SEMANA','MES','ANO')),
  CONSTRAINT "devpware_precios_planes_intervalos_check" CHECK ("IIntervalos" >= 1),
  CONSTRAINT "devpware_precios_planes_importe_check" CHECK ("NImporte" >= 0),
  CONSTRAINT "devpware_precios_planes_impuesto_check" CHECK ("NImpuestoPorcentaje" BETWEEN 0 AND 100),
  CONSTRAINT "devpware_precios_planes_vigencia_check" CHECK ("DFechaVigenciaFin" IS NULL OR "DFechaVigenciaFin" > "DFechaVigenciaInicio"),
  CONSTRAINT "devpware_precios_planes_plan_fkey" FOREIGN KEY ("IdPlan") REFERENCES "devpware_planes" ("IdPlan") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "devpware_tipos_funcionalidades" ("SClave","SNombre","SDescripcion","BActivo","IOrden","DFechaCreacion","DFechaModificacion") VALUES
 ('ACCESO','Acceso','Habilita o bloquea una capacidad del sistema.',true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('LIMITE','Limite','Capacidad controlada por cantidad total o por periodo.',true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('CONSUMO','Consumo','Capacidad cuyo uso se registra para medicion o cobro.',true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

WITH datos("SClaveTipo","SClave","SNombre","SDescripcion","SUnidadConsumo","BRequiereSuscripcionActiva","BControlaLimite","IOrden") AS (
 VALUES
 ('LIMITE','AVALUO_CREAR','Crear avaluos','Permite crear nuevos proyectos de avaluo.','AVALUO',false,true,1),
 ('ACCESO','AVALUO_EDITAR','Editar avaluos','Permite trabajar y guardar borradores. ',NULL,false,false,2),
 ('ACCESO','AVALUO_CONCLUIR','Concluir avaluos','Permite concluir una version del avaluo.',NULL,false,false,3),
 ('CONSUMO','AVALUO_IMPRIMIR','Imprimir avaluos','Permite generar una salida imprimible o PDF final.','IMPRESION',true,true,4),
 ('CONSUMO','AVALUO_EXPORTAR','Exportar avaluos','Permite exportar a PDF, Excel u otros formatos.','EXPORTACION',true,true,5),
 ('ACCESO','AVALUO_COMPARTIR','Compartir avaluos','Permite compartir resultados o enlaces con terceros.',NULL,true,false,6),
 ('ACCESO','AVALUO_PUBLICAR_GOBIERNO','Publicar en plataforma gubernamental','Reserva la capacidad para integraciones gubernamentales futuras.',NULL,true,false,7),
 ('LIMITE','USUARIO_MIEMBRO','Miembros de organizacion','Cantidad maxima de miembros activos por organizacion.','USUARIO',true,true,8),
 ('LIMITE','ALMACENAMIENTO_BYTES','Almacenamiento','Cantidad de bytes disponibles para archivos.','BYTE',true,true,9),
 ('CONSUMO','EXTRACCION_IA','Extracciones con IA','Cantidad de extracciones asistidas por IA.','EXTRACCION_IA',true,true,10)
)
INSERT INTO "devpware_funcionalidades" ("IdTipoFuncionalidad","SClave","SNombre","SDescripcion","SUnidadConsumo","BRequiereSuscripcionActiva","BControlaLimite","BEsVisibleComercialmente","BActivo","IOrden","DFechaCreacion","DFechaModificacion")
SELECT t."IdTipoFuncionalidad",d."SClave",d."SNombre",d."SDescripcion",d."SUnidadConsumo",d."BRequiereSuscripcionActiva",d."BControlaLimite",true,true,d."IOrden",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM datos d JOIN "devpware_tipos_funcionalidades" t ON t."SClave"=d."SClaveTipo"
ON CONFLICT ("SClave") DO UPDATE SET "IdTipoFuncionalidad"=EXCLUDED."IdTipoFuncionalidad","SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","SUnidadConsumo"=EXCLUDED."SUnidadConsumo","BRequiereSuscripcionActiva"=EXCLUDED."BRequiereSuscripcionActiva","BControlaLimite"=EXCLUDED."BControlaLimite","BActivo"=true,"IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

INSERT INTO "devpware_planes" ("SClave","SNombre","SDescripcion","BEsGratuito","BEsPublico","BPermitePrueba","IDiasPrueba","BActivo","IOrden","DFechaCreacion","DFechaModificacion") VALUES
 ('BORRADOR','Borrador','Permite registrarse, crear y trabajar borradores; bloquea impresion, exportacion, comparticion y publicacion hasta contratar.',true,true,false,NULL,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('PROFESIONAL','Profesional','Plan de pago para concluir, imprimir, exportar y compartir avaluos.',false,true,true,14,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BEsGratuito"=EXCLUDED."BEsGratuito","BEsPublico"=EXCLUDED."BEsPublico","BPermitePrueba"=EXCLUDED."BPermitePrueba","IDiasPrueba"=EXCLUDED."IDiasPrueba","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

-- Configuracion inicial flexible: BORRADOR permite 1 avaluo total. Cambie ILimiteIncluido a NULL + BSinLimite=true si el cliente decide permitir varios.
WITH reglas("SPlan","SFunc","BIncluida","BSinLimite","ILimiteIncluido","SPeriodoLimite") AS (
 VALUES
 ('BORRADOR','AVALUO_CREAR',true,false,1,'TOTAL'),
 ('BORRADOR','AVALUO_EDITAR',true,true,NULL,NULL),
 ('BORRADOR','AVALUO_CONCLUIR',false,false,NULL,NULL),
 ('BORRADOR','AVALUO_IMPRIMIR',false,false,NULL,NULL),
 ('BORRADOR','AVALUO_EXPORTAR',false,false,NULL,NULL),
 ('BORRADOR','AVALUO_COMPARTIR',false,false,NULL,NULL),
 ('BORRADOR','AVALUO_PUBLICAR_GOBIERNO',false,false,NULL,NULL),
 ('BORRADOR','USUARIO_MIEMBRO',true,false,1,'TOTAL'),
 ('PROFESIONAL','AVALUO_CREAR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_EDITAR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_CONCLUIR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_IMPRIMIR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_EXPORTAR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_COMPARTIR',true,true,NULL,NULL),
 ('PROFESIONAL','AVALUO_PUBLICAR_GOBIERNO',true,true,NULL,NULL),
 ('PROFESIONAL','USUARIO_MIEMBRO',true,false,5,'TOTAL')
)
INSERT INTO "devpware_funcionalidades_planes" ("IdPlan","IdFuncionalidad","BIncluida","BSinLimite","ILimiteIncluido","SPeriodoLimite","BPermiteCompraAdicional","DFechaCreacion","DFechaModificacion")
SELECT p."IdPlan",f."IdFuncionalidad",r."BIncluida",r."BSinLimite",r."ILimiteIncluido",r."SPeriodoLimite",false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM reglas r JOIN "devpware_planes" p ON p."SClave"=r."SPlan" JOIN "devpware_funcionalidades" f ON f."SClave"=r."SFunc"
ON CONFLICT ("IdPlan","IdFuncionalidad") DO UPDATE SET "BIncluida"=EXCLUDED."BIncluida","BSinLimite"=EXCLUDED."BSinLimite","ILimiteIncluido"=EXCLUDED."ILimiteIncluido","SPeriodoLimite"=EXCLUDED."SPeriodoLimite","DFechaModificacion"=CURRENT_TIMESTAMP;

COMMIT;

-- Migracion 028_permisos_opciones
-- Opciones de interfaz/API, permisos requeridos, funcionalidades comerciales y excepciones por miembro.
BEGIN;

CREATE TABLE "devpware_opciones_sistema" (
  "IdOpcionSistema" SERIAL NOT NULL,
  "IdOpcionPadre" INTEGER,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "STipoOpcion" VARCHAR(40) NOT NULL,
  "SRuta" VARCHAR(500),
  "SMetodoHttp" VARCHAR(10),
  "SIcono" VARCHAR(120),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "BVisible" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_opciones_sistema_pkey" PRIMARY KEY ("IdOpcionSistema"),
  CONSTRAINT "devpware_opciones_sistema_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_opciones_sistema_clave_check" CHECK (btrim("SClave")<>''),
  CONSTRAINT "devpware_opciones_sistema_nombre_check" CHECK (btrim("SNombre")<>''),
  CONSTRAINT "devpware_opciones_sistema_tipo_check" CHECK ("STipoOpcion" IN ('MODULO','MENU','PANTALLA','ACCION','ENDPOINT')),
  CONSTRAINT "devpware_opciones_sistema_metodo_check" CHECK ("SMetodoHttp" IS NULL OR "SMetodoHttp" IN ('GET','POST','PUT','PATCH','DELETE','OPTIONS')),
  CONSTRAINT "devpware_opciones_sistema_orden_check" CHECK ("IOrden">=0),
  CONSTRAINT "devpware_opciones_sistema_padre_check" CHECK ("IdOpcionPadre" IS NULL OR "IdOpcionPadre"<>"IdOpcionSistema"),
  CONSTRAINT "devpware_opciones_sistema_padre_fkey" FOREIGN KEY ("IdOpcionPadre") REFERENCES "devpware_opciones_sistema" ("IdOpcionSistema") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_permisos_opciones" (
  "IdPermisoOpcion" BIGSERIAL NOT NULL,
  "IdOpcionSistema" INTEGER NOT NULL,
  "IdPermiso" INTEGER NOT NULL,
  "BObligatorio" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_permisos_opciones_pkey" PRIMARY KEY ("IdPermisoOpcion"),
  CONSTRAINT "devpware_permisos_opciones_opcion_permiso_key" UNIQUE ("IdOpcionSistema","IdPermiso"),
  CONSTRAINT "devpware_permisos_opciones_opcion_fkey" FOREIGN KEY ("IdOpcionSistema") REFERENCES "devpware_opciones_sistema" ("IdOpcionSistema") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_permisos_opciones_permiso_fkey" FOREIGN KEY ("IdPermiso") REFERENCES "devpware_permisos" ("IdPermiso") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_funcionalidades_opciones" (
  "IdFuncionalidadOpcion" BIGSERIAL NOT NULL,
  "IdOpcionSistema" INTEGER NOT NULL,
  "IdFuncionalidad" INTEGER NOT NULL,
  "BObligatoria" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_funcionalidades_opciones_pkey" PRIMARY KEY ("IdFuncionalidadOpcion"),
  CONSTRAINT "devpware_funcionalidades_opciones_opcion_func_key" UNIQUE ("IdOpcionSistema","IdFuncionalidad"),
  CONSTRAINT "devpware_funcionalidades_opciones_opcion_fkey" FOREIGN KEY ("IdOpcionSistema") REFERENCES "devpware_opciones_sistema" ("IdOpcionSistema") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_funcionalidades_opciones_func_fkey" FOREIGN KEY ("IdFuncionalidad") REFERENCES "devpware_funcionalidades" ("IdFuncionalidad") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_excepciones_permisos_miembros" (
  "IdExcepcionPermisoMiembro" BIGSERIAL NOT NULL,
  "IdMiembroOrganizacion" INTEGER NOT NULL,
  "IdPermiso" INTEGER NOT NULL,
  "BConcedido" BOOLEAN NOT NULL,
  "IdUsuarioAutorizador" INTEGER,
  "SMotivo" VARCHAR(1000) NOT NULL,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaFin" TIMESTAMPTZ(3),
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_excepciones_permisos_miembros_pkey" PRIMARY KEY ("IdExcepcionPermisoMiembro"),
  CONSTRAINT "devpware_excepciones_permisos_miembros_motivo_check" CHECK (btrim("SMotivo")<>''),
  CONSTRAINT "devpware_excepciones_permisos_miembros_fechas_check" CHECK ("DFechaFin" IS NULL OR "DFechaFin">"DFechaInicio"),
  CONSTRAINT "devpware_excepciones_permisos_miembros_miembro_fkey" FOREIGN KEY ("IdMiembroOrganizacion") REFERENCES "devpware_miembros_organizaciones" ("IdMiembroOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_excepciones_permisos_miembros_permiso_fkey" FOREIGN KEY ("IdPermiso") REFERENCES "devpware_permisos" ("IdPermiso") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_excepciones_permisos_miembros_autorizador_fkey" FOREIGN KEY ("IdUsuarioAutorizador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_excepciones_permisos_miembros_activas_key" ON "devpware_excepciones_permisos_miembros" ("IdMiembroOrganizacion","IdPermiso") WHERE "BActiva"=true;

INSERT INTO "devpware_permisos" ("SClave","SNombre","SDescripcion","BActivo","DFechaCreacion","DFechaModificacion") VALUES
 ('AVALUO_IMPRIMIR','Imprimir avaluos','Permite solicitar impresion o PDF final.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUO_COMPARTIR','Compartir avaluos','Permite compartir un avaluo con terceros.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUO_PUBLICAR_GOBIERNO','Publicar en gobierno','Permite enviar a una plataforma gubernamental cuando exista integracion.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('SUSCRIPCION_ADMINISTRAR','Administrar suscripcion','Permite contratar, cambiar o cancelar la suscripcion.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('FACTURACION_VER','Ver facturacion','Permite consultar facturas y pagos.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('FACTURACION_ADMINISTRAR','Administrar facturacion','Permite gestionar datos fiscales y metodos de pago.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=true,"DFechaModificacion"=CURRENT_TIMESTAMP;

WITH asig("SClaveRol","SClavePermiso") AS (VALUES
 ('ADMINISTRADOR','AVALUO_IMPRIMIR'),('ADMINISTRADOR','AVALUO_COMPARTIR'),('ADMINISTRADOR','AVALUO_PUBLICAR_GOBIERNO'),('ADMINISTRADOR','SUSCRIPCION_ADMINISTRAR'),('ADMINISTRADOR','FACTURACION_VER'),('ADMINISTRADOR','FACTURACION_ADMINISTRAR'),
 ('VALUADOR','AVALUO_IMPRIMIR'),('VALUADOR','AVALUO_COMPARTIR'),('REVISOR','AVALUO_IMPRIMIR'),('CONSULTA','FACTURACION_VER')
)
INSERT INTO "devpware_permisos_roles" ("IdRol","IdPermiso","DFechaCreacion")
SELECT r."IdRol",p."IdPermiso",CURRENT_TIMESTAMP FROM asig a JOIN "devpware_roles" r ON r."SClave"=a."SClaveRol" JOIN "devpware_permisos" p ON p."SClave"=a."SClavePermiso"
ON CONFLICT ("IdRol","IdPermiso") DO NOTHING;

INSERT INTO "devpware_opciones_sistema" ("SClave","SNombre","SDescripcion","STipoOpcion","SRuta","SMetodoHttp","IOrden","BVisible","BActivo","DFechaCreacion","DFechaModificacion") VALUES
 ('AVALUOS','Avaluos','Modulo principal de avaluos.','MODULO','/avaluos',NULL,1,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUOS_CREAR','Crear avaluo','Accion para crear un proyecto.','ACCION','/api/avaluos','POST',2,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUOS_IMPRIMIR','Imprimir avaluo','Accion comercial protegida para imprimir o generar PDF final.','ACCION','/api/avaluos/:id/imprimir','POST',3,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUOS_EXPORTAR','Exportar avaluo','Accion comercial protegida para exportar.','ACCION','/api/avaluos/:id/exportar','POST',4,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('AVALUOS_COMPARTIR','Compartir avaluo','Accion comercial protegida para compartir.','ACCION','/api/avaluos/:id/compartir','POST',5,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('SUSCRIPCION','Suscripcion','Pantalla de plan, tarjeta y estado de pago.','PANTALLA','/configuracion/suscripcion',NULL,20,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('FACTURACION','Facturacion','Pantalla de facturas, pagos y metodos de pago.','PANTALLA','/configuracion/facturacion',NULL,21,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","STipoOpcion"=EXCLUDED."STipoOpcion","SRuta"=EXCLUDED."SRuta","SMetodoHttp"=EXCLUDED."SMetodoHttp","IOrden"=EXCLUDED."IOrden","BVisible"=EXCLUDED."BVisible","BActivo"=true,"DFechaModificacion"=CURRENT_TIMESTAMP;

WITH mapa("SOpcion","SPermiso") AS (VALUES
 ('AVALUOS_CREAR','AVALUO_CREAR'),('AVALUOS_IMPRIMIR','AVALUO_IMPRIMIR'),('AVALUOS_EXPORTAR','AVALUO_EXPORTAR'),('AVALUOS_COMPARTIR','AVALUO_COMPARTIR'),('SUSCRIPCION','SUSCRIPCION_ADMINISTRAR'),('FACTURACION','FACTURACION_VER')
)
INSERT INTO "devpware_permisos_opciones" ("IdOpcionSistema","IdPermiso","BObligatorio","DFechaCreacion")
SELECT o."IdOpcionSistema",p."IdPermiso",true,CURRENT_TIMESTAMP FROM mapa m JOIN "devpware_opciones_sistema" o ON o."SClave"=m."SOpcion" JOIN "devpware_permisos" p ON p."SClave"=m."SPermiso"
ON CONFLICT ("IdOpcionSistema","IdPermiso") DO UPDATE SET "BObligatorio"=true;

WITH mapa("SOpcion","SFunc") AS (VALUES
 ('AVALUOS_CREAR','AVALUO_CREAR'),('AVALUOS_IMPRIMIR','AVALUO_IMPRIMIR'),('AVALUOS_EXPORTAR','AVALUO_EXPORTAR'),('AVALUOS_COMPARTIR','AVALUO_COMPARTIR')
)
INSERT INTO "devpware_funcionalidades_opciones" ("IdOpcionSistema","IdFuncionalidad","BObligatoria","DFechaCreacion")
SELECT o."IdOpcionSistema",f."IdFuncionalidad",true,CURRENT_TIMESTAMP FROM mapa m JOIN "devpware_opciones_sistema" o ON o."SClave"=m."SOpcion" JOIN "devpware_funcionalidades" f ON f."SClave"=m."SFunc"
ON CONFLICT ("IdOpcionSistema","IdFuncionalidad") DO UPDATE SET "BObligatoria"=true;

COMMIT;

-- Migracion 029_indices_seguridad_comercial
-- Indices de autenticacion/comercial, unicidad logica y proteccion de eventos de pasarela.
BEGIN;

-- Correo unico sin distinguir mayusculas/minusculas. Fallara si ya existen duplicados logicos, lo cual es intencional.
CREATE UNIQUE INDEX "devpware_usuarios_correo_normalizado_key" ON "devpware_usuarios" (lower(btrim("SCorreo"))) WHERE "DFechaEliminacion" IS NULL;

CREATE INDEX "devpware_identidades_usuarios_usuario_activa_idx" ON "devpware_identidades_usuarios" ("IdUsuario","BActiva");
CREATE INDEX "devpware_identidades_usuarios_proveedor_correo_idx" ON "devpware_identidades_usuarios" ("IdProveedorIdentidad",lower("SCorreoProveedor")) WHERE "SCorreoProveedor" IS NOT NULL;
CREATE INDEX "devpware_tokens_verificacion_correos_usuario_pendiente_idx" ON "devpware_tokens_verificacion_correos" ("IdUsuario","DFechaExpiracion") WHERE "BUtilizado"=false AND "DFechaRevocacion" IS NULL;
CREATE INDEX "devpware_tokens_recuperaciones_usuario_pendiente_idx" ON "devpware_tokens_recuperaciones_contrasenas" ("IdUsuario","DFechaExpiracion") WHERE "BUtilizado"=false AND "DFechaRevocacion" IS NULL;
CREATE INDEX "devpware_solicitudes_oauth_pendientes_idx" ON "devpware_solicitudes_oauth" ("IdProveedorIdentidad","DFechaExpiracion") WHERE "BCompletada"=false;
CREATE INDEX "devpware_sesiones_usuario_activas_idx" ON "devpware_sesiones" ("IdUsuario","DFechaExpiracion" DESC) WHERE "BRevocada"=false;

CREATE INDEX "devpware_funcionalidades_tipo_activo_idx" ON "devpware_funcionalidades" ("IdTipoFuncionalidad","BActivo","IOrden");
CREATE INDEX "devpware_funcionalidades_planes_plan_idx" ON "devpware_funcionalidades_planes" ("IdPlan","BIncluida");
CREATE INDEX "devpware_precios_planes_vigentes_idx" ON "devpware_precios_planes" ("IdPlan","SMoneda","SIntervaloCobro","DFechaVigenciaInicio" DESC) WHERE "BActivo"=true;

CREATE UNIQUE INDEX "devpware_suscripciones_organizacion_actual_key" ON "devpware_suscripciones" ("IdOrganizacion") WHERE "DFechaFinalizacion" IS NULL;
CREATE UNIQUE INDEX "devpware_suscripciones_proveedor_externo_key" ON "devpware_suscripciones" ("SProveedorPago","SIdentificadorExterno") WHERE "SProveedorPago" IS NOT NULL AND "SIdentificadorExterno" IS NOT NULL;
CREATE INDEX "devpware_suscripciones_estado_periodo_idx" ON "devpware_suscripciones" ("IdEstadoSuscripcion","DFechaPeriodoActualFin");
CREATE INDEX "devpware_periodos_suscripciones_actual_idx" ON "devpware_periodos_suscripciones" ("IdSuscripcion","DFechaInicio","DFechaFin") WHERE "BCerrado"=false;
CREATE INDEX "devpware_concesiones_funcionalidades_activas_idx" ON "devpware_concesiones_funcionalidades" ("IdOrganizacion","IdFuncionalidad","DFechaFin") WHERE "BActiva"=true;

CREATE INDEX "devpware_facturas_org_estado_idx" ON "devpware_facturas" ("IdOrganizacion","SEstado","DFechaEmision" DESC);
CREATE UNIQUE INDEX "devpware_facturas_proveedor_externo_key" ON "devpware_facturas" ("IdProveedorPago","SIdentificadorExterno") WHERE "IdProveedorPago" IS NOT NULL AND "SIdentificadorExterno" IS NOT NULL;
CREATE INDEX "devpware_pagos_org_estado_idx" ON "devpware_pagos" ("IdOrganizacion","SEstado","DFechaCreacion" DESC);
CREATE INDEX "devpware_eventos_webhooks_pendientes_idx" ON "devpware_eventos_webhooks_pagos" ("IdProveedorPago","DFechaRecepcion") WHERE "BProcesado"=false;

CREATE INDEX "devpware_periodos_consumos_org_tipo_idx" ON "devpware_periodos_consumos" ("IdOrganizacion","STipoPeriodo","DFechaInicio" DESC);
CREATE INDEX "devpware_contadores_consumos_func_idx" ON "devpware_contadores_consumos" ("IdOrganizacion","IdFuncionalidad","IdPeriodoConsumo");
CREATE INDEX "devpware_reservas_consumos_pendientes_idx" ON "devpware_reservas_consumos" ("IdContadorConsumo","DFechaExpiracion") WHERE "SEstado"='RESERVADA';
CREATE INDEX "devpware_movimientos_consumos_org_fecha_idx" ON "devpware_movimientos_consumos" ("IdContadorConsumo","DFechaMovimiento" DESC);

CREATE INDEX "devpware_opciones_sistema_padre_orden_idx" ON "devpware_opciones_sistema" ("IdOpcionPadre","IOrden") WHERE "BActivo"=true;
CREATE INDEX "devpware_permisos_opciones_permiso_idx" ON "devpware_permisos_opciones" ("IdPermiso");
CREATE INDEX "devpware_funcionalidades_opciones_func_idx" ON "devpware_funcionalidades_opciones" ("IdFuncionalidad");

-- Evita modificar o borrar el registro original recibido desde una pasarela; solo se permite actualizar campos de procesamiento.
CREATE OR REPLACE FUNCTION "devpware_fn_proteger_evento_webhook_pago"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Los eventos webhook de pagos no pueden eliminarse';
  END IF;
  IF NEW."IdProveedorPago" IS DISTINCT FROM OLD."IdProveedorPago"
     OR NEW."SIdentificadorEvento" IS DISTINCT FROM OLD."SIdentificadorEvento"
     OR NEW."STipoEvento" IS DISTINCT FROM OLD."STipoEvento"
     OR NEW."SHashPayload" IS DISTINCT FROM OLD."SHashPayload"
     OR NEW."JPayloadSanitizado" IS DISTINCT FROM OLD."JPayloadSanitizado"
     OR NEW."DFechaRecepcion" IS DISTINCT FROM OLD."DFechaRecepcion" THEN
    RAISE EXCEPTION 'El contenido original del webhook es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "devpware_eventos_webhooks_pagos_proteger_update"
BEFORE UPDATE ON "devpware_eventos_webhooks_pagos"
FOR EACH ROW EXECUTE FUNCTION "devpware_fn_proteger_evento_webhook_pago"();

CREATE TRIGGER "devpware_eventos_webhooks_pagos_proteger_delete"
BEFORE DELETE ON "devpware_eventos_webhooks_pagos"
FOR EACH ROW EXECUTE FUNCTION "devpware_fn_proteger_evento_webhook_pago"();

COMMIT;

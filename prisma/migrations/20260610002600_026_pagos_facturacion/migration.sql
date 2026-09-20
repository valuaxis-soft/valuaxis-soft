-- Migracion 026_pagos_facturacion
-- Perfiles de cobro, metodos tokenizados, facturas, pagos, intentos y webhooks.
-- Nunca almacena numero completo de tarjeta, CVV, banda magnetica ni secretos de pasarela.
BEGIN;

CREATE TABLE "devpware_proveedores_pago" (
  "IdProveedorPago" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SSitioWeb" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_proveedores_pago_pkey" PRIMARY KEY ("IdProveedorPago"),
  CONSTRAINT "devpware_proveedores_pago_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_proveedores_pago_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_proveedores_pago_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_proveedores_pago_orden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_clientes_pago" (
  "IdClientePago" BIGSERIAL NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdProveedorPago" INTEGER NOT NULL,
  "SIdentificadorExterno" VARCHAR(255) NOT NULL,
  "SCorreoFacturacion" VARCHAR(180),
  "SNombreFacturacion" VARCHAR(220),
  "SRazonSocial" VARCHAR(220),
  "SRFC" VARCHAR(20),
  "JDireccionFacturacion" JSONB,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_clientes_pago_pkey" PRIMARY KEY ("IdClientePago"),
  CONSTRAINT "devpware_clientes_pago_org_proveedor_key" UNIQUE ("IdOrganizacion","IdProveedorPago"),
  CONSTRAINT "devpware_clientes_pago_proveedor_externo_key" UNIQUE ("IdProveedorPago","SIdentificadorExterno"),
  CONSTRAINT "devpware_clientes_pago_externo_check" CHECK (btrim("SIdentificadorExterno") <> ''),
  CONSTRAINT "devpware_clientes_pago_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_clientes_pago_proveedor_fkey" FOREIGN KEY ("IdProveedorPago") REFERENCES "devpware_proveedores_pago" ("IdProveedorPago") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "devpware_metodos_pago" (
  "IdMetodoPago" BIGSERIAL NOT NULL,
  "IdClientePago" BIGINT NOT NULL,
  "SIdentificadorExterno" VARCHAR(255) NOT NULL,
  "STipo" VARCHAR(80) NOT NULL,
  "SMarca" VARCHAR(80),
  "SUltimosCuatro" VARCHAR(4),
  "IMesExpiracion" INTEGER,
  "IAnoExpiracion" INTEGER,
  "SNombreTitular" VARCHAR(220),
  "BPredeterminado" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_metodos_pago_pkey" PRIMARY KEY ("IdMetodoPago"),
  CONSTRAINT "devpware_metodos_pago_cliente_externo_key" UNIQUE ("IdClientePago","SIdentificadorExterno"),
  CONSTRAINT "devpware_metodos_pago_externo_check" CHECK (btrim("SIdentificadorExterno") <> ''),
  CONSTRAINT "devpware_metodos_pago_tipo_check" CHECK (btrim("STipo") <> ''),
  CONSTRAINT "devpware_metodos_pago_ultimos_check" CHECK ("SUltimosCuatro" IS NULL OR "SUltimosCuatro" ~ '^[0-9]{4}$'),
  CONSTRAINT "devpware_metodos_pago_expiracion_check" CHECK (("IMesExpiracion" IS NULL AND "IAnoExpiracion" IS NULL) OR ("IMesExpiracion" BETWEEN 1 AND 12 AND "IAnoExpiracion" BETWEEN 2000 AND 9999)),
  CONSTRAINT "devpware_metodos_pago_cliente_fkey" FOREIGN KEY ("IdClientePago") REFERENCES "devpware_clientes_pago" ("IdClientePago") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_metodos_pago_predeterminado_key" ON "devpware_metodos_pago" ("IdClientePago") WHERE "BPredeterminado"=true AND "BActivo"=true AND "DFechaEliminacion" IS NULL;

CREATE TABLE "devpware_facturas" (
  "IdFactura" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdSuscripcion" BIGINT,
  "IdPeriodoSuscripcion" BIGINT,
  "IdProveedorPago" INTEGER,
  "SIdentificadorExterno" VARCHAR(255),
  "SNumeroFactura" VARCHAR(120) NOT NULL,
  "SEstado" VARCHAR(80) NOT NULL,
  "SMoneda" VARCHAR(3) NOT NULL,
  "NSubtotal" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NDescuento" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NImpuestos" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NTotal" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NSaldoPendiente" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "DFechaEmision" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaVencimiento" TIMESTAMPTZ(3),
  "DFechaPago" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "JDatosFiscalesSnapshot" JSONB,
  "JMetadatos" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_facturas_pkey" PRIMARY KEY ("IdFactura"),
  CONSTRAINT "devpware_facturas_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_facturas_numero_key" UNIQUE ("SNumeroFactura"),
  CONSTRAINT "devpware_facturas_numero_check" CHECK (btrim("SNumeroFactura") <> ''),
  CONSTRAINT "devpware_facturas_estado_check" CHECK ("SEstado" IN ('BORRADOR','ABIERTA','PAGADA','VENCIDA','ANULADA','INCOBRABLE')),
  CONSTRAINT "devpware_facturas_moneda_check" CHECK ("SMoneda" ~ '^[A-Z]{3}$'),
  CONSTRAINT "devpware_facturas_importes_check" CHECK ("NSubtotal">=0 AND "NDescuento">=0 AND "NImpuestos">=0 AND "NTotal">=0 AND "NSaldoPendiente">=0),
  CONSTRAINT "devpware_facturas_pago_check" CHECK (("SEstado" <> 'PAGADA') OR ("DFechaPago" IS NOT NULL AND "NSaldoPendiente"=0)),
  CONSTRAINT "devpware_facturas_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_facturas_suscripcion_fkey" FOREIGN KEY ("IdSuscripcion") REFERENCES "devpware_suscripciones" ("IdSuscripcion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_facturas_periodo_fkey" FOREIGN KEY ("IdPeriodoSuscripcion") REFERENCES "devpware_periodos_suscripciones" ("IdPeriodoSuscripcion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_facturas_proveedor_fkey" FOREIGN KEY ("IdProveedorPago") REFERENCES "devpware_proveedores_pago" ("IdProveedorPago") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_conceptos_facturas" (
  "IdConceptoFactura" BIGSERIAL NOT NULL,
  "IdFactura" BIGINT NOT NULL,
  "IdPlan" INTEGER,
  "IdFuncionalidad" INTEGER,
  "SDescripcion" VARCHAR(500) NOT NULL,
  "NCantidad" NUMERIC(18,4) NOT NULL DEFAULT 1,
  "NPrecioUnitario" NUMERIC(24,2) NOT NULL,
  "NDescuento" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NImpuestos" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "NTotal" NUMERIC(24,2) NOT NULL,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_conceptos_facturas_pkey" PRIMARY KEY ("IdConceptoFactura"),
  CONSTRAINT "devpware_conceptos_facturas_descripcion_check" CHECK (btrim("SDescripcion") <> ''),
  CONSTRAINT "devpware_conceptos_facturas_importes_check" CHECK ("NCantidad">0 AND "NPrecioUnitario">=0 AND "NDescuento">=0 AND "NImpuestos">=0 AND "NTotal">=0 AND "IOrden">=0),
  CONSTRAINT "devpware_conceptos_facturas_factura_fkey" FOREIGN KEY ("IdFactura") REFERENCES "devpware_facturas" ("IdFactura") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_conceptos_facturas_plan_fkey" FOREIGN KEY ("IdPlan") REFERENCES "devpware_planes" ("IdPlan") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_conceptos_facturas_func_fkey" FOREIGN KEY ("IdFuncionalidad") REFERENCES "devpware_funcionalidades" ("IdFuncionalidad") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_pagos" (
  "IdPago" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdFactura" BIGINT,
  "IdSuscripcion" BIGINT,
  "IdProveedorPago" INTEGER NOT NULL,
  "IdMetodoPago" BIGINT,
  "SIdentificadorExterno" VARCHAR(255) NOT NULL,
  "SEstado" VARCHAR(80) NOT NULL,
  "SMoneda" VARCHAR(3) NOT NULL,
  "NImporte" NUMERIC(24,2) NOT NULL,
  "NImporteReembolsado" NUMERIC(24,2) NOT NULL DEFAULT 0,
  "SCodigoRespuesta" VARCHAR(180),
  "SMensajeRespuesta" VARCHAR(1000),
  "DFechaPago" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_pagos_pkey" PRIMARY KEY ("IdPago"),
  CONSTRAINT "devpware_pagos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_pagos_proveedor_externo_key" UNIQUE ("IdProveedorPago","SIdentificadorExterno"),
  CONSTRAINT "devpware_pagos_externo_check" CHECK (btrim("SIdentificadorExterno") <> ''),
  CONSTRAINT "devpware_pagos_estado_check" CHECK ("SEstado" IN ('PENDIENTE','REQUIERE_ACCION','PROCESANDO','PAGADO','FALLIDO','CANCELADO','REEMBOLSADO','PARCIALMENTE_REEMBOLSADO')),
  CONSTRAINT "devpware_pagos_moneda_check" CHECK ("SMoneda" ~ '^[A-Z]{3}$'),
  CONSTRAINT "devpware_pagos_importes_check" CHECK ("NImporte">=0 AND "NImporteReembolsado">=0 AND "NImporteReembolsado"<="NImporte"),
  CONSTRAINT "devpware_pagos_pagado_check" CHECK (("SEstado" <> 'PAGADO') OR "DFechaPago" IS NOT NULL),
  CONSTRAINT "devpware_pagos_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_pagos_factura_fkey" FOREIGN KEY ("IdFactura") REFERENCES "devpware_facturas" ("IdFactura") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_pagos_suscripcion_fkey" FOREIGN KEY ("IdSuscripcion") REFERENCES "devpware_suscripciones" ("IdSuscripcion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_pagos_proveedor_fkey" FOREIGN KEY ("IdProveedorPago") REFERENCES "devpware_proveedores_pago" ("IdProveedorPago") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_pagos_metodo_fkey" FOREIGN KEY ("IdMetodoPago") REFERENCES "devpware_metodos_pago" ("IdMetodoPago") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "devpware_intentos_pagos" (
  "IdIntentoPago" BIGSERIAL NOT NULL,
  "IdPago" BIGINT NOT NULL,
  "INumeroIntento" INTEGER NOT NULL,
  "SClaveIdempotencia" VARCHAR(255) NOT NULL,
  "SEstado" VARCHAR(80) NOT NULL,
  "SCodigoRespuesta" VARCHAR(180),
  "SMensajeRespuesta" VARCHAR(1000),
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_intentos_pagos_pkey" PRIMARY KEY ("IdIntentoPago"),
  CONSTRAINT "devpware_intentos_pagos_pago_numero_key" UNIQUE ("IdPago","INumeroIntento"),
  CONSTRAINT "devpware_intentos_pagos_idempotencia_key" UNIQUE ("SClaveIdempotencia"),
  CONSTRAINT "devpware_intentos_pagos_numero_check" CHECK ("INumeroIntento">=1),
  CONSTRAINT "devpware_intentos_pagos_idempotencia_check" CHECK (btrim("SClaveIdempotencia")<>''),
  CONSTRAINT "devpware_intentos_pagos_estado_check" CHECK ("SEstado" IN ('INICIADO','REQUIERE_ACCION','EXITOSO','FALLIDO','CANCELADO')),
  CONSTRAINT "devpware_intentos_pagos_final_check" CHECK (("SEstado" IN ('INICIADO','REQUIERE_ACCION')) OR "DFechaFinalizacion" IS NOT NULL),
  CONSTRAINT "devpware_intentos_pagos_pago_fkey" FOREIGN KEY ("IdPago") REFERENCES "devpware_pagos" ("IdPago") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_eventos_webhooks_pagos" (
  "IdEventoWebhookPago" BIGSERIAL NOT NULL,
  "IdProveedorPago" INTEGER NOT NULL,
  "SIdentificadorEvento" VARCHAR(255) NOT NULL,
  "STipoEvento" VARCHAR(180) NOT NULL,
  "SHashPayload" VARCHAR(128) NOT NULL,
  "JPayloadSanitizado" JSONB,
  "BVerificado" BOOLEAN NOT NULL DEFAULT false,
  "BProcesado" BOOLEAN NOT NULL DEFAULT false,
  "IIntentosProcesamiento" INTEGER NOT NULL DEFAULT 0,
  "SMensajeError" TEXT,
  "DFechaRecepcion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaProcesamiento" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_eventos_webhooks_pagos_pkey" PRIMARY KEY ("IdEventoWebhookPago"),
  CONSTRAINT "devpware_eventos_webhooks_pagos_evento_key" UNIQUE ("IdProveedorPago","SIdentificadorEvento"),
  CONSTRAINT "devpware_eventos_webhooks_pagos_identificador_check" CHECK (btrim("SIdentificadorEvento")<>''),
  CONSTRAINT "devpware_eventos_webhooks_pagos_tipo_check" CHECK (btrim("STipoEvento")<>''),
  CONSTRAINT "devpware_eventos_webhooks_pagos_hash_check" CHECK (btrim("SHashPayload")<>''),
  CONSTRAINT "devpware_eventos_webhooks_pagos_intentos_check" CHECK ("IIntentosProcesamiento">=0),
  CONSTRAINT "devpware_eventos_webhooks_pagos_procesado_check" CHECK (("BProcesado"=false) OR "DFechaProcesamiento" IS NOT NULL),
  CONSTRAINT "devpware_eventos_webhooks_pagos_proveedor_fkey" FOREIGN KEY ("IdProveedorPago") REFERENCES "devpware_proveedores_pago" ("IdProveedorPago") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "devpware_proveedores_pago" ("SClave","SNombre","SSitioWeb","BActivo","IOrden","DFechaCreacion","DFechaModificacion") VALUES
 ('STRIPE','Stripe','https://stripe.com',true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('MERCADO_PAGO','Mercado Pago','https://www.mercadopago.com.mx',true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('OPENPAY','Openpay','https://www.openpay.mx',true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SSitioWeb"=EXCLUDED."SSitioWeb","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

COMMIT;

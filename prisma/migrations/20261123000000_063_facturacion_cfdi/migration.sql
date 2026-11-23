-- Facturación electrónica (CFDI 4.0) de las compras de paquetes con Facturapi
-- (docs/COBRO.md, sección «Facturación CFDI»).
--
-- 1. Datos fiscales de la organización. La razón social y el RFC ya existen
--    ("SRazonSocial", "SRFC"); se agregan solo el régimen fiscal, el código
--    postal del domicilio fiscal, el uso del CFDI y el correo que recibe las
--    facturas. Son columnas nuevas y opcionales: ninguna organización cambia.
--
-- 2. "devpware_cfdis_pagos": un CFDI por pago de Stripe a lo más. Cada compra
--    acreditada (fila COMPRA de "devpware_movimientos_creditos") tiene como
--    máximo una fila aquí, protegida por índices únicos, así que los
--    reintentos del webhook y la página de éxito nunca facturan dos veces.
--    Una factura global (público en general) ampara varios pagos: cada uno
--    conserva su fila, todas con el mismo id de Facturapi y el mismo UUID.
--
-- No se reutiliza "devpware_facturas" (migración 026): sus estados y reglas
-- son los de un recibo de Stripe (BORRADOR, ABIERTA, PAGADA...) y no se
-- alteran restricciones existentes.
--
-- Solo ADD COLUMN y CREATE TABLE / INDEX IF NOT EXISTS. Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SRegimenFiscal" VARCHAR(3);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SCodigoPostalFiscal" VARCHAR(5);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SUsoCfdi" VARCHAR(4);
ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "SCorreoFacturacion" VARCHAR(180);

CREATE TABLE IF NOT EXISTS "devpware_cfdis_pagos" (
  "IdCfdiPago" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdMovimientoCreditos" BIGINT NOT NULL,
  "SProveedorPago" VARCHAR(80) NOT NULL,
  "SReferenciaPago" VARCHAR(255) NOT NULL,
  "STipo" VARCHAR(20) NOT NULL,
  "SEstado" VARCHAR(20) NOT NULL,
  "SPeriodoGlobal" VARCHAR(7),
  "SIdentificadorExterno" VARCHAR(255),
  "SUuid" VARCHAR(40),
  "SSerie" VARCHAR(25),
  "IFolio" INTEGER,
  "SMoneda" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  "NSubtotal" DECIMAL(24,2) NOT NULL,
  "NImpuestos" DECIMAL(24,2) NOT NULL,
  "NTotal" DECIMAL(24,2) NOT NULL,
  "JDatosReceptor" JSONB,
  "SMensajeError" VARCHAR(2000),
  "IIntentos" INTEGER NOT NULL DEFAULT 0,
  "DFechaPago" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEmision" TIMESTAMPTZ(3),
  "DFechaCorreo" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_cfdis_pagos_pkey" PRIMARY KEY ("IdCfdiPago"),
  CONSTRAINT "devpware_cfdis_pagos_publico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_cfdis_pagos_tipo_check" CHECK ("STipo" IN ('INDIVIDUAL', 'GLOBAL')),
  CONSTRAINT "devpware_cfdis_pagos_estado_check" CHECK ("SEstado" IN ('PENDIENTE', 'EMITIDA', 'FALLIDA')),
  CONSTRAINT "devpware_cfdis_pagos_periodo_check" CHECK ("STipo" <> 'GLOBAL' OR "SPeriodoGlobal" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "devpware_cfdis_pagos_importes_check" CHECK ("NSubtotal" >= 0 AND "NImpuestos" >= 0 AND "NTotal" >= 0),
  CONSTRAINT "devpware_cfdis_pagos_intentos_check" CHECK ("IIntentos" >= 0),
  CONSTRAINT "devpware_cfdis_pagos_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_cfdis_pagos_movimiento_fkey" FOREIGN KEY ("IdMovimientoCreditos") REFERENCES "devpware_movimientos_creditos" ("IdMovimientoCreditos") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Un CFDI por pago: la compra (y su referencia de Stripe) se factura una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_cfdis_pagos_movimiento_key" ON "devpware_cfdis_pagos" ("IdMovimientoCreditos");
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_cfdis_pagos_referencia_key" ON "devpware_cfdis_pagos" ("SProveedorPago", "SReferenciaPago");
CREATE INDEX IF NOT EXISTS "devpware_cfdis_pagos_org_fecha_idx" ON "devpware_cfdis_pagos" ("IdOrganizacion", "DFechaPago" DESC);
CREATE INDEX IF NOT EXISTS "devpware_cfdis_pagos_periodo_idx" ON "devpware_cfdis_pagos" ("SPeriodoGlobal") WHERE "SPeriodoGlobal" IS NOT NULL;

-- Cobro por avaluo con paquetes de creditos prepagados.
--
-- Cada organizacion compra paquetes de creditos (1 credito = 1 avaluo
-- concluido) y los consume al concluir un avaluo por primera vez. El saldo es
-- la suma de los movimientos de su libro de creditos: compras (positivas),
-- consumos (negativos) y ajustes manuales (de cualquier signo).
--
-- "BCobroPorAvaluo" en la organizacion decide si concluir sin saldo se
-- bloquea (true) o solo se registra el consumo y el saldo queda negativo
-- (false, el valor inicial para todas las organizaciones).
--
-- No inserta paquetes ni precios: los reales los decide el cliente. Para
-- probar en local existe `pnpm billing:example-packages`.
--
-- Es idempotente.

ALTER TABLE "devpware_organizaciones" ADD COLUMN IF NOT EXISTS "BCobroPorAvaluo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "devpware_paquetes_creditos" (
  "IdPaqueteCreditos" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "ICreditos" INTEGER NOT NULL,
  "SMoneda" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  "NImporte" DECIMAL(24,2) NOT NULL,
  "NImpuestoPorcentaje" DECIMAL(8,4) NOT NULL DEFAULT 16,
  "SIdentificadorExterno" VARCHAR(255),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "BEsPublico" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_paquetes_creditos_pkey" PRIMARY KEY ("IdPaqueteCreditos"),
  CONSTRAINT "devpware_paquetes_creditos_publico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_paquetes_creditos_clave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_paquetes_creditos_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_paquetes_creditos_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_paquetes_creditos_creditos_check" CHECK ("ICreditos" > 0),
  CONSTRAINT "devpware_paquetes_creditos_importe_check" CHECK ("NImporte" >= 0),
  CONSTRAINT "devpware_paquetes_creditos_impuesto_check" CHECK ("NImpuestoPorcentaje" >= 0),
  CONSTRAINT "devpware_paquetes_creditos_orden_check" CHECK ("IOrden" >= 0)
);

CREATE INDEX IF NOT EXISTS "devpware_paquetes_creditos_activo_idx" ON "devpware_paquetes_creditos" ("BActivo", "BEsPublico");

CREATE TABLE IF NOT EXISTS "devpware_movimientos_creditos" (
  "IdMovimientoCreditos" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "STipo" VARCHAR(40) NOT NULL,
  "ICreditos" INTEGER NOT NULL,
  "IdPaqueteCreditos" INTEGER,
  "IdAvaluo" INTEGER,
  "IdUsuario" INTEGER,
  "SProveedorPago" VARCHAR(80),
  "SReferenciaExterna" VARCHAR(255),
  "SDescripcion" VARCHAR(500),
  "JMetadatos" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_movimientos_creditos_pkey" PRIMARY KEY ("IdMovimientoCreditos"),
  CONSTRAINT "devpware_movimientos_creditos_publico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_movimientos_creditos_tipo_check" CHECK ("STipo" IN ('COMPRA', 'CONSUMO', 'AJUSTE')),
  CONSTRAINT "devpware_movimientos_creditos_signo_check" CHECK (
    ("STipo" = 'COMPRA' AND "ICreditos" > 0) OR
    ("STipo" = 'CONSUMO' AND "ICreditos" < 0) OR
    ("STipo" = 'AJUSTE' AND "ICreditos" <> 0)
  ),
  CONSTRAINT "devpware_movimientos_creditos_consumo_avaluo_check" CHECK ("STipo" <> 'CONSUMO' OR "IdAvaluo" IS NOT NULL),
  CONSTRAINT "devpware_movimientos_creditos_referencia_check" CHECK ("SReferenciaExterna" IS NULL OR btrim("SReferenciaExterna") <> ''),
  CONSTRAINT "devpware_movimientos_creditos_org_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_creditos_paquete_fkey" FOREIGN KEY ("IdPaqueteCreditos") REFERENCES "devpware_paquetes_creditos" ("IdPaqueteCreditos") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_creditos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_movimientos_creditos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "devpware_movimientos_creditos_org_fecha_idx" ON "devpware_movimientos_creditos" ("IdOrganizacion", "DFechaCreacion" DESC);
CREATE INDEX IF NOT EXISTS "devpware_movimientos_creditos_avaluo_idx" ON "devpware_movimientos_creditos" ("IdAvaluo");

-- Una compra se abona una sola vez por pago (la pagina de exito y el webhook llegan los dos).
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_movimientos_creditos_referencia_key"
  ON "devpware_movimientos_creditos" ("SProveedorPago", "SReferenciaExterna")
  WHERE "SReferenciaExterna" IS NOT NULL;

-- Un avaluo consume un credito una sola vez, aunque se reabra y se vuelva a concluir.
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_movimientos_creditos_consumo_avaluo_key"
  ON "devpware_movimientos_creditos" ("IdAvaluo")
  WHERE "STipo" = 'CONSUMO';

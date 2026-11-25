-- Avisos de cambio de precio del Avalúo Disponible (Políticas comerciales,
-- sección 7.1; docs/COBRO.md, «Cambio de precio»).
--
-- El operador anuncia un precio futuro con al menos un mes de anticipación:
-- la plataforma muestra un aviso y se envía un correo antes de que rija. Al
-- llegar la fecha, la siguiente compra usa el precio nuevo; lo ya pagado no
-- cambia (los Avalúos Disponibles comprados se cuentan, no se revalúan).
--
-- Cada fila conserva el precio anterior y el nuevo (con IVA), la fecha del
-- anuncio, la de vigencia, cuándo salieron los correos y cuándo se aplicó o
-- se canceló. Cada correo enviado queda además en la auditoría con su
-- destinatario y fecha.
--
-- Solo CREATE TABLE / INDEX IF NOT EXISTS. Es idempotente; no toca ninguna
-- tabla existente.

CREATE TABLE IF NOT EXISTS "devpware_avisos_precios" (
  "IdAvisoPrecio" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "SClavePaquete" VARCHAR(120) NOT NULL,
  "NPrecioAnterior" DECIMAL(24,2) NOT NULL,
  "NPrecioNuevo" DECIMAL(24,2) NOT NULL,
  "NImpuestoPorcentaje" DECIMAL(8,4) NOT NULL DEFAULT 16,
  "DFechaAnuncio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaVigencia" TIMESTAMPTZ(3) NOT NULL,
  "DFechaCorreos" TIMESTAMPTZ(3),
  "ICorreosEnviados" INTEGER NOT NULL DEFAULT 0,
  "DFechaAplicacion" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_avisos_precios_pkey" PRIMARY KEY ("IdAvisoPrecio"),
  CONSTRAINT "devpware_avisos_precios_publico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_avisos_precios_precio_check" CHECK ("NPrecioNuevo" >= 0 AND "NPrecioAnterior" >= 0),
  CONSTRAINT "devpware_avisos_precios_vigencia_check" CHECK ("DFechaVigencia" > "DFechaAnuncio")
);

CREATE INDEX IF NOT EXISTS "devpware_avisos_precios_vigencia_idx" ON "devpware_avisos_precios" ("DFechaVigencia");

# Cobro (Stripe)

El cobro es **por avalúo**: cada organización compra paquetes de avalúos prepagados y cada avalúo descuenta uno al concluirse (decisión del cliente, 9 oct 2026). Además existe la venta de **suscripciones** mensuales, hoy sin uso, pensada para la base de datos de comparables más adelante. Todo el pago ocurre en páginas de Stripe (Checkout y portal de clientes): Valuaxis nunca ve ni guarda tarjetas.

El cobro es **opcional**. Sin `STRIPE_SECRET_KEY` la app funciona igual que antes y la página "Plan y facturación" avisa que los pagos no están habilitados.

## La cuenta de Stripe es compartida

La cuenta en vivo del cliente también la usa su tienda en línea (WooCommerce). Por eso la integración:

- **Etiqueta todo lo que crea** con `metadata.app = valuaxis`: productos, precios, clientes, sesiones de Checkout, suscripciones y la configuración del portal. Clientes, sesiones y suscripciones llevan además `organizacion = <uuid>`.
- **Ignora lo que no tiene esa etiqueta.** El webhook recibe también los eventos de la tienda: los contesta con 200 y no guarda nada de ellos ni consulta a Stripe.
- **Nunca lista la cuenta.** Solo lee objetos por id (los ids de producto y las `lookup_key` de precio se derivan de nuestros propios ids) y se niega a modificar un objeto sin la etiqueta.
- Una suscripción solo se aplica a una organización si la etiqueta, la organización y el cliente de Stripe guardado para esa organización coinciden.

## Cobro por avalúo (paquetes de créditos)

1. **Paquetes.** Se venden los paquetes de `devpware_paquetes_creditos` activos y públicos: nombre, número de avalúos (`ICreditos`), precio en MXN antes de IVA (`NImporte`) e IVA (`NImpuestoPorcentaje`). Ninguna migración inserta paquetes; los reales los captura el cliente (ver "Publicar o cambiar un paquete").
2. **Comprar.** Un administrador pulsa "Comprar" en `/organizacion/facturacion`. El servidor crea (o reutiliza) el cliente de Stripe de la organización y una sesión de Checkout en modo **pago único** (`POST /api/organizacion/facturacion/creditos/checkout`), con factura de Stripe para que el recibo aparezca en el portal, metadatos `app = valuaxis`, `organizacion` y `paquete`, y el sufijo `VALUAXIS` en el estado de cuenta (en pagos únicos Stripe sí acepta sufijo; se agrega al nombre de la cuenta).
3. **Abono, por dos caminos.** Al volver, la página consulta la sesión en Stripe y abona los créditos; el webhook (`checkout.session.completed`, `checkout.session.async_payment_succeeded`) hace lo mismo. El abono es **una sola vez por sesión de pago**: la fila de `devpware_movimientos_creditos` lleva la referencia de la sesión y un índice único la protege, así que el orden y las repeticiones no importan.
4. **Consumo.** Al **concluir un avalúo por primera vez** se registra un movimiento `CONSUMO` de −1 ligado al avalúo (índice único por avalúo: reabrir y volver a concluir no cuesta). El saldo es la suma de los movimientos (`COMPRA`, `CONSUMO`, `AJUSTE`).
5. **Bloqueo, apagado por omisión.** `devpware_organizaciones.BCobroPorAvaluo` decide qué pasa al concluir sin saldo: `false` (valor inicial de todas las organizaciones) registra el consumo y el saldo queda negativo, mostrado como pendiente de pago; `true` impide concluir con el mensaje "Tu organización no tiene avalúos disponibles…" y un enlace a comprar. Se enciende por organización con `pnpm billing:credits enforce <slug|uuid> on`.
6. **Ajustes manuales.** Hasta que existan reglas de créditos y referidos, `pnpm billing:credits adjust <slug|uuid> <créditos> "<motivo>"` abona o retira créditos; `pnpm billing:credits balance <slug|uuid>` muestra saldo y movimientos.

### Precio acordado: $170 MXN + IVA por avalúo

El cliente fijó el precio por avalúo en **$170.00 MXN antes de IVA (16%)**, $197.20 con IVA (28 oct 2026). Lo publica el paquete `AVALUO_1` ("1 avalúo", 1 crédito, activo y público), que crea o corrige un script idempotente; no toca Stripe ni los demás paquetes:

```bash
pnpm billing:set-unit-price            # simulación: muestra qué crearía o cambiaría
pnpm billing:set-unit-price --apply    # escribe
# dentro del contenedor de producción:
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts           # simulación
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts --apply
```

El precio de Stripe **no** lo crea este script: lo crea `pnpm stripe:sync` (o la primera compra, que sincroniza el paquete elegido) cuando existan las llaves; si el importe cambia después, la sincronización crea un precio nuevo y archiva el anterior. Lo que falta en producción está en [OPERACION.md](OPERACION.md), sección 8.

Para probar en local: `pnpm billing:example-packages` inserta los cuatro paquetes tentativos (1 × $150, 10 × $140, 30 × $125, 100 × $110, antes de IVA) marcados como de prueba; solo corre contra una base local.

### Publicar o cambiar un paquete

1. Insertar o editar la fila en `devpware_paquetes_creditos` (`SClave` única, `SNombre`, `ICreditos`, `NImporte` antes de IVA, `NImpuestoPorcentaje`, `BActivo`, `BEsPublico`, `IOrden`).
2. `pnpm stripe:sync` crea el producto y el precio en Stripe (etiquetados `app = valuaxis`) y guarda el id del precio en `SIdentificadorExterno`. Un precio de Stripe nunca se edita: si cambia el importe, se crea uno nuevo y el anterior se archiva. Antes de cada compra se sincroniza el paquete elegido.
3. Para retirar un paquete: `BEsPublico = false` o `BActivo = false`.

## Suscripciones (para la base de datos, más adelante)

1. **Planes.** Se venden los planes de la base (`devpware_planes`) activos, públicos y no gratuitos que tengan un precio (`devpware_precios_planes`) activo, recurrente, en MXN y vigente hoy. Nada está escrito en el código.
2. **Sincronización.** `pnpm stripe:sync` crea en Stripe un producto por plan y un precio por `PrecioPlan`, y guarda el id del precio en `SIdentificadorExterno`. Es idempotente. Un precio de Stripe nunca se edita: si cambia el importe, el impuesto o el periodo, se crea uno nuevo y el anterior se archiva (quien ya lo paga lo conserva). Antes de cada Checkout se sincroniza el plan elegido.
3. **Contratar.** Un administrador elige un plan en `/organizacion/facturacion`. El servidor crea (o reutiliza) el cliente de Stripe de la organización (`devpware_clientes_pago`) y una sesión de Checkout en modo suscripción, y redirige.
4. **Confirmación, por dos caminos.** Al volver, la página consulta la sesión y la suscripción en Stripe y escribe el resultado; el webhook hace lo mismo cuando llega. Los dos leen siempre el estado actual de Stripe (no el contenido del evento), así que el orden y las repeticiones no importan: terminan en la misma fila de `devpware_suscripciones`.
5. **Administrar pago.** Abre el portal de clientes de Stripe: tarjeta, facturas, cambio de plan y cancelación al final del periodo. Al regresar, la página vuelve a consultar a Stripe.
6. **Una suscripción por organización.** Con una suscripción viva, "Cambiar" lleva al portal en vez de crear otra. Al terminar una suscripción, la organización vuelve al plan gratuito `BORRADOR`.

### Estados

| Stripe | `devpware_estados_suscripciones` | Nota |
|---|---|---|
| `trialing` | `PRUEBA` | Guarda el fin de la prueba |
| `active` | `ACTIVA` | |
| `past_due` | `PAGO_PENDIENTE` | Gracia de 7 días desde el inicio del periodo no pagado (`BILLING_GRACE_DAYS`) |
| `incomplete` | `PAGO_PENDIENTE` | Sin gracia: el primer pago no se completó |
| `unpaid`, `paused` | `SUSPENDIDA` | |
| `canceled` | `CANCELADA` | Finaliza la fila y vuelve a `BORRADOR` |
| `incomplete_expired` | `VENCIDA` | Finaliza la fila y vuelve a `BORRADOR` |

### Qué se bloquea y qué no

**Hoy no se bloquea nada.** Ninguna organización pierde acceso por su plan, su estado o un pago vencido; los límites de `devpware_funcionalidades_planes` tampoco se aplican. La función `allowsPaidUse` (`src/features/billing/billing-rules.ts`) responde "¿esta suscripción permite uso de pago ahora?" (con gracia) y solo decide qué aviso muestra la página. Aplicar los bloqueos queda para después.

### Impuestos

`NImporte` es el precio antes de impuestos y `NImpuestoPorcentaje` el IVA. Stripe cobra **el total con IVA incluido** como un solo importe ($499.00 + 16% = $578.84); la página muestra el desglose. Stripe Tax queda apagado y no se crean tasas de impuesto en la cuenta compartida. El recibo de Stripe no desglosa el IVA: el CFDI se emite por fuera.

## Variables de entorno

| Variable | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Clave del servidor. En producción, una **clave restringida** (`rk_live_…`). Sin ella, pagos no habilitados |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del endpoint (`whsec_…`). Sin él, el webhook rechaza todo (503) |
| `STRIPE_PORTAL_CONFIGURATION` | Id de la configuración del portal propia de Valuaxis (`bpc_…`); la imprime `pnpm stripe:sync`. Sin ella se usa la configuración predeterminada de la cuenta |
| `STRIPE_PUBLISHABLE_KEY` | **No se usa**: Checkout es por redirección, sin Stripe.js en el navegador |

`pnpm env:check` no falla si faltan. Nunca van con prefijo `NEXT_PUBLIC`.

## Clave restringida para producción

En Stripe → Desarrolladores → Claves de API → "Crear clave restringida". Todo en **Ninguno** excepto:

| Recurso | Permiso | Para |
|---|---|---|
| Productos (Products) | Escritura | Crear y actualizar el producto de cada plan |
| Precios (Prices) | Escritura | Crear precios y archivar los reemplazados |
| Clientes (Customers) | Escritura | Crear el cliente de cada organización |
| Sesiones de Checkout | Escritura | Crear la sesión (suscripción o pago único) y leerla al volver |
| Facturas (Invoices) | Escritura | Checkout crea una factura por cada compra de paquete (`invoice_creation`); si la clave restringida la rechaza, Stripe lo dice al crear la sesión |
| Suscripciones (Subscriptions) | Lectura | Conciliar el estado |
| Portal de clientes (Customer portal) | Escritura | Abrir el portal y mantener su configuración |

No necesita permisos de cargos, reembolsos, facturas, saldo, pagos a banco, eventos ni webhooks. Pruébala primero como clave restringida de pruebas (`rk_test_…`) haciendo un pago completo: si falta un permiso, el error de Stripe dice cuál.

## Webhook

- **URL:** `https://<dominio>/api/stripe/webhook` (un endpoint nuevo, aparte del de la tienda).
- **Eventos:** `checkout.session.completed` y `checkout.session.async_payment_succeeded` (compras de paquetes y altas de suscripción), `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`.
- Copia su secreto de firma a `STRIPE_WEBHOOK_SECRET`.

La ruta no pide sesión y es la única exenta de la verificación de origen del proxy (solo `POST` a esa ruta exacta). La autentica la firma sobre el cuerpo crudo, con 5 minutos de tolerancia. Cada evento de Valuaxis se registra por id en `devpware_eventos_webhooks_pagos` y se procesa una sola vez; si falla responde 500 y Stripe lo reintenta. Los tipos desconocidos y los objetos sin etiqueta responden 200.

El código fija la versión de API `2026-09-30.endive` para sus consultas; del evento solo lee ids y etiquetas, así que el endpoint puede quedar en la versión predeterminada de la cuenta.

## Configuración única en el panel de Stripe

- **Portal de clientes.** `pnpm stripe:sync` crea una configuración propia (tarjeta, facturas, datos de facturación, cambio entre los precios publicados, cancelación al final del periodo) y no toca la predeterminada. Solo hay que activar el portal una vez (Configuración → Facturación → Portal de clientes → guardar) si Stripe lo pide, y poner el id impreso en `STRIPE_PORTAL_CONFIGURATION`.
- **Descripción en el estado de cuenta.** Cada producto de Valuaxis lleva `statement_descriptor = VALUAXIS`. En suscripciones Stripe no acepta un sufijo: usa esa descripción **completa** en lugar de la de la cuenta (verificado: el cargo sale como `VALUAXIS`, no como el nombre de la tienda). No hay nada que configurar; solo revisar que la descripción de la cuenta siga siendo la de la tienda.
- **Marca.** Checkout y el portal muestran el nombre, logotipo y colores de la cuenta (Configuración → Marca), que son los de la tienda. Es de toda la cuenta; decidir con el cliente si se deja un nombre neutro.
- **Zona horaria** de la cuenta en `America/Mexico_City`, para que las fechas del portal coincidan con las de la app.
- **Reintentos de cobro** (Facturación → Recuperación de ingresos): que los reintentos duren al menos los 7 días de gracia y que al agotarse la suscripción se cancele o quede como no pagada.
- **Correos al cliente** (recibos, pago fallido, tarjeta por vencer): se activan en Configuración → Correos; son de toda la cuenta.

## Publicar o cambiar un plan

1. Insertar o editar el plan y su precio en la base (`BActivo`, `BEsPublico`, `BEsGratuito = false`; precio en `MXN`, `SIntervaloCobro` `MES` o `ANO`, vigente).
2. `pnpm stripe:sync`.
3. Para retirar un plan: `BEsPublico = false` o `BActivo = false`. Deja de ofrecerse; quien lo paga lo conserva.

Para probar en local hay dos planes de ejemplo: `pnpm billing:example-plans` (solo corre contra una base local; ninguna migración inserta planes ni precios).

## Lista para salir a producción

1. Definir los paquetes y precios reales e insertarlos en la base de producción (los planes de suscripción solo cuando exista la base de datos de comparables). El de un avalúo ya está definido: `scripts/billing-set-unit-price.ts --apply`.
2. Crear la clave restringida en vivo con los permisos de arriba → `STRIPE_SECRET_KEY`.
3. Crear el endpoint del webhook con sus eventos → `STRIPE_WEBHOOK_SECRET`.
4. `pnpm stripe:sync` en producción → copiar `STRIPE_PORTAL_CONFIGURATION` y reiniciar la app.
5. Revisar en el panel: portal activo, zona horaria, reintentos, correos y marca.
6. Con una tarjeta real, comprar el paquete más barato desde una organización de prueba: confirmar el abono en "Avalúos disponibles", el evento entregado (200) en el panel del webhook y `VALUAXIS` en el cargo; concluir un avalúo y ver el consumo. Reembolsar el cargo en el panel (el reembolso no retira créditos: usar `pnpm billing:credits adjust`).
7. Encender el cobro organización por organización con `pnpm billing:credits enforce <slug> on` cuando el cliente lo decida; hasta entonces nadie queda bloqueado.
8. Confirmar que una compra de la tienda sigue llegando a su propio webhook y que el de Valuaxis la contesta con 200 sin registrarla.

## Código

| Qué | Dónde |
|---|---|
| Reglas puras (estados, gracia, etiquetas, importes) | `src/features/billing/billing-rules.ts` |
| Interfaz del proveedor y su implementación (único lugar que importa el SDK) | `src/features/billing/billing-gateway.ts`, `src/infrastructure/payments/stripe-gateway.ts` |
| Catálogo y sincronización | `src/features/billing/billing-catalog.service.ts`, `scripts/stripe-sync.ts` |
| Checkout, portal y resumen | `src/features/billing/billing.service.ts` |
| Reglas puras de créditos (signos, consumo, bloqueo) | `src/features/billing/credit-rules.ts` |
| Libro de créditos (saldo, movimientos, consumo al concluir, ajustes, bandera) | `src/features/billing/credits.service.ts`, `scripts/billing-credits.ts` |
| Paquetes: sincronización, compra y abono | `src/features/billing/credit-packages.service.ts`, `scripts/billing-example-packages.ts` |
| Consumo al concluir | `src/features/valuations/services/valuation-workflow/lifecycle.ts` |
| Conciliación | `src/features/billing/subscription-sync.service.ts` |
| Webhook | `src/features/billing/billing-webhook.service.ts`, `src/app/api/stripe/webhook/route.ts` |
| Pruebas | `tests/billing-*.test.ts`, `tests/integration/billing.integration.ts`, `tests/integration/billing-credits.integration.ts`, `tests/support/fake-billing-gateway.ts` |

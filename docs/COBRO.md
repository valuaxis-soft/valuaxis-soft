# Cobro (Stripe)

El cobro es **por avalúo**: cada organización compra «Avalúos Disponibles» por unidad y cada avalúo descuenta uno **al crearse** (Políticas comerciales del abogado, 15 nov 2026; decisión del cliente del 23 nov 2026, que reemplaza el «descuento al concluir» del 9 oct). Las cuentas nuevas reciben tres de prueba por un mes. Existe además la venta de **suscripciones**, apagada mientras las Políticas no las permitan (sección 7.2). Todo el pago con tarjeta ocurre en páginas de Stripe (Checkout y portal de clientes): Valuaxis nunca ve ni guarda tarjetas.

El cobro es **opcional**. Sin `STRIPE_SECRET_KEY` la app funciona igual que antes y la página "Plan y facturación" avisa que los pagos no están habilitados.

## La cuenta de Stripe es compartida

La cuenta en vivo del cliente también la usa su tienda en línea (WooCommerce). Por eso la integración:

- **Etiqueta todo lo que crea** con `metadata.app = valuaxis`: productos, precios, clientes, sesiones de Checkout, suscripciones y la configuración del portal. Clientes, sesiones y suscripciones llevan además `organizacion = <uuid>`.
- **Ignora lo que no tiene esa etiqueta.** El webhook recibe también los eventos de la tienda: los contesta con 200 y no guarda nada de ellos ni consulta a Stripe.
- **Nunca lista la cuenta.** Solo lee objetos por id (los ids de producto y las `lookup_key` de precio se derivan de nuestros propios ids) y se niega a modificar un objeto sin la etiqueta.
- Una suscripción solo se aplica a una organización si la etiqueta, la organización y el cliente de Stripe guardado para esa organización coinciden.

## Cobro por avalúo (Políticas comerciales)

Las reglas salen de las **Políticas comerciales** del abogado (15 nov 2026) y de la decisión del cliente del 23 nov 2026 («cobro al crear»). Cada «Avalúo Disponible» permite elaborar y concluir un avalúo; se compran por unidad, sin paquetes, membresía ni suscripción.

1. **Consumo al crear.** Un avalúo disponible se descuenta cuando se oprime «Crear avalúo» (`POST /api/avaluos`) o «Duplicar» (`POST /api/avaluos/[id]/duplicar`): un movimiento `CONSUMO` de −1 ligado al avalúo, escrito en la misma transacción que lo crea (`consumeCreditOnCreation`). Concluir, cancelar (archivar o mandar a la papelera) o reabrir no descuentan otro. El índice único por avalúo (migración 040) impide un segundo consumo pase lo que pase.
2. **Prueba gratuita.** Una cuenta nueva (registro con correo o con Google) recibe **3 avalúos disponibles de prueba**, que vencen **al mes** del registro (el mismo día del mes siguiente; si ese mes no tiene el día, el último). Es un `AJUSTE` de +3 con `JMetadatos.kind = "TRIAL_GRANT"` y la fecha de vencimiento (`grantTrialCredits`). Los de prueba se usan **antes** que los pagados (cada consumo guarda `source: "TRIAL"` o `"PAID"`). Al vencer, los no usados dejan de contar de inmediato aunque el movimiento de baja todavía no esté escrito; la siguiente escritura del libro escribe un `AJUSTE` negativo con `kind = "TRIAL_EXPIRY"` (o `pnpm billing:policies-report --apply`). Los pagados **no vencen nunca**. Quien entra a un despacho por invitación no recibe otra prueba: la prueba es de la cuenta (la organización) que se registra.
3. **Bloqueo, apagado por omisión.** `devpware_organizaciones.BCobroPorAvaluo` decide qué pasa al crear sin saldo: `false` (valor inicial de todas las organizaciones, también las nuevas) registra el consumo y el saldo queda negativo, mostrado como pendiente de pago: **nada se bloquea**, como antes. `true` impide crear (y duplicar) con 409 `{ code: "NO_CREDITS", link: "/organizacion/facturacion" }` y el mensaje «Tu organización no tiene avalúos disponibles. Compra avalúos en Plan y facturación para crear uno nuevo.»; el formulario muestra el enlace «Comprar avalúos en «Plan y facturación»» y el menú «Duplicar» ofrece «Ir a Plan y facturación». No se crea nada. Se enciende por organización con `pnpm billing:credits enforce <slug|uuid> on`.
4. **Compra por unidad.** En «Plan y facturación» se elige cuántos avalúos (1 a 100) y, **antes del botón de pago**, se ven el precio por avalúo, el subtotal, el IVA incluido, «Comisiones y otros cargos: $0.00» y el **total a pagar** destacado (LFPC 7 Bis), junto con los términos y formas de pago (LFPC 76 Bis V): tarjeta en Stripe, pago único sin cobros recurrentes, abono al confirmar, vigencia (pagados sin vencimiento, prueba a un mes), revocación en 5 días hábiles de lo no usado y transferencia o depósito. «Pagar $X con tarjeta» crea una sesión de Checkout de pago único con `quantity` unidades del precio de Stripe del paquete por unidad (`AVALUO_1`) y etiquetas `creditos`, `cantidad` y `precio_unitario` (`POST /api/organizacion/facturacion/creditos/checkout` con `{ quantity }`). Los paquetes de varios avalúos ya no se ofrecen; siguen en la tabla por si existen compras viejas.
5. **Abono y confirmación.** Al volver, la página consulta la sesión y abona; el webhook hace lo mismo; el abono es **una sola vez por pago** (índice único por proveedor y referencia). Quien abona envía el **correo de confirmación** con el saldo resultante (al correo de la organización o, sin él, al de su propietario) y lo deja en la auditoría (`BILLING_PURCHASE_CONFIRMATION_SENT`, destinatario y fecha). La pantalla dice «Compra confirmada» con el saldo.
6. **Transferencia o depósito.** Los datos (banco, CLABE, titular, plazo de abono y correo para el comprobante) viven en `src/features/billing/payment-instructions.ts`; mientras el cliente no los dé, la página dice «Por definir» en cada uno. Un pago confirmado en el banco se abona con `pnpm billing:credits payment <org> <avalúos> transferencia|deposito "<referencia>"`: al precio vigente, una vez por referencia, con el mismo correo de confirmación. No se factura automáticamente (el CFDI se pide por correo, Políticas 5.2).
7. **Registro de cada movimiento (matriz 3.4).** Cada `COMPRA` guarda en `JMetadatos.purchase` el precio por avalúo mostrado, la cantidad, el monto pagado y la forma de pago (`TARJETA`, `TRANSFERENCIA`, `DEPOSITO`), y en `SProveedorPago`/`SReferenciaExterna` el proveedor y la referencia (sesión de Stripe o folio del banco), con su fecha. Cada `CONSUMO` está ligado a su avalúo y dice si fue al crear o al concluir y si usó prueba o pagado. «Movimientos» lo muestra («3 × $170.00 = $510.00 · Tarjeta (Stripe) · Ref. cs_…»). El libro es solo de inserción: nada se edita ni se borra; el vencimiento de la prueba y las correcciones son movimientos nuevos.
8. **Sin suscripciones.** `SUBSCRIPTIONS_OFFERED = false` (`billing-rules.ts`): la página no ofrece planes y `POST /api/organizacion/facturacion/checkout` responde 409. El código de suscripciones se conserva para cuando las Políticas cambien (sección 7.2).
9. **Ajustes manuales.** `pnpm billing:credits adjust <slug|uuid> <créditos> "<motivo>"` abona o retira créditos; `pnpm billing:credits balance <slug|uuid>` muestra saldo, prueba y movimientos.

### Transición: avalúos creados antes del cambio

El cambio no abona ni quita avalúos a nadie. Lo que decide si un avalúo se cobra al concluir es **si ya tiene su consumo**, no la fecha:

| Avalúo | Al crear | Al concluir | Al reabrir y volver a concluir |
|---|---|---|---|
| Creado después del cambio | Descuenta 1 | Nada | Nada |
| Creado antes, nunca concluido (sin consumo) | — | Descuenta 1, como antes (con bloqueo encendido y sin saldo no se concluye: «Este avalúo se creó antes del cobro al crear…») | Nada |
| Concluido antes, con su consumo | — | Nada | Nada |
| Concluido antes de que existiera el libro (migración 040, sin consumo) | — | — | Nada (`previouslyConcluded`: reabrir nunca cobra) |

Así no hay doble cobro (el índice único y la regla de arriba) ni pase gratis (lo creado antes y no concluido se cobra al concluirlo). Las organizaciones existentes **no reciben la prueba**: conservan su saldo tal cual; la prueba es solo para registros nuevos.

Antes de desplegar, y después para confirmar, `pnpm billing:policies-report` (simulación, no escribe) lista por organización el cobro activo o no, el saldo, la prueba, cuántos avalúos abiertos sin cobrar se cobrarán al concluirse y cuántos concluidos antes del libro ya no se cobrarán. Con `--apply` solo escribe los vencimientos de pruebas ya vencidas.

### Precio acordado: $170 MXN con IVA por avalúo

El precio por avalúo es **$170.00 MXN finales, IVA incluido** (Políticas comerciales 1.2; video 5.2 del 2 nov 2026). Se guarda como $146.55 antes de IVA (16 %), que con el redondeo a centavos da $170.00. Lo publica el paquete `AVALUO_1` ("1 avalúo", 1 crédito, activo y público), que crea o corrige un script idempotente; no toca Stripe ni los demás paquetes:

```bash
pnpm billing:set-unit-price            # simulación: muestra qué crearía o cambiaría
pnpm billing:set-unit-price --apply    # escribe
# dentro del contenedor de producción:
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts           # simulación
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts --apply
```

El precio de Stripe **no** lo crea este script: lo crea `pnpm stripe:sync` (o la primera compra, que sincroniza el paquete) cuando existan las llaves; si el importe cambia después, la sincronización crea un precio nuevo y archiva el anterior. La página vende el paquete `AVALUO_1` (o, si no está, el primer paquete público de 1 crédito). El estado en producción está en [OPERACION.md](OPERACION.md), sección 8.

Para probar en local: `pnpm billing:example-packages` inserta paquetes tentativos marcados como de prueba (el de 1 avalúo es el que vende la página); solo corre contra una base local.

### Cambio de precio (Políticas 7.1)

Un precio nuevo se **anuncia con al menos un mes de anticipación**, solo cuando el cliente lo pida, y no afecta lo ya pagado (el libro cuenta avalúos, no dinero):

```bash
pnpm billing:price-notice announce 190 2027-02-01            # simulación: el texto del aviso y a cuántos usuarios llegaría
pnpm billing:price-notice announce 190 2027-02-01 --apply    # registra (devpware_avisos_precios, migración 065) y envía los correos
pnpm billing:price-notice list
pnpm billing:price-notice send <id> --apply                  # reintenta los correos si no salieron
pnpm billing:price-notice cancel <id> --apply
```

- El precio va con IVA; la fecha es el inicio de ese día en la Ciudad de México y debe ser al menos un mes después de hoy. Solo puede haber un cambio pendiente.
- Desde el anuncio hasta la fecha, el tablero y «Plan y facturación» muestran «Aviso de cambio de precio» con el precio nuevo, el de hoy y la fecha; el correo («Aviso de cambio de precio de Valuaxis Soft») llega a cada usuario activo de una organización activa, una vez, y cada envío queda en la auditoría con su destinatario y fecha (`BILLING_PRICE_NOTICE_EMAILED`).
- Al llegar la fecha, la siguiente visita a «Plan y facturación» o la siguiente compra pone el precio nuevo en `AVALUO_1` (antes de IVA, para que con IVA dé exactamente el anunciado) y sella `DFechaAplicacion`; la sincronización con Stripe crea el precio nuevo y archiva el anterior. Una sesión de pago abierta antes de la fecha se cobra al precio que mostró.

### Publicar o cambiar un paquete

1. Insertar o editar la fila en `devpware_paquetes_creditos` (`SClave` única, `SNombre`, `ICreditos`, `NImporte` antes de IVA, `NImpuestoPorcentaje`, `BActivo`, `BEsPublico`, `IOrden`). La página solo vende el de 1 avalúo; un cambio de su precio va por «Cambio de precio».
2. `pnpm stripe:sync` crea el producto y el precio en Stripe (etiquetados `app = valuaxis`) y guarda el id del precio en `SIdentificadorExterno`. Un precio de Stripe nunca se edita: si cambia el importe, se crea uno nuevo y el anterior se archiva. Antes de cada compra se sincroniza el paquete.
3. Para retirar un paquete: `BEsPublico = false` o `BActivo = false`.

## Suscripciones (apagadas; para la base de datos, más adelante)

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

Las suscripciones no bloquean nada: ningún plan, estado ni pago vencido quita acceso, y los límites de `devpware_funcionalidades_planes` no se aplican. `allowsPaidUse` (`src/features/billing/billing-rules.ts`) solo decide qué aviso muestra la página. Lo único que bloquea es el cobro por avalúo con `BCobroPorAvaluo` encendido y sin saldo (arriba).

### Impuestos

`NImporte` es el precio antes de impuestos y `NImpuestoPorcentaje` el IVA. Stripe cobra **el total con IVA incluido** como un solo importe ($499.00 + 16% = $578.84); la página muestra el desglose. Stripe Tax queda apagado y no se crean tasas de impuesto en la cuenta compartida. El recibo de Stripe no desglosa el IVA ni es un CFDI: la factura la emite Facturapi (sección «Facturación CFDI»).

## Facturación CFDI (Facturapi)

Cada compra de un paquete se factura con un **CFDI 4.0 de ingreso** emitido por [Facturapi](https://docs.facturapi.io), con el CSD del cliente. Está **apagada mientras no exista `FACTURAPI_KEY`**: sin ella no se emite nada, el formulario de datos fiscales sigue guardando y la página dice «La facturación automática todavía no está habilitada». El cliente abre su cuenta de Facturapi y sube su CSD él mismo: Valuaxis nunca ve el CSD ni su contraseña, solo guarda la llave secreta en `production.env`.

### Datos fiscales

Un administrador (`FACTURACION_ADMINISTRAR`) los captura una vez en «Plan y facturación» → «Datos fiscales»: RFC, razón social, régimen fiscal (catálogo c_RegimenFiscal), código postal del domicilio fiscal (5 dígitos), uso del CFDI (G03, G01 o S01) y correo para facturas. Deben coincidir con la Constancia de Situación Fiscal; el SAT rechaza el timbrado si no. Se valida el formato del RFC (12 caracteres persona moral, 13 física, con fecha real), que el régimen corresponda al tipo de persona y que el uso lo permita el régimen.

La razón social y el RFC son las mismas columnas que «Datos del despacho» (`SRazonSocial`, `SRFC`); lo demás vive en columnas nuevas de la organización (migración 063). En la factura la razón social va en mayúsculas y **sin el régimen societario** («S.A. de C.V.», «S. de R.L. de C.V.», «S.C.»…), como pide el CFDI 4.0; el membrete del dictamen la sigue mostrando como está escrita.

### Cuándo se factura

1. Stripe confirma el pago (webhook `checkout.session.completed` o la página de éxito) y los créditos se abonan como siempre.
2. **Después de responder** (`after()`), si Facturapi está configurado y la organización tiene datos fiscales completos, se crea el CFDI y se envía por correo (PDF y XML adjuntos) al correo para facturas, con el servicio de correo de la app.
3. **Una factura por pago**: la tabla `devpware_cfdis_pagos` tiene un índice único por movimiento de compra y por referencia de Stripe. Antes de llamar a Facturapi se aparta la fila, así que el webhook, sus reintentos y la página de éxito nunca facturan dos veces. Además, la petición lleva `idempotency_key = valuaxis-<sesión de Checkout>` y `external_id = <sesión>`: si una respuesta se pierde, el siguiente intento encuentra la factura que ya existe en vez de crear otra.
4. Si Facturapi o el SAT la rechazan, la fila queda **FALLIDA** con el mensaje tal cual, visible en «Movimientos» junto con «Reintentar factura» (solo `FACTURACION_ADMINISTRAR`). El reintento usa los datos fiscales como estén en ese momento: se corrige el dato y se reintenta. Si la factura se emitió pero el correo falló, «Reintentar factura» solo reenvía el correo.
5. En «Movimientos» cada compra muestra su factura con enlaces a PDF y XML (se descargan de Facturapi en el momento; la app no guarda copia), «Emitiendo la factura…», el error, o «En la factura global de <mes>».

Se audita: `BILLING_FISCAL_DATA_UPDATED`, `BILLING_INVOICE_ISSUED`, `BILLING_INVOICE_FAILED`, `BILLING_INVOICE_RETRIED`, `BILLING_GLOBAL_INVOICE_ISSUED` y `BILLING_GLOBAL_INVOICE_FAILED`. En los registros y la auditoría el RFC aparece abreviado (`EKU…C9`); la llave nunca.

### Importes

Stripe cobra el total con IVA incluido. El CFDI lleva un concepto por compra (cantidad 1) con el **precio antes de IVA** y el IVA trasladado al 16 %, calculados para que subtotal + IVA redondeados a centavos den exactamente lo que cobró Stripe: el avalúo de $170.00 se factura como $146.55 + $23.45. El total sale del importe que Stripe registró en la compra (`amountTotal`), no del precio actual del paquete. Si algún día un total no tuviera un subtotal exacto en centavos, el concepto se manda con el IVA incluido y Facturapi lo desglosa.

### Claves del SAT (por confirmar con el contador del cliente)

| Campo | Valor | Por qué |
|---|---|---|
| Clave de producto o servicio | `81112106` «Proveedores de servicios de aplicación» (`INVOICE_PRODUCT_KEY`) | Lo que se vende es el uso del software en línea (créditos para emitir avalúos), no el avalúo mismo, que firma el perito |
| Clave de unidad | `E48` «Unidad de servicio» (`INVOICE_UNIT_KEY`) | La unidad habitual para servicios |
| Forma de pago | `31` «Intermediario pagos» | El comprador paga a través de Stripe, sea tarjeta de crédito o de débito; si el contador prefiere `04` (tarjeta de crédito) se cambia en `CFDI_DEFAULTS` |
| Método de pago | `PUE` | La compra está pagada por completo antes de facturar |
| Objeto de impuesto | `02` con IVA trasladado 16 % | |
| Uso del CFDI | El que elija la organización (G03 por lo general) | |

La serie y el folio los asigna Facturapi según la configuración de la organización emisora.

### Factura global (público en general)

Los pagos de organizaciones **sin datos fiscales**, y los que se hicieron mientras la facturación estaba apagada, no se facturan uno por uno: van en la **factura global mensual** a «PUBLICO EN GENERAL» (RFC `XAXX010101000`, régimen 616, uso S01, periodicidad mensual), con un concepto por pago (clave `01010101`, unidad `ACT`, «Venta», la sesión de Stripe como número de identificación):

```bash
pnpm invoices:global --month 2026-11            # simulación: lista los pagos y los importes
pnpm invoices:global --month 2026-11 --apply    # emite
# dentro del contenedor de producción:
docker exec -it valuos-app node --import tsx scripts/invoices-global.ts --month 2026-11 [--apply]
```

El mes se cuenta en hora de la Ciudad de México. Antes de emitir aparta las filas de esos pagos (ya no se pueden facturar uno por uno), y si Facturapi la rechaza quedan **FALLIDA**: volver a correr el comando reintenta los mismos pagos sin duplicar. Un pago que ya está en una global emitida no vuelve a entrar. Una factura individual que falló no entra en la global: el comando lo avisa para reintentarla desde la página. Las organizaciones ven en «Movimientos» que su pago está en la global del mes, sin enlaces de descarga (ese CFDI no es a su nombre).

### Cancelaciones

La app no cancela facturas. Si hace falta (un reembolso, un dato equivocado), se cancela en el panel de Facturapi con el motivo que indique el contador; la fila de la app conserva el registro original.

### Lo que no está probado contra el Facturapi real

Las pruebas corren contra un Facturapi falso local (`tests/support/fake-facturapi-server.ts`) que imita los endpoints documentados. Falta confirmar con la llave de pruebas del cliente: que acepte el cliente en línea con estos campos, el redondeo del IVA en su PDF y XML, el comportamiento con el timbrado diferido (respuesta 202), la factura global y los mensajes de error reales del SAT.

## Variables de entorno

| Variable | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Clave del servidor. En producción, una **clave restringida** (`rk_live_…`). Sin ella, pagos no habilitados |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del endpoint (`whsec_…`). Sin él, el webhook rechaza todo (503) |
| `STRIPE_PORTAL_CONFIGURATION` | Id de la configuración del portal propia de Valuaxis (`bpc_…`); la imprime `pnpm stripe:sync`. Sin ella se usa la configuración predeterminada de la cuenta |
| `STRIPE_PUBLISHABLE_KEY` | **No se usa**: Checkout es por redirección, sin Stripe.js en el navegador |

| `FACTURAPI_KEY` | Llave secreta de la organización emisora en Facturapi (`sk_test_…` o `sk_live_…`). Sin ella no se factura nada |
| `FACTURAPI_BASE_URL` | Solo pruebas y revisión en local (un Facturapi falso). En producción no se define |
| `INVOICE_PRODUCT_KEY`, `INVOICE_UNIT_KEY` | Claves del SAT del concepto; vacías usan `81112106` y `E48` |

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
6. Con una tarjeta real, comprar un avalúo desde una organización de prueba: confirmar el abono en "Avalúos disponibles", el correo de confirmación, el evento entregado (200) en el panel del webhook y `VALUAXIS` en el cargo; crear un avalúo y ver el consumo. Reembolsar el cargo en el panel (el reembolso no retira créditos: usar `pnpm billing:credits adjust`).
7. Encender el cobro organización por organización con `pnpm billing:credits enforce <slug> on` cuando el cliente lo decida; hasta entonces nadie queda bloqueado.
8. Confirmar que una compra de la tienda sigue llegando a su propio webhook y que el de Valuaxis la contesta con 200 sin registrarla.

## Código

| Qué | Dónde |
|---|---|
| Reglas puras (estados, gracia, etiquetas, importes) | `src/features/billing/billing-rules.ts` |
| Interfaz del proveedor y su implementación (único lugar que importa el SDK) | `src/features/billing/billing-gateway.ts`, `src/infrastructure/payments/stripe-gateway.ts` |
| Catálogo y sincronización | `src/features/billing/billing-catalog.service.ts`, `scripts/stripe-sync.ts` |
| Checkout, portal y resumen | `src/features/billing/billing.service.ts` |
| Reglas puras de créditos (signos, consumo al crear, prueba y vencimiento, transición, totales por unidad) | `src/features/billing/credit-rules.ts` |
| Libro de créditos (saldo con prueba, movimientos, consumo al crear y al concluir, prueba, ajustes, bandera) | `src/features/billing/credits.service.ts`, `scripts/billing-credits.ts` |
| Paquetes y compra por unidad: sincronización, Checkout, abono, confirmación por correo, transferencias | `src/features/billing/credit-packages.service.ts`, `scripts/billing-example-packages.ts` |
| Precio por unidad y cambio de precio (aviso, correos, aplicación) | `src/features/billing/unit-price.service.ts`, `scripts/billing-price-notice.ts`, `src/features/billing/components/price-change-alert.tsx` |
| Datos de transferencia o depósito | `src/features/billing/payment-instructions.ts` |
| Reporte de la transición por organización | `scripts/billing-policies-report.ts` |
| Consumo al crear y duplicar | `src/features/valuations/actions/save-valuation.action.ts`, `src/features/valuations/services/valuation-duplicate.service.ts` |
| Prueba al registrarse | `src/features/auth/services/registration.service.ts`, `src/features/auth/services/oauth-onboarding.service.ts` |
| Consumo al concluir (solo transición) | `src/features/valuations/services/valuation-workflow/lifecycle.ts` |
| Conciliación | `src/features/billing/subscription-sync.service.ts` |
| Webhook | `src/features/billing/billing-webhook.service.ts`, `src/app/api/stripe/webhook/route.ts` |
| Facturación CFDI: reglas puras (catálogos, RFC, importes, cuerpos para Facturapi) | `src/features/billing/invoice-rules.ts` |
| Facturación CFDI: datos fiscales, emisión, reintento, descarga y factura global | `src/features/billing/invoicing.service.ts`, `scripts/invoices-global.ts` |
| Interfaz del proveedor de CFDI y su implementación con `fetch` | `src/features/billing/invoicing-gateway.ts`, `src/infrastructure/invoicing/facturapi-gateway.ts` |
| Pruebas | `tests/billing-*.test.ts`, `tests/integration/billing.integration.ts`, `tests/integration/billing-credits.integration.ts`, `tests/integration/billing-policies.integration.ts`, `tests/integration/invoicing.integration.ts`, `tests/support/fake-billing-gateway.ts`, `tests/support/fake-facturapi-server.ts` |

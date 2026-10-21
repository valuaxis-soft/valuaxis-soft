# Rutas

## Páginas públicas

| Ruta | Uso |
|---|---|
| `/` | Landing pública; con sesión redirige a `/dashboard` |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | SEO y PWA (`src/app/robots.ts`, `sitemap.ts`, `manifest.ts`) |
| `/iniciar-sesion` | Inicio de sesión |
| `/login` | Redirige a `/iniciar-sesion` |
| `/registro` | Registro |
| `/verificar-correo` | Verificación de correo |
| `/recuperar-contrasena` | Solicitud de recuperación |
| `/restablecer-contrasena` | Nueva contraseña |
| `/oauth/resultado` | Errores de Google OAuth |

## Páginas privadas

| Ruta | Uso |
|---|---|
| `/dashboard` | Resumen y avalúos recientes |
| `/avaluos` | Lista paginada de avalúos de la organización (20 por página). Parámetros: `?q=` busca en folio, título y cliente; `?estado=` filtra por clave del catálogo de estados (`nuevo`, `en_edicion`, …); `?page=`. Requiere `AVALUO_VER`; "Nuevo avalúo" solo con `AVALUO_CREAR` |
| `/avaluos/<uuid>/dictamen` | Dictamen completo: todas las secciones habilitadas con las mismas páginas de la vista previa, en tamaño carta sin márgenes. Muestra lo guardado; el botón "Generar avalúo" del editor guarda antes de abrirlo. "Descargar PDF" lo genera en el servidor; "Imprimir" usa el navegador. Requiere `AVALUO_EXPORTAR` y registra un evento de exportación |
| `/avaluos/<uuid>/memoria-calculo` | Memoria de cálculo: anexo técnico, aparte del dictamen, con el encabezado del despacho, folio, fecha, versión del motor y fecha de generación. Imprime cada tabla con fórmulas (letras de columna y números de renglón; valores calculados en azul y capturados en negro, con su fórmula y la fórmula con los valores sustituidos), cada concepto calculado con fórmula y los pasos del motor de cada enfoque (cada mercado, costos, ingresos, maquinaria y conclusión) recalculados de lo guardado y comparados con lo que guardó el servidor. Muestra lo guardado: "Memoria de cálculo" del editor guarda antes de abrirla. Un avalúo concluido muestra su versión final. Requiere `AVALUO_EXPORTAR` y registra un evento de exportación |
| `/organizacion/equipo` | Nombre del equipo, invitaciones, miembros y roles. Requiere `USUARIO_ADMINISTRAR` (ver [AUTHORIZATION.md](AUTHORIZATION.md#equipos)) |
| `/organizacion/despacho` | Datos del despacho: logotipo, razón social, RFC, dirección, teléfono y correo del membrete; perito que firma, meses de vigencia y prefijo del folio de los avalúos nuevos. Requiere `USUARIO_ADMINISTRAR` |
| `/organizacion/plantillas` | Plantillas del despacho: nombre y descripción, secciones y bloques, si incluyen datos o imágenes, versión, cuándo y quién la creó y la actualizó. "Renombrar" (nombre y descripción; el nombre no se repite en el despacho sin importar mayúsculas ni acentos), "Eliminar" (baja lógica con confirmación; los avalúos creados con ella no cambian) y "Crear avalúo con esta plantilla" (abre `/workspace?action=new&plantilla=<uuid>`, solo con `AVALUO_CREAR`). Requiere `AVALUO_EDITAR`; sin él, redirige a `/dashboard` y no aparece en el menú |
| `/organizacion/facturacion` | Plan y facturación: avalúos disponibles (saldo de créditos), paquetes con "Comprar", movimientos, "Administrar pago" y, si los hay, planes de suscripción. Acciones con `SUSCRIPCION_ADMINISTRAR`; solo lectura con `FACTURACION_VER` (ver [COBRO.md](COBRO.md)) |
| `/organizacion/invitaciones/<token>` | Enlace del correo de invitación: muestra el equipo y el rol, y la acepta |
| `/workspace?action=new` | Crear avalúo. `&plantilla=<uuid>` llega con esa plantilla del despacho elegida en "Plantilla base" |
| `/workspace?id=<uuid>` | Editor del avalúo |
| `/workspace/preview-window?id=<uuid>` | Vista previa en segunda ventana |

## API en uso

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/auth/google` | Inicia Google OAuth |
| GET | `/api/auth/google/callback` | Completa Google OAuth |
| GET, PATCH | `/api/auth/organizations` | Lista y cambia la organización activa |
| GET, PATCH | `/api/organizacion/equipo` | Miembros, invitaciones pendientes y roles; `PATCH` pone el nombre y convierte el espacio personal en equipo |
| GET, PUT | `/api/organizacion/despacho` | Datos del despacho (`USUARIO_ADMINISTRAR`) |
| GET, PUT, DELETE | `/api/organizacion/despacho/factores` | Catálogo de factores del despacho: `GET` para quien ve avalúos, `PUT` guarda y `DELETE` vuelve al propuesto (`USUARIO_ADMINISTRAR`) |
| POST, DELETE | `/api/organizacion/despacho/logo` | Sube (`multipart`, campo `file`) o quita el logotipo |
| GET | `/api/organizacion/facturacion` | Saldo de créditos, movimientos, paquetes a la venta, plan actual y planes a la venta (`FACTURACION_VER`) |
| POST | `/api/organizacion/facturacion/creditos/checkout` | Inicia la compra de un paquete de avalúos (`{ packageId }`, pago único); devuelve la URL de Stripe (`SUSCRIPCION_ADMINISTRAR`) |
| POST | `/api/organizacion/facturacion/checkout` | Inicia el pago de un precio de suscripción (`{ priceId }`); devuelve la URL de Stripe. Con suscripción viva devuelve la del portal (`SUSCRIPCION_ADMINISTRAR`) |
| POST | `/api/organizacion/facturacion/portal` | Abre el portal de clientes de Stripe (`SUSCRIPCION_ADMINISTRAR`) |
| POST | `/api/stripe/webhook` | Webhook de Stripe: sin sesión, autenticado por firma; única ruta exenta de la verificación de origen |
| POST | `/api/organizacion/equipo/invitaciones` | Invita un correo con un rol y envía el enlace; devuelve el enlace |
| POST, DELETE | `/api/organizacion/equipo/invitaciones/[id]` | Reenvía (enlace nuevo) o cancela una invitación pendiente |
| PATCH, DELETE | `/api/organizacion/equipo/miembros/[id]` | Cambia el rol o da de baja a un miembro |
| GET, POST | `/api/organizacion/invitaciones` | Invitaciones pendientes para el correo del usuario; `POST` acepta por `token` o `id` y abre el equipo |
| GET, POST | `/api/avaluos` | Lista (máximo 200, los más recientes) y crea avalúos |
| GET, PUT, DELETE | `/api/avaluos/[id]` | Detalle, metadatos y borrado lógico |
| PUT | `/api/avaluos/[id]/full` | Guarda el avalúo completo |
| POST | `/api/avaluos/[id]/conclude` | Concluye (botón "Concluir" en el editor) |
| POST | `/api/avaluos/[id]/reopen` | Reabre con motivo y aceptación (botón "Reabrir" en el editor) |
| POST | `/api/avaluos/[id]/dictamen/pdf` | Genera el dictamen en PDF con Chromium, lo guarda como archivo del avalúo (`PDF_BORRADOR`, o `PDF_FINAL` si está concluido), registra la exportación y lo devuelve como descarga. `AVALUO_EXPORTAR`; 10 por usuario cada 10 minutos |
| POST | `/api/avaluos/[id]/memoria-calculo/pdf` | Genera la memoria de cálculo en PDF con Chromium (números de página al pie) y la devuelve como descarga; no se guarda, se rehace del avalúo cada vez. Registra la exportación (`memoria-calculo-pdf`). También para avalúos concluidos. `AVALUO_EXPORTAR`; 10 por usuario cada 10 minutos |
| POST | `/api/avaluos/[id]/dictamen/correo` | Genera el PDF y lo envía adjunto al cliente (`to` hasta 5 correos, `subject`, `message`), a nombre del despacho y con `Reply-To` al correo de Datos del despacho. Se registra como exportación `DICTAMEN_CORREO`. `AVALUO_EXPORTAR`; 20 por organización cada hora |
| GET | `/api/avaluos/[id]/export` | PDF simple generado con pdf-lib (sin membrete, tablas ni imágenes). El editor ya no lo usa: el dictamen se obtiene de `/avaluos/<uuid>/dictamen` |
| GET, POST | `/api/avaluos/[id]/caratula/imagen-principal` | Imagen principal |
| GET, POST, DELETE | `/api/avaluos/[id]/caratula/imagen-encabezado` | Imagen de encabezado |
| GET, POST, DELETE | `/api/avaluos/[id]/datos/imagenes` | Imágenes de Datos generales |
| GET, POST | `/api/avaluos/[id]/info-terreno/croquis` | Croquis; el editor todavía no la usa |
| GET, PUT | `/api/avaluos/[id]/mercado?tipo=` | Enfoque de mercado de un tipo de comparable (`TERRENO_VENTA`, `INMUEBLE_VENTA`, `INMUEBLE_RENTA`): parámetros y comparables. Cada cambio recalcula y devuelve el cálculo completo |
| POST | `/api/avaluos/[id]/mercado/comparables?tipo=` | Agrega un comparable con sus factores y contacto |
| POST | `/api/avaluos/[id]/mercado/comparables/importar?tipo=` | Lee un `.xlsx` o `.csv` (`multipart`, campo `file`) y devuelve la vista previa por renglón; con `&confirmar=1` guarda los válidos y devuelve el cálculo |
| GET | `/api/comparables/plantilla?tipo=` | Plantilla de Excel para importar comparables de ese tipo |
| PUT, DELETE | `/api/avaluos/[id]/mercado/comparables/[comparableId]?tipo=` | Edita o elimina un comparable; las referencias se renumeran |
| POST, DELETE | `/api/avaluos/[id]/mercado/comparables/[comparableId]/fotos?tipo=` | Sube (hasta 6) o quita (`&fotoId=`) fotografías del comparable |
| POST | `/api/avaluos/[id]/ia/anuncio` | "Pegar anuncio": recibe `{ text, url? }` (hasta 12,000 caracteres) y devuelve los datos que el anuncio trae escritos, cada uno con el fragmento de donde se leyó. No guarda nada. `AVALUO_EDITAR`; 409 en avalúo concluido; 503 sin `ANTHROPIC_API_KEY`. Ver [IA.md](IA.md) |
| POST | `/api/avaluos/[id]/ia/redaccion` | "Redactar borrador": recibe `{ field, context?, facts: [{ label, value }] }` y devuelve `{ text }`, un párrafo redactado solo con esos datos. No guarda nada. Mismos permisos y límites que la anterior; 422 si hay menos de 2 datos o el borrador no pasa la verificación |
| GET, PUT | `/api/avaluos/[id]/costos` | Enfoque de costos: terreno, construcciones, instalaciones especiales e indirectos, guardados completos |
| GET, PUT | `/api/avaluos/[id]/ingresos` | Enfoque de ingresos: superficie rentable, deducciones y tasa |
| GET, PUT | `/api/avaluos/[id]/maquinaria` | Maquinaria y equipo (MEH): captura de costos (bien, cotización, gastos, depreciación y aditamentos) y de mercado (ofertas). El `PUT` recibe `{ cost?, market? }` y guarda solo la parte enviada; recalcula ambos enfoques y la conclusión |
| GET, PUT | `/api/avaluos/[id]/conclusion` | Resumen de los tres enfoques, método de conclusión y justificación |
| POST | `/api/uploads` | Subida genérica de imágenes |
| GET, POST | `/api/plantillas` | Plantillas del despacho: `GET` las lista; `POST` guarda como plantilla el documento guardado de un avalúo del despacho (`{ name, description?, valuationId, includeData, includeImages, replace? }`, todos `false` si no se envían; 201). Con un nombre que ya existe (sin importar mayúsculas ni acentos): 409, o con `replace: true` una versión nueva de esa plantilla con su mismo nombre (200; la descripción cambia solo si se envía). Los avalúos nuevos e "Importar bloque" usan la última versión. 404 si el avalúo es de otro despacho. `AVALUO_EDITAR` |
| GET, PATCH, DELETE | `/api/plantillas/[id]` | Una plantilla con su documento (para "Importar bloque"), cambio de nombre y descripción (`{ name, description? }`; `null` o vacía la quita; 409 si el nombre ya es de otra) y baja lógica (los avalúos creados con ella no cambian). La de otro despacho no se encuentra (404). `AVALUO_EDITAR` |

Las dos rutas de IA comparten límites: 20 solicitudes por usuario cada 10 minutos y 200 por organización al día (429 con `Retry-After`).

Las rutas de cálculo leen la versión que muestra el editor y rechazan cambios (409) en avalúos concluidos. Los cambios se encadenan en el servidor: el mercado de terrenos recalcula costos, el de rentas recalcula ingresos, y cada enfoque recalcula la conclusión. Ver [MOTOR-CALCULO.md](MOTOR-CALCULO.md).

El cierre de sesión es una server action (`logoutAction`), no una ruta de API.

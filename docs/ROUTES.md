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
| `/organizacion/equipo` | Nombre del equipo, invitaciones, miembros y roles. Requiere `USUARIO_ADMINISTRAR` (ver [AUTHORIZATION.md](AUTHORIZATION.md#equipos)) |
| `/organizacion/despacho` | Datos del despacho: logotipo, razón social, RFC, dirección, teléfono y correo del membrete; perito que firma, meses de vigencia y prefijo del folio de los avalúos nuevos. Requiere `USUARIO_ADMINISTRAR` |
| `/organizacion/facturacion` | Plan y facturación: plan actual, próximo cobro, planes disponibles, "Contratar" y "Administrar pago". Acciones con `SUSCRIPCION_ADMINISTRAR`; solo lectura con `FACTURACION_VER` (ver [COBRO.md](COBRO.md)) |
| `/organizacion/invitaciones/<token>` | Enlace del correo de invitación: muestra el equipo y el rol, y la acepta |
| `/workspace?action=new` | Crear avalúo |
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
| GET | `/api/organizacion/facturacion` | Plan actual y planes a la venta (`FACTURACION_VER`) |
| POST | `/api/organizacion/facturacion/checkout` | Inicia el pago de un precio (`{ priceId }`); devuelve la URL de Stripe. Con suscripción viva devuelve la del portal (`SUSCRIPCION_ADMINISTRAR`) |
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
| GET, PUT | `/api/avaluos/[id]/conclusion` | Resumen de los tres enfoques, método de conclusión y justificación |
| POST | `/api/uploads` | Subida genérica de imágenes |

Las dos rutas de IA comparten límites: 20 solicitudes por usuario cada 10 minutos y 200 por organización al día (429 con `Retry-After`).

Las rutas de cálculo leen la versión que muestra el editor y rechazan cambios (409) en avalúos concluidos. Los cambios se encadenan en el servidor: el mercado de terrenos recalcula costos, el de rentas recalcula ingresos, y cada enfoque recalcula la conclusión. Ver [MOTOR-CALCULO.md](MOTOR-CALCULO.md).

El cierre de sesión es una server action (`logoutAction`), no una ruta de API.

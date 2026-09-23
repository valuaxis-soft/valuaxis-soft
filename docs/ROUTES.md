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
| `/workspace?action=new` | Crear avalúo |
| `/workspace?id=<uuid>` | Editor del avalúo |
| `/workspace/preview-window?id=<uuid>` | Vista previa en segunda ventana |

## API en uso

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/auth/google` | Inicia Google OAuth |
| GET | `/api/auth/google/callback` | Completa Google OAuth |
| GET, PATCH | `/api/auth/organizations` | Lista y cambia la organización activa |
| GET, POST | `/api/avaluos` | Lista (máximo 200, los más recientes) y crea avalúos |
| GET, PUT, DELETE | `/api/avaluos/[id]` | Detalle, metadatos y borrado lógico |
| PUT | `/api/avaluos/[id]/full` | Guarda el avalúo completo |
| POST | `/api/avaluos/[id]/conclude` | Concluye (botón "Concluir" en el editor) |
| POST | `/api/avaluos/[id]/reopen` | Reabre con motivo y aceptación (botón "Reabrir" en el editor) |
| GET | `/api/avaluos/[id]/export` | PDF |
| GET, POST | `/api/avaluos/[id]/caratula/imagen-principal` | Imagen principal |
| GET, POST, DELETE | `/api/avaluos/[id]/caratula/imagen-encabezado` | Imagen de encabezado |
| GET, POST, DELETE | `/api/avaluos/[id]/datos/imagenes` | Imágenes de Datos generales |
| GET, POST | `/api/avaluos/[id]/info-terreno/croquis` | Croquis; el editor todavía no la usa |
| POST | `/api/uploads` | Subida genérica de imágenes |

El cierre de sesión es una server action (`logoutAction`), no una ruta de API.

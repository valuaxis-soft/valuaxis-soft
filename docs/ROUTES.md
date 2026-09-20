# Rutas

## Publicas

- `/iniciar-sesion`
- `/login` -> compatibilidad, redirige a `/iniciar-sesion`
- `/registro`
- `/verificar-correo`
- `/recuperar-contrasena`
- `/restablecer-contrasena`
- `/oauth/resultado`

## Privadas

- `/dashboard`
- `/workspace`

## APIs oficiales

- `/api/auth/logout`
- `/api/auth/google`
- `/api/auth/google/callback`
- `/api/archivos`
- `/api/dashboard/summary`
- `/api/avaluos`
- `/api/avaluos/[id]`
- `/api/avaluos/[id]/full`
- `/api/avaluos/[id]/export`
- `/api/avaluos/[id]/sections`
- `/api/avaluos/[id]/sections/[sectionId]`
- `/api/avaluos/[id]/sections/[sectionId]/blocks`
- `/api/avaluos/[id]/sections/[sectionId]/blocks/[blockId]`
- `/api/comparables`
- `/api/comparables/[id]`
- `/api/comparables/search`
- `/api/comparables/history`
- `/api/users`

## Compatibilidad temporal

- `/api/logout` reexporta `/api/auth/logout`.
- `/api/uploads` reexporta `/api/archivos`.
- `/api/history` reexporta `/api/comparables/history`.

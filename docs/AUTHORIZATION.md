# Autorización

## Fuente de verdad

Los permisos viven en la base de datos: `Rol`, `Permiso` y `PermisoRol`. Las migraciones 004 y 028 siembran los roles `ADMINISTRADOR`, `VALUADOR`, `REVISOR` y `CONSULTA` con sus permisos. Los roles son datos editables; el código no depende de sus nombres.

Al resolver la sesión, `getCurrentUser()` devuelve el usuario con `role` y `permissions`: los permisos activos de su rol en la organización activa.

Las claves están en `AUTH_PERMISSIONS` (`src/features/auth/model.ts`):

| Clave | Permiso |
|---|---|
| `viewValuations` | `AVALUO_VER` |
| `createValuations` | `AVALUO_CREAR` |
| `editValuations` | `AVALUO_EDITAR` |
| `reviewValuations` | `AVALUO_REVISAR` |
| `concludeValuations` | `AVALUO_CONCLUIR` |
| `reopenValuations` | `AVALUO_REABRIR` |
| `exportValuations` | `AVALUO_EXPORTAR` |
| `manageUsers` | `USUARIO_ADMINISTRAR` |

## Cómo se aplica

- **Rutas de API:** `requireApiUser(permiso)` de `src/security/guards/api-guard.ts` al inicio de cada handler. Responde 401 sin sesión y 403 sin permiso.
- **Páginas privadas:** `requireSession()` de `src/security/guards/require-session.ts` redirige a `/iniciar-sesion` sin sesión. El workspace además exige `AVALUO_CREAR` para crear y `AVALUO_VER` para abrir un avalúo.
- **Servicios de imágenes:** validan permiso de ver o editar, que el avalúo sea de la organización del usuario y que no esté bloqueado.
- **Guardado de avalúo:** exige `AVALUO_EDITAR` y rechaza avalúos bloqueados, además de la validación de la ruta.
- **Interfaz:** `canEditProject` y `canExportProject` deciden qué controles se muestran. Es solo presentación: la seguridad está en el servidor.

| Ruta | Permiso |
|---|---|
| `GET /api/avaluos`, `GET /api/avaluos/[id]` | `AVALUO_VER` |
| `POST /api/avaluos` | `AVALUO_CREAR` |
| `PUT` y `DELETE /api/avaluos/[id]`, `PUT /api/avaluos/[id]/full`, `POST /api/uploads` | `AVALUO_EDITAR` |
| `POST /api/avaluos/[id]/conclude` | `AVALUO_CONCLUIR` |
| `POST /api/avaluos/[id]/reopen` | `AVALUO_REABRIR` |
| `GET /api/avaluos/[id]/export` | `AVALUO_EXPORTAR` |

El aislamiento entre organizaciones sigue dependiendo de que cada consulta filtre por `IdOrganizacion`.

## Equipos

Una organización es `PERSONAL` (la que recibe cada usuario al registrarse, como `ADMINISTRADOR`) o `TEAM`. Los miembros de una organización ven todos sus avalúos; su rol decide qué pueden hacer. El código está en `src/features/team/`.

- **Crear el equipo:** en `/organizacion/equipo`, un administrador pone el nombre del despacho y su espacio personal se vuelve `TEAM`. Sus avalúos se quedan en él. Solo se invita a organizaciones `TEAM`.
- **Invitar:** correo y rol (`ADMINISTRADOR`, `VALUADOR`, `REVISOR` o `CONSULTA`). Se guarda en `InvitacionOrganizacion` (migración 034) con el hash del token; vence en 7 días. Hay una sola invitación pendiente por correo y equipo: reenviar revoca la anterior y el enlace viejo deja de servir. El administrador ve el enlace para compartirlo a mano, y si el correo no sale la invitación se conserva. Máximo 30 invitaciones por equipo y hora.
- **Aceptar:** en `/organizacion/invitaciones/<token>` o desde el aviso del tablero. Exige sesión con una cuenta del mismo correo invitado; como el login exige correo verificado, eso prueba que el correo es suyo. Crea o reactiva la membresía con el rol y cambia la sesión al equipo.
- **Administrar:** cambiar el rol o dar de baja. Nadie cambia su propio acceso, el propietario (`IdUsuarioPropietario`) no se puede cambiar, y siempre queda al menos un administrador. La baja desactiva la membresía: la sesión valida la membresía en cada petición, así que el acceso se pierde en ese momento.
- **Inicio de sesión:** abre el primer equipo del usuario; si no tiene, su espacio personal. El selector del encabezado cambia entre los dos.

| Ruta | Permiso |
|---|---|
| `GET` y `PATCH /api/organizacion/equipo`, `POST /api/organizacion/equipo/invitaciones`, `POST` y `DELETE /api/organizacion/equipo/invitaciones/[id]`, `PATCH` y `DELETE /api/organizacion/equipo/miembros/[id]` | `USUARIO_ADMINISTRAR` |
| `GET` y `POST /api/organizacion/invitaciones` | Sesión; solo invitaciones al correo del usuario |

## Pendiente

- **No existe un permiso de borrado.** Borrar un avalúo exige `AVALUO_EDITAR`. Si el despacho quiere restringirlo, se agrega `AVALUO_ELIMINAR` con una migración.
- **Planes y límites de uso** (`Plan`, `FuncionalidadPlan`, `Suscripcion`) no se aplican. Se implementan con el cobro en Stripe.

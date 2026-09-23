# Autorización

Estado real al 23 de septiembre de 2026.

## Cómo funciona hoy

- `getCurrentUser()` resuelve la sesión, la organización activa y el rol del usuario (`Rol.SClave`).
- Los permisos que se revisan salen de un **mapa fijo por rol** en `src/features/auth/permissions.ts`, con claves `projects.*`, `users.manage` y `catalogs.manage`.
- `requirePermissionPolicy` (`src/features/valuations/policies/valuation-access.policy.ts`) usa ese mapa. Solo se aplica en tres rutas:
  - concluir avalúo, con `projects.complete`;
  - reabrir avalúo, con `projects.reopen`;
  - exportar PDF, con `projects.export`.
- Crear un avalúo revisa `projects.create` dentro de `saveValuation`.
- El aislamiento entre organizaciones depende de que cada consulta filtre por `IdOrganizacion`.

## Lo que existe pero no se usa

- **Permisos en base de datos.** `Rol`, `Permiso` y `PermisoRol` tienen 4 roles (`ADMINISTRADOR`, `VALUADOR`, `REVISOR`, `CONSULTA`) y 18 permisos `AVALUO_*`, `USUARIO_*`, etc., sembrados por migraciones. `buildAuthorizationContext` los carga, pero las rutas no los consultan.
- **Guards** `requireSession`, `requirePermission` y `requireFeature` en `src/security/guards`. Ninguna ruta los importa.
- **Planes y funcionalidades.** `Plan`, `FuncionalidadPlan` y `Suscripcion` se leen para el dashboard. Ningún límite se aplica. El registro no crea suscripción.

## Decisión pendiente

Unificar en un solo sistema: permisos de la base de datos aplicados con los guards en todas las rutas que escriben datos. Es parte de las correcciones críticas de Fase 0.

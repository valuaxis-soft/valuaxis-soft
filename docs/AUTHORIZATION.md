# Authorization

El contexto de autorizacion se construye desde modelos reales:

- `Usuario`
- `MiembroOrganizacion`
- `Rol`
- `Permiso`
- `PermisoRol`
- `Suscripcion`
- `Plan`
- `FuncionalidadPlan`

Contrato logico:

- `userId`
- `organizationId`
- `role`
- `permissions`
- `subscription.status`
- `subscription.plan`
- `features`

Pendiente:

- aplicar permisos granulares en todos los endpoints mutativos;
- politicas de suscripcion/exportacion por feature y limite;
- auditoria uniforme de acciones sensibles.

## Politicas agregadas

- `requirePermissionPolicy`
- `requireValuationAccessPolicy`
- `requireEditableValuationPolicy`
- `canCreateValuationUnderLimit`

Estas politicas tienen pruebas unitarias y se aplican ya en concluir, reabrir y exportacion PDF.

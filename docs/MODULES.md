# Modulos y Base de Datos

Fuente de verdad disponible:

- `prisma/schema.prisma`
- `prisma/migrations/`

## Mapeo

auth:
`Usuario`, `ProveedorIdentidad`, `IdentidadUsuario`, `TokenVerificacionCorreo`, `TokenRecuperacionContrasena`, `SolicitudOAuth`, `Sesion`, `IntentoAcceso`, `Auditoria`.

organizations:
`Organizacion`, `MiembroOrganizacion`, `Rol`, `Permiso`, `PermisoRol`, concesiones/excepciones pendientes de servicio especifico.

subscriptions:
`Plan`, `Funcionalidad`, `FuncionalidadPlan`, `PrecioPlan`, `Suscripcion`, `ConcesionFuncionalidad`, consumos y limites definidos en schema.

payments:
Modelos de pagos/facturacion definidos en migraciones; integracion de proveedor queda pendiente.

valuations:
`Avaluo`, `UsuarioAvaluo`, `VersionAvaluo`, `EstadoAvaluo`, `TransicionEstadoAvaluo`, `ReaperturaAvaluo`, `SeccionDocumento`, `NodoDocumento`, `ValorNodoDocumento`, datos tecnicos, enfoques valuatorios y `ConclusionAvaluo`.

files:
`Archivo`, `RelacionArchivo`, `VersionArchivo`, `CargaArchivo`.

comparables:
`Propiedad`, `DireccionPropiedad`, `PublicacionPropiedad`, `ComparableAvaluo`, snapshots/historiales, ubicaciones y PostGIS.

## Diferencias detectadas

- El codigo previo usaba modelos Prisma inexistentes: `valuation`, `section`, `block`, `concept`, `table`, `image`, `comparable`, `comparableHistory`, `upload`, `user`.
- El esquema real usa modelos en espanol con tablas `devpware_*`.
- No se crearon migraciones ni tablas paralelas para cubrir esa diferencia.

# Módulos y base de datos

Fuente de verdad del esquema: `prisma/schema.prisma` y `prisma/migrations/`. Las tablas llevan el prefijo `devpware_` y las columnas un prefijo por tipo: `Id`, `U` (UUID), `S` (texto), `B` (booleano), `D` (fecha), `I` (entero), `N` (decimal), `J` (JSON), `G` (geografía).

## Qué usa el código

| Módulo | Modelos en uso |
|---|---|
| auth | `Usuario`, `IdentidadUsuario`, `ProveedorIdentidad`, `Sesion`, `IntentoAcceso`, `TokenVerificacionCorreo`, `TokenRecuperacionContrasena`, `SolicitudOAuth`, `Auditoria` (solo Google) |
| organizaciones | `Organizacion`, `MiembroOrganizacion`, `Rol`, y `Permiso` y `PermisoRol` solo por relación |
| suscripciones | `Suscripcion` con `Plan` y funcionalidades, solo lectura para el dashboard |
| avalúos | `Avaluo`, `VersionAvaluo`, `EstadoAvaluo`, `EstadoVersionAvaluo`, `EstadoAvaluoHistorial`, `ReaperturaAvaluo`, `SerieFolioOrganizacion`, `PlantillaAvaluo`, `CaratulaAvaluo` |
| documento del avalúo | `SeccionDocumento`, `NodoDocumento`, `ValorNodoDocumento`, `TablaDocumento`, `ColumnaTablaDocumento`, `FilaTablaDocumento`, `CeldaTablaDocumento` |
| archivos | `Archivo`, `RelacionArchivo`, `CargaArchivo`, `TipoArchivo`, `TipoRelacionArchivo` |
| comparables | `ComparableAvaluo`, `Propiedad`, `DireccionPropiedad`, solo lectura |

El contenido del avalúo vive casi todo en el árbol genérico `SeccionDocumento` → `NodoDocumento` → `ValorNodoDocumento`, con la presentación en columnas JSON `JConfiguracion`.

## Qué existe sin uso

De los 135 modelos del esquema, unos 90 no tienen código que los use:

- **Datos técnicos normalizados:** terreno, construcción, zonas, colindancias, instalaciones, consideraciones.
- **Enfoques valuatorios:** costos, mercado, renta, ingresos, resumen de valor, conclusión.
- **Cálculos, plantillas versionadas, campos personalizados.**
- **Homologación y comparables avanzados;** geoespacial con PostGIS.
- **Trabajos, importaciones, snapshots y exportaciones.**

Además, las migraciones 020, 021 y 026 a 028 crean unas 46 tablas (IA, normatividad, pagos, consumos, opciones de permisos) que no están en `schema.prisma`. No usar `prisma db push`: las borraría.

Qué se conserva y qué se elimina se decide al cerrar el modelo de datos de Fase 0, con [fase0/README.md](fase0/README.md) como base.

## Catálogos

`prisma/seed.ts` está vacío. Los catálogos (estados, tipos de nodo, tipos de archivo, roles, permisos, proveedores de identidad) se insertan en las migraciones. Si faltan, varias rutas responden con error de catálogo faltante.

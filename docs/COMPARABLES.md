# Comparables

Flujo real de datos:

`Propiedad -> DireccionPropiedad -> PublicacionPropiedad -> ComparableAvaluo -> HistorialUsoComparable`

Implementado:

- listado de comparables por organizacion;
- busqueda por codigo postal usando modelos reales;
- inclusion/exclusion logica de `ComparableAvaluo`;
- bloqueo explicito de creacion incompleta para no inventar tablas.

Pendiente:

- busqueda PostGIS por radio;
- snapshots completos al seleccionar;
- panel de mapa con proveedor externo;
- filtros avanzados de precio, superficie, fuente y fecha.

## Mapa

Se agrego `MapProvider` con `DevelopmentMapProvider`. No conecta proveedor real ni credenciales.

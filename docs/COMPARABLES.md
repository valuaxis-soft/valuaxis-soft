# Comparables

Estado al 24 de septiembre de 2026.

## Captura manual (hecha)

En las secciones de mercado en venta y de mercado de rentas, el panel de cálculo captura los comparables de cada tipo (`TERRENO_VENTA`, `INMUEBLE_VENTA`, `INMUEBLE_RENTA`):

- Ubicación, superficie, precio o renta mensual, uso de suelo, zona, forma, topografía, frente, fondo, servicios y observaciones.
- Fuente, contacto, teléfono, liga del anuncio y fecha de la oferta.
- Hasta 6 fotografías por comparable, privadas, con su `Archivo` y `RelacionArchivo`.
- Factores de homologación como calificación del sujeto entre calificación del comparable, en las columnas que elige el perito (15 tipos del catálogo; el de superficie lo calcula el motor).

Se guardan en `Propiedad`, `ComparableAvaluo` (con snapshots de propiedad, dirección, publicación y fotos) y `FactorHomologacion`. Si hay liga, también en `FuenteInmobiliaria` y `PublicacionPropiedad`. Cada comparable pertenece a una versión del avalúo; al reabrir se copian con sus factores.

El panel avisa con menos de 4 comparables completos, con dispersión mayor a 1.25 y con un valor adoptado fuera del rango homologado. Las tablas de comparables, de homologación y el resumen, y las fotografías en el anexo, se escriben en el dictamen.

## Pendiente

- Carga por archivo y extracción de portales (característica 12).
- Búsqueda y reutilización de comparables entre avalúos: `Propiedad` ya es por organización, falta la pantalla.
- Coordenadas: `DireccionPropiedad` exige latitud y longitud, así que la dirección capturada se guarda solo en el snapshot hasta tener geocodificación.

La metodología está en [fase0/metodologia/02-mercado-homologacion.md](fase0/metodologia/02-mercado-homologacion.md).

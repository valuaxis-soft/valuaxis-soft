# Comparables

Estado al 29 de septiembre de 2026.

## Captura manual (hecha)

En las secciones de mercado en venta y de mercado de rentas, el panel de cálculo captura los comparables de cada tipo (`TERRENO_VENTA`, `INMUEBLE_VENTA`, `INMUEBLE_RENTA`):

- Ubicación, superficie, precio o renta mensual, uso de suelo, zona, forma, topografía, frente, fondo, servicios y observaciones.
- Fuente, contacto, teléfono, liga del anuncio y fecha de la oferta.
- Hasta 6 fotografías por comparable, privadas, con su `Archivo` y `RelacionArchivo`.
- Factores de homologación como calificación del sujeto entre calificación del comparable, en las columnas que elige el perito (15 tipos del catálogo; el de superficie lo calcula el motor).

Se guardan en `Propiedad`, `ComparableAvaluo` (con snapshots de propiedad, dirección, publicación y fotos) y `FactorHomologacion`. Si hay liga, también en `FuenteInmobiliaria` y `PublicacionPropiedad`. Cada comparable pertenece a una versión del avalúo; al reabrir se copian con sus factores.

El panel avisa con menos de 4 comparables completos, con dispersión mayor a 1.25 y con un valor adoptado fuera del rango homologado. Las tablas de comparables, de homologación y el resumen, y las fotografías en el anexo, se escriben en el dictamen.

## Carga desde Excel (hecha)

"Importar Excel" en el panel de mercado descarga la plantilla del tipo de comparable (`GET /api/comparables/plantilla?tipo=`) y recibe el archivo lleno, `.xlsx` o `.csv` (con coma o punto y coma), de hasta 2 MB y 100 comparables.

- Los encabezados se reconocen sin acentos ni mayúsculas y en cualquier orden. También acepta variantes comunes: "Dirección", "Precio", "Superficie", "Liga", "Fecha".
- Los números aceptan `$1,528,000.00`; las fechas, fechas de Excel, `dd/mm/aaaa` o `aaaa-mm-dd`; la liga, un hipervínculo de Excel.
- Cada renglón pasa por la misma validación que la captura manual (`comparableInputSchema`). Antes de guardar se muestra una vista previa con los errores por renglón; se importan solo los válidos, todos en una transacción, y el cálculo se rehace una vez.
- Los factores de homologación y las fotos se capturan después, en el panel.

El código está en `calculation/comparable-import.ts` (lectura y validación, sin dependencias) y `calculation/comparable-workbook.ts` (archivos, con ExcelJS).

## Extracción de portales

Se probó leer anuncios desde el servidor el 29 de septiembre de 2026. Inmuebles24, Lamudi, Vivanuncios, Propiedades.com y Mitula bloquean a los robots (401/403, verificación anti-bots); solo Mercado Libre responde, con datos estructurados. No se evaden esas protecciones. Las opciones viables, pendientes de decidir con el cliente, son pegar el texto del anuncio y extraerlo con IA (cualquier portal) e importar por liga desde Mercado Libre.

## Pendiente

- Búsqueda y reutilización de comparables entre avalúos: `Propiedad` ya es por organización, falta la pantalla.
- Coordenadas: `DireccionPropiedad` exige latitud y longitud, así que la dirección capturada se guarda solo en el snapshot hasta tener geocodificación.

La metodología está en [fase0/metodologia/02-mercado-homologacion.md](fase0/metodologia/02-mercado-homologacion.md).

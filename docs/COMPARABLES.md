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

## Catálogo y sugerencia de factores (hecha)

Característica 14. Cada factor se elige de un catálogo de calificaciones del despacho (`calculation/factor-catalog.ts`); el factor es calificación del sujeto entre calificación del comparable, como en los libros (`=1/1.15`). La negociación es un factor directo y nace en 0.95, el valor de todos los libros.

- **Catálogo propuesto:** sale de los valores que usan los libros del despacho (Fase 0, `metodologia/02-mercado-homologacion.md` §4) y de la tabla de conservación de maquinaria, completado con las gradaciones usuales. Se guarda en `JCatalogoFactores` de la organización (migración 036; vacío = el propuesto). La sección que lo editaba en **Despacho** se quitó el 23 oct 2026 a pedido del valuador; el panel de mercado lo sigue leyendo y la API (`PUT`/`DELETE /api/organizacion/despacho/factores`) sigue disponible. Se confirma con el perito en la pregunta 7.
- **Sujeto una vez:** en el panel de mercado se elige la calificación del sujeto de cada factor (se guarda en `factorSlots[].subjectOption`). Cada comparable solo elige la suya y el factor se calcula con su justificación ("Zona: sujeto Similar (1) / comparable Superior (1.05)"). Si el sujeto cambia, los comparables calificados con la opción anterior se actualizan; los capturados a mano no.
- **Captura a mano:** sigue disponible por factor ("Capturar a mano"), para lo que no esté en el catálogo.
- **Rangos:** el panel marca el comparable con un factor fuera de 0.80–1.20 o un factor resultante fuera de 0.65–1.35 (rangos editables por despacho).

## Carga desde Excel (hecha)

"Importar Excel" en el panel de mercado descarga la plantilla del tipo de comparable (`GET /api/comparables/plantilla?tipo=`) y recibe el archivo lleno, `.xlsx` o `.csv` (con coma o punto y coma), de hasta 2 MB y 100 comparables.

- Los encabezados se reconocen sin acentos ni mayúsculas y en cualquier orden. También acepta variantes comunes: "Dirección", "Precio", "Superficie", "Liga", "Fecha".
- Los números aceptan `$1,528,000.00`; las fechas, fechas de Excel, `dd/mm/aaaa` o `aaaa-mm-dd`; la liga, un hipervínculo de Excel.
- Cada renglón pasa por la misma validación que la captura manual (`comparableInputSchema`). Antes de guardar se muestra una vista previa con los errores por renglón; se importan solo los válidos, todos en una transacción, y el cálculo se rehace una vez.
- Los factores de homologación y las fotos se capturan después, en el panel.

El código está en `calculation/comparable-import.ts` (lectura y validación, sin dependencias) y `calculation/comparable-workbook.ts` (archivos, con ExcelJS).

## Fichas, evidencia, duplicados y revisión (hecha, 22 oct 2026)

Tomado como referencia (no como copia) de los videos de SAX que envió el valuador. Migración 044.

- **ID del despacho:** cada comparable lleva un número de la organización, `C-00123` (`Propiedad.IFolioComparable`, contador `Organizacion.IUltimoFolioComparable`). Las copias de una versión reabierta, las que se separan al editar, las que se agregan desde "Buscar comparables" y las de "Usar el existente" conservan el número; "Agregar de todos modos" da uno nuevo. Las propiedades que ya eran comparables recibieron número en la migración.
- **Ficha:** `/comparables/<uuid>` y el diálogo "Ver ficha" (panel de mercado, búsqueda, duplicados y revisión): fotos, pantalla de referencia, precio y $/m², ubicación, fuente, terreno y construcción, características, revisión, avisos y los avalúos en que se usó.
- **Evidencia:** "Pantalla de referencia" (captura del anuncio, aparte de las fotos; se pega con Ctrl+V o se sube, y en un comparable nuevo se guarda al guardarlo), fecha de consulta (hoy por omisión), vigencia y el texto pegado en "Pegar anuncio". Nada es obligatorio: falta de pantalla es un aviso.
- **Captura:** ubicación por partes (estado, municipio, C.P., colonia, calle, número) además del texto de una línea que imprime el dictamen (si se deja vacío, se arma con las partes; los comparables anteriores conservan su texto), proximidad urbana SHF (1 Céntrica … 5 Rural), tipo de operación y latitud/longitud opcionales (ambas o ninguna; las llenará el mapa). Todo vive en los snapshots del comparable; el motor no los lee.
- **Duplicados:** al guardar un comparable nuevo y en la vista previa de Excel se buscan en la base del despacho (versión vigente de cada avalúo) la misma liga, la misma calle y número en la misma colonia o municipio, o el mismo teléfono con precio a ±1 % (`calculation/comparable-duplicates.ts`). Se ofrece "Usar el existente" o "Agregar de todos modos".
- **Búsqueda:** filtros de estado, municipio, colonia, C.P., tipo de inmueble, operación, superficie, precio y fecha de consulta; el texto acepta el ID. Resultados con ID, miniatura, precio, $/m², superficie, fecha y "Ver ficha".
- **Revisión:** "Revisión de comparables" lista los comparables de todos los mercados con su estado (Por revisar, Verificado, Con observaciones, Rechazado), la lista de comprobación, notas, quién y cuándo, "Abrir anuncio" y "Ver pantalla de referencia" (`ComparableAvaluo.JRevision`, se copia al reabrir). Avisos, nunca bloqueos: superficie construida a más de ±20 % de la del sujeto (`BUILT_AREA_TOLERANCE`, constante por ahora), dirección sin número, contacto que es solo el portal, sin pantalla de referencia y oferta de 6 meses o más. Concluir con comparables por revisar solo avisa.

## Base de comparables, vigencia y duplicados (hecha, 23 oct 2026)

Migración 046.

- **Comparables** en el menú (`/comparables`, `AVALUO_VER`): un renglón por comparable de la base (su número), con su captura más reciente, miniatura, superficies, precio, fechas, vigencia y los avalúos que lo usaron. Filtros: texto o número, cliente (usados en avalúos de ese cliente), estado, municipio, colonia, C.P., tipo y operación, tipo de construcción, uso de suelo, superficie de terreno y construida, recámaras y baños (mínimo), fecha de alta o actualización y vigencia. Las piezas de SQL se comparten con la búsqueda del panel (`comparable-search/own-base-sql.ts`).
- **Datos para buscar:** los comparables construidos capturan, además, tipo de construcción, superficie de terreno, recámaras y baños (también en la plantilla de Excel). Viven en el snapshot; el cálculo y el dictamen no los leen.
- **Vigencia:** `ComparableAvaluo.DFechaActualizacionDatos` es la "Fecha de alta / actualización"; "Vigente hasta" es esa fecha más `OFFER_MAX_AGE_MONTHS` (6, la misma constante del aviso de oferta vieja). Vencido es un aviso (`EXPIRED` en la revisión y la ficha), nunca un bloqueo. Editar los datos del comparable la renueva; calificar factores o excluirlo de la regresión no. "Usar el existente", lo agregado desde la búsqueda y las copias al reabrir conservan la fecha original.
- **Duplicados:** además de liga, dirección y teléfono con precio, `SIMILAR` = misma colonia o municipio, superficie y precio (±1 %), para lo que coincide en todo menos un detalle. Las respuestas: **Es el mismo** (conserva el número del existente y queda el dato más reciente; si el existente es más nuevo que la oferta importada, se usa el existente), **Son diferentes** (se guardan los dos) y "Usar el existente sin cambios".

## Extracción de portales

Se probó leer anuncios desde el servidor el 29 de septiembre de 2026. Inmuebles24, Lamudi, Vivanuncios, Propiedades.com y Mitula bloquean a los robots (401/403, verificación anti-bots); solo Mercado Libre responde, con datos estructurados. No se evaden esas protecciones. Las opciones viables, pendientes de decidir con el cliente, son pegar el texto del anuncio y extraerlo con IA (cualquier portal) e importar por liga desde Mercado Libre.

## Pendiente

- Coordenadas: `DireccionPropiedad` exige latitud y longitud, así que la dirección capturada (ahora por partes, con latitud y longitud a mano) se guarda solo en el snapshot hasta tener mapa y geocodificación.
- El ±20 % de superficie construida es una constante; pasarlo a Datos del despacho si el valuador lo pide.

La metodología está en [fase0/metodologia/02-mercado-homologacion.md](fase0/metodologia/02-mercado-homologacion.md).

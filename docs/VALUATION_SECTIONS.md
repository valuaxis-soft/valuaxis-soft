# Valuation Sections

El registro central vive en `src/features/valuations/sections/section-registry.ts`.

Cada seccion define:

- clave;
- etiqueta;
- orden;
- tipo (`normalized`, `document`, `hybrid`);
- obligatoriedad;
- visibilidad;
- permisos;
- tablas Prisma reales utilizadas.

## Secciones ocultas al crear

Un avalúo nuevo de **maquinaria y equipo** nace con las secciones que su libro (MEH) no tiene ya ocultas: terreno, construcciones, mercado de rentas, ingresos, croquis y fotos de comparables, indirectos y mapa de comparables (`initiallyHiddenSections` en el registro). Solo quedan ocultas: el valuador las muestra otra vez con "Mostrar" y lo que elija se guarda como en cualquier sección. Los avalúos que ya existían no cambian, y los demás tipos de bien nacen con todas las secciones a la vista.

## Ocultar y eliminar

- Secciones, bloques y apartados se ocultan con "Ocultar" y se guardan ocultos: la sección y el bloque en `BVisible`, el apartado en el `enabled` de su `JConfiguracion` (hasta el 23 de octubre de 2026 el apartado se guardaba siempre visible). Lo oculto no se imprime.
- Una sección que agregó el valuador ("+ Sección") se elimina completa con "Eliminar sección" en su encabezado o con el bote de basura de su pestaña activa; ambos piden confirmación. Las secciones del registro solo se ocultan.

## Cómo se guarda

- El editor guarda el avalúo completo con `PUT /api/avaluos/:id/full`. No se guardan secciones o bloques por separado.
- Todo el contenido se guarda en el árbol genérico `SeccionDocumento` → `NodoDocumento` → `ValorNodoDocumento`, con tablas en `TablaDocumento`. La única tabla normalizada que se escribe es `CaratulaAvaluo`.
- Los campos `kind` (`normalized`, `document`, `hybrid`), `tables` y `permissions` del registro son declarativos: hoy ningún código los consulta.

## Mover y copiar entre secciones

Las operaciones viven en `services/structure-transfer.ts` (puras) y el editor las ofrece con `structure-transfer-context.tsx`:

- **Conceptos:** "Seleccionar conceptos" (en bloques y apartados) y "Mover a…" llevan los elegidos al final de otro bloque o apartado, de esta u otra sección, en su orden y con los que comparten renglón juntos. Conservan su id: ligas y fórmulas siguen funcionando.
- **Bloques y apartados:** el menú "…" del encabezado ofrece Copiar, Duplicar y Mover (a otra sección, o a otro bloque para un apartado). "Pegar bloque" aparece en el encabezado de la sección y "Pegar apartado" dentro del bloque mientras haya algo copiado. Mover conserva los ids; copiar, duplicar, pegar e importar dan ids nuevos a todo (bloque, apartados, conceptos, tablas, imágenes y referencias del layout). Las fórmulas y ligas entre lo copiado apuntan a las copias; una liga con un concepto de fuera de la copia se conserva.
- **Bloqueos:** no se mueven ni copian los bloques del cálculo (`motor-…`), los de plantilla que sus resultados reemplazan, los de la carátula ni los apartados con una tabla fija (medidas y colindancias, capturas de costos). Las imágenes de Datos generales son archivos de su servicio: una copia que va ahí no las lleva y un movimiento con imágenes se rechaza.

## Plantillas del despacho

- "Guardar como plantilla" (barra superior) guarda el documento guardado del avalúo con un nombre único en el despacho, en `PlantillaAvaluo` + `VersionPlantilla.JConfiguracionGeneral` (`document-template.ts`, formato 1). Sin "Incluir datos" los conceptos quedan sin valor y las tablas con encabezados, fórmulas y un renglón vacío; sin "Incluir imágenes" no lleva imágenes. Los bloques del cálculo nunca se guardan. No hizo falta migración.
- Al crear un avalúo, "Plantilla base" empieza en la plantilla del sistema del tipo de avalúo y ofrece las del despacho, que sirven para cualquier tipo: el documento se escribe como primer guardado y la carátula toma título, cliente, fecha y firmante del avalúo nuevo.
- "Importar bloque" (encabezado de cada sección) inserta una copia de un bloque de una plantilla o de otro avalúo del despacho, sin datos ni imágenes salvo que se marquen.

## Versionado

- Crear un avalúo asegura una `VersionAvaluo` de trabajo. Guardar no crea versión nueva.
- `POST /api/avaluos/:id/conclude` finaliza la versión de trabajo.
- `POST /api/avaluos/:id/reopen` crea una nueva versión de trabajo con una copia completa de la final (`valuation-version-copy.service.ts`): secciones, árbol de nodos, valores, tablas, carátula y comparables.
- Un avalúo concluido se muestra con el contenido de su versión final.
- Ninguna de las dos acciones tiene botón en la interfaz.

## Valores y tablas

- Los valores capturados se guardan exactamente como se escribieron, en texto. Los valores guardados antes del 23 de septiembre de 2026 pueden estar en forma numérica ("7000" en lugar de "7,000.00") y se muestran así.
- Las tablas se guardan como TableV2 sin pérdida (`table-persistence.ts`): ids de filas y columnas, texto exacto, fórmulas, formatos y esquema. Las filas, columnas y tablas borradas en el editor se marcan como eliminadas.

## Capítulos, anexos y saltos de página

- **Capítulos y anexos** (`services/document-structure.ts`, numeración en `section-numbering.ts`): las secciones después de Conclusión son anexos salvo que el valuador elija otra cosa en "Configuración de la sección" (`documentRole`). Un anexo imprime "ANEXO 1", "ANEXO 2"… (o el rótulo que escriba, `annexTitle`) en el título de su primer bloque impreso; sus bloques y apartados no llevan número romano. Los capítulos siguen con una sola cuenta romana. "+ Sección" pregunta Capítulo (se inserta antes de Conclusión) o Anexo (al final).
- **Salto de página:** bloques y apartados tienen tres valores (`pageBreak`): automático, nueva página y continuar (empieza justo donde terminó el anterior; su título no se lleva a la página siguiente). Lo guardado antes con `startOnNewPage` se lee como "nueva página". Una sección empieza en página nueva o continúa la anterior (`pageBreak: "continue"`); en el dictamen las secciones que continúan comparten un solo flujo de páginas (`printableSectionGroups`). La carátula nunca comparte páginas.

## Agregar al informe valuatorio

Cada enfoque (costos, mercado de venta de inmuebles, de terrenos, de rentas, ingresos) tiene un interruptor en la configuración de su sección. Apagado se guarda en `excludedFromReport` de la sección (`services/report-approaches.ts`): el dictamen no imprime la sección (o, en mercado de venta, las páginas de ese mercado y sus fotos del anexo), no toma número, y la conclusión lo trata como "no aplica" (el servidor lo lee del documento guardado; el mercado se toma de inmuebles y si no de terrenos, entre los que siguen incluidos). Guardar un cambio de interruptor recalcula la conclusión.

## Configuración que no se imprime

La carátula abre con "Configuración del avalúo" (separador de miles, margen, barras de título, banda y precisión del cálculo) y cada sección con "Configuración de la sección": paneles de borde punteado con el rótulo "Configuración — no se imprime".

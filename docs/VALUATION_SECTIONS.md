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
- Todo borrado pide confirmación con el mismo diálogo (`delete-confirm.tsx`): conceptos, bloques, subbloques, imágenes, la imagen y los datos del encabezado de la carátula y los tipos de construcción. Las imágenes guardadas en el servidor (encabezado, Datos generales) solo salen del documento al quitarlas y el archivo se borra después del guardado que ya no las lleva (`storedImagesToDelete`), así «Deshacer» las devuelve completas. Un tipo de construcción se guarda solo: vuelve con Ctrl+Z en su tabla.
- Una sección que agregó el valuador ("+ Sección") se elimina completa con "Eliminar sección" en su encabezado o con el bote de basura de su pestaña activa; ambos piden confirmación. Las secciones del registro solo se ocultan.

## Cómo se guarda

- El editor guarda el avalúo completo con `PUT /api/avaluos/:id/full`. No se guardan secciones o bloques por separado. Ctrl+S (⌘S en Mac) guarda igual que el botón «Guardar» y no abre el «Guardar página» del navegador.
- Negrita, cursiva y subrayado viajan en el valor como `<b>`, `<i>`, `<u>` (`text-marks.ts`), pero el campo del editor muestra solo el texto: lo que se escribe conserva las marcas (`withMarkedText`) y la vista previa bajo el campo las muestra aplicadas.
- Todo el contenido se guarda en el árbol genérico `SeccionDocumento` → `NodoDocumento` → `ValorNodoDocumento`, con tablas en `TablaDocumento`. La única tabla normalizada que se escribe es `CaratulaAvaluo`.
- Los campos `kind` (`normalized`, `document`, `hybrid`), `tables` y `permissions` del registro son declarativos: hoy ningún código los consulta.

## Mover y copiar entre secciones

Las operaciones viven en `services/structure-transfer.ts` (puras) y el editor las ofrece con `structure-transfer-context.tsx`:

- **Conceptos:** "Seleccionar conceptos" (en bloques y apartados) y "Mover a…" llevan los elegidos al final de otro bloque o apartado, de esta u otra sección, en su orden y con los que comparten renglón juntos. Conservan su id: ligas y fórmulas siguen funcionando.
- **Bloques y apartados:** el menú "…" del encabezado ofrece Copiar, Duplicar y Mover (a otra sección, o a otro bloque para un apartado). "Pegar bloque" aparece en el encabezado de la sección y "Pegar apartado" dentro del bloque mientras haya algo copiado. Mover conserva los ids; copiar, duplicar, pegar e importar dan ids nuevos a todo (bloque, apartados, conceptos, tablas, imágenes y referencias del layout). Las fórmulas y ligas entre lo copiado apuntan a las copias; una liga con un concepto de fuera de la copia se conserva.
- **Bloqueos:** no se mueven ni copian los bloques del cálculo (`motor-…`), los de la carátula ni los apartados con una tabla fija (medidas y colindancias, capturas de costos). Los bloques de plantilla que los resultados del cálculo reemplazan (Ingresos, Costos, Mercado antes de calcular) no se mueven, pero sí se copian y duplican: la copia tiene ids nuevos y es del valuador (`blockCopyLockReason`). Las imágenes de Datos generales son archivos de su servicio: una copia que va ahí no las lleva y un movimiento con imágenes se rechaza.

## Controles iguales en todos los bloques

- **Clic derecho:** el título de cada bloque, cada concepto y cada tabla tienen su menú de clic derecho con las mismas acciones que su barra o su ⋮ (`block-title-context-menu.tsx`, `concept-context-menu.tsx` con el modelo en `services/concept-context-menu.ts`, `table-context-menu.ts`, `calc-table-context-menu.tsx`). Lo que no aplica se queda en el menú, deshabilitado, con el motivo. El texto seleccionado dentro de un campo conserva el menú del navegador.
- **Bloques del cálculo** (Costos, Mercado, Ingresos calculado): tienen el mismo menú del título, el ··· con Ocultar y Salto de página, "Seleccionar conceptos" y el ⋮ y el clic derecho por concepto. El valuador cambia el nombre, el espacio y el renglón de sus conceptos, y se conservan cuando el cálculo reescribe el bloque (`withTableLayouts`); el dato, su formato, su lugar y borrarlo son del cálculo.
- **Borrar** desde cualquier menú pide confirmación con el mismo diálogo de la papelera (`delete-confirm.tsx`) y se deshace con «Deshacer».

## Plantillas del despacho

- "Guardar como plantilla" (barra superior) guarda el documento guardado del avalúo con un nombre único en el despacho, en `PlantillaAvaluo` + `VersionPlantilla.JConfiguracionGeneral` (`document-template.ts`, formato 1). Los datos del cliente y del inmueble nunca van en la plantilla (2 nov 2026: «Departamentos Jalisco» llevaba un cliente real): los conceptos quedan sin valor salvo los textos del valuador (toda la sección Consideraciones y los textos largos y párrafos de cualquier sección), las tablas con encabezados, fórmulas y un renglón vacío; formatos, unidades y rótulos se conservan; sin "Incluir imágenes" no lleva imágenes (`stripClientData`). Los bloques del cálculo nunca se guardan. "Crear avalúo con plantilla" vuelve a limpiar lo que lea (`stripClientDataFromSections`), así que una plantilla vieja con datos tampoco los hereda. La tarjeta de la plantilla marca «Contiene datos» (`templateContainsData`) cuando aún los lleva; `pnpm templates:clean [--apply]` (`scripts/ops/limpiar-plantillas.ts`, dry run por omisión) limpia las existentes. No hizo falta migración.
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
- **Tablas uniformes** (auditoría de noviembre de 2026):
  - "Quitar tabla" pide confirmación con el mismo diálogo de los demás borrados (`delete-confirm.tsx`) y se deshace con «Deshacer».
  - Una columna sin formato cuyos valores son cifras (al menos dos y más del doble que los textos; una fórmula cuenta como cifra; `isInferredNumericColumn` en `services/table.ts`) marca en rojo las letras escritas en ella, igual que una columna con formato numérico. Solo avisa: lo escrito se guarda como está. «10%» vale 0.10 en las fórmulas y al ordenar.
  - Las tablas que escribe el cálculo (Costos, Mercado, Ingresos…) tienen "Formato de la tabla" junto a «Columnas de…»: ancho (página o contenido) y decimales. Se guardan con las columnas ocultas y renombradas (`GeneratedTableLayout.widthMode`/`decimals`), así que el siguiente cálculo los conserva. Los decimales solo cambian cómo se imprimen las cifras con decimales, los montos y los porcentajes (`figureWithDecimals`); el valor que escribió el cálculo no cambia, y las claves, edades y conteos quedan como están. Las tablas de captura de los paneles no se imprimen: su menú indica que el formato se elige en la tabla del dictamen.
  - "Copiar fórmula a toda la columna/fila" copia la fórmula de la celda a las celdas vacías de su columna o fila; si la celda tiene un valor escrito y no una fórmula, el menú dice "Copiar valor a toda la columna/fila" y copia ese valor (por ejemplo, 1 frente en todos los comparables). En las tablas del editor y en las de captura de los paneles; nunca sobrescribe lo capturado.
- **Un solo sistema de fórmulas** (videos de noviembre de 2026): los campos numéricos de los paneles de cálculo (tipos de construcción, Costos, Ingresos, especificaciones de Mercado, Conclusión, maquinaria, ficha del comparable; `FormulaInput`) y las calificaciones y bases de las variables de los métodos alternativos escriben fórmulas igual que las tablas del editor: «=» muestra la barra de fórmula con «Buscar valor», un clic en una celda o un concepto escribe su referencia y Enter la aplica. Como en la homologación, el panel guarda la fórmula con los números que leen sus referencias (`capturedFormulaText`: «=[Superficie total de terreno]*2» se guarda «=1250*2»), porque el motor del servidor no conoce el documento. «10%» queda escrito como 0.1 al salir del campo, y las letras en un campo o celda numérica se marcan en rojo con el aviso «Este campo es numérico» (solo avisa; lo escrito se guarda). La barra de fórmula es editable: se puede escribir en ella o en la celda. Una fórmula de concepto que solo trae el valor de otro concepto (`=[Superficie total de terreno]`) ofrece «Vincular dato» (`linkConceptValueTo`); el vínculo es opcional.
- El importe del valor concluido en el panel de Conclusión se muestra como lo imprime el dictamen: «$2,200,000.00 M.N.».

## Capítulos, anexos y saltos de página

- **Capítulos y anexos** (`services/document-structure.ts`, numeración en `section-numbering.ts`): las secciones después de Conclusión son anexos salvo que el valuador elija otra cosa en "Configuración de la sección" (`documentRole`). Un anexo imprime "ANEXO 1", "ANEXO 2"… (o el rótulo que escriba, `annexTitle`) en el título de su primer bloque impreso; sus bloques y apartados no llevan número romano. Los capítulos siguen con una sola cuenta romana de bloques, y el número de un capítulo (pestaña, índice «Secciones», memoria) es el de su primer bloque impreso, así el editor y el dictamen leen lo mismo (2 nov 2026: Fotografías era IX en el editor y XIII en el dictamen); la carátula no lleva número y un capítulo sin nada impreso tampoco (`chapterLabel`). "+ Sección" pregunta Capítulo (se inserta antes de Conclusión) o Anexo (al final).
- **Pie de página del dictamen:** cada página imprime «Página n de m» al pie, con una sola cuenta en todo el dictamen (`DocumentPageFooterProvider`, `numberDocumentPages` en `valuation-dictamen.tsx`); la vista previa de una sección en el editor no lo muestra. El PDF lo lleva porque es parte de la página (el dictamen imprime sin márgenes; la memoria usa el pie de Chromium).
- **Orientación de página por bloque** (`Block.pageOrientation`, control junto al salto de página): «Horizontal» imprime el bloque en páginas carta acostadas (1056 × 816 px) para sus tablas anchas; la vista previa pagina esa corrida aparte (`AutoPaginatedDocumentFlow` parte los items por orientación) y el PDF usa la página con nombre `@page landscape` (`globals.css`). Se guarda en la configuración del bloque.
- **Tipo de bien y tipo de avalúo** (`services/property-kinds.ts`): la carátula ofrece el catálogo completo (casa, departamento, oficina, terreno, edificio, nave industrial, local comercial, bodega, rural, mixto; maquinaria solo al crear) y «Otro…» con un nombre libre, igual el tipo de avalúo (venta, renta, compra, garantía, fiscal, «Otro…»). El guardado los persiste en `IdTipoInmueble`/`IdTipoOperacion` (antes se ignoraban) y el nombre libre en `Propiedad.JCaracteristicas` (`tipoBienOtro`, `tipoAvaluoOtro`); sin migración.
- **Fecha del avalúo** (video 5.2, 3 nov 2026): el calendario no ofrece días anteriores a hoy y `concludeValuation` rechaza con 409 «La fecha del avalúo no puede ser anterior a hoy» (`valuationDateInPast`); los avalúos ya concluidos no cambian.
- **Salto de página:** bloques y apartados tienen tres valores (`pageBreak`): automático, nueva página y continuar (empieza justo donde terminó el anterior; su título no se lleva a la página siguiente). Lo guardado antes con `startOnNewPage` se lee como "nueva página". Una sección empieza en página nueva o continúa la anterior (`pageBreak: "continue"`); en el dictamen las secciones que continúan comparten un solo flujo de páginas (`printableSectionGroups`). La carátula nunca comparte páginas.

## Croquis y mapa de comparables (mapas, etapa 1)

- La sección Croquis y el anexo Mapa de comparables abren con el panel "Ubicación y croquis del inmueble" (`src/features/maps/components/location-panel.tsx`, solo con llave de Google Maps; ver [OPERACION.md](OPERACION.md), sección 7): buscar la dirección de la carátula o arrastrar el pin, mapa limpio, norte (tres símbolos, cuatro esquinas), "Incluir comparables" (los comparables del avalúo con coordenadas, numerados `C-1`… por su referencia en su mercado) y un encuadre por croquis ("Ver encuadre", "Tomar del mapa"). El pin y la configuración se guardan solos en `Propiedad.JCaracteristicas` del inmueble sujeto (`ubicacion`, `croquis`; `src/features/maps/subject-location.ts`).
- "Aplicar al croquis" genera en el servidor la imagen de cada croquis (Maps Static API más los pines y el norte compuestos con sharp) y la guarda como una imagen del avalúo; el editor la coloca en el primer bloque de la sección con ids fijos (`croquis-macrolocalizacion` y `croquis-microlocalizacion` en una fila de dos columnas, `croquis-mapa-comparables` en el anexo; `src/features/maps/croquis-document.ts`), con su pie ("Croquis de macrolocalización"…). Una captura nueva reemplaza la imagen y conserva el pie, el tamaño y el giro que el valuador le haya puesto; se edita, mueve u oculta como cualquier imagen y se guarda con el documento. El dictamen y el PDF la imprimen donde la sección imprime sus imágenes, sin consultar a Google.
- Pendiente para la etapa 2: resaltar vialidades (la demostración lo prototipa con `paths` del mismo constructor de URL, `src/features/maps/static-map.ts`).

## Agregar al informe valuatorio

Cada enfoque (costos, mercado de venta de inmuebles, de terrenos, de rentas, ingresos) tiene un interruptor en la configuración de su sección. Apagado se guarda en `excludedFromReport` de la sección (`services/report-approaches.ts`): el dictamen no imprime la sección (o, en mercado de venta, las páginas de ese mercado y sus fotos del anexo), no toma número, y la conclusión lo trata como "no aplica" (el servidor lo lee del documento guardado; el mercado se toma de inmuebles y si no de terrenos, entre los que siguen incluidos). Guardar un cambio de interruptor recalcula la conclusión.

## Configuración que no se imprime

La carátula abre con "Configuración del avalúo" (separador de miles, margen, barras de título, banda y precisión del cálculo) y cada sección con "Configuración de la sección": paneles de borde punteado con el rótulo "Configuración — no se imprime".

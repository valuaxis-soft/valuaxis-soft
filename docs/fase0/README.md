# Fase 0 · Metodología de cálculo de Valuadores de los Altos

Levantamiento de la metodología valuatoria a partir de los Excel del despacho, recibidos el 23 de septiembre de 2026. Es la base del motor de cálculo del sistema (características 6 a 10 y 19 de COT-2026-001).

**Estado: borrador técnico, pendiente de validar con el perito.** Las decisiones marcadas como *pendiente* dependen de las respuestas en [PREGUNTAS-PERITO.md](PREGUNTAS-PERITO.md).

## Qué se analizó

| Clave | Libro | Uso |
|---|---|---|
| TU | Formato PT-TU, terreno urbano | Plantilla |
| TU_OFICIAL | Formato PT-TU oficial (.xlsm) | Plantilla con candado de licencia; difiere de TU en la dirección del factor de superficie |
| TCH | Formato PT-TCH, terreno urbano con construcción habitacional | Plantilla |
| TR | Formato PT-TR, terreno rural | Plantilla |
| TRC | Formato PT-TRC, rural con construcción | Plantilla |
| MEH | Formato PT-MEH, maquinaria y equipo pesado | Plantilla |
| REAL_ARANDAS | Avalúo de departamentos en Arandas | Caso real basado en TCH, usado para validar |

Los originales no se modificaron. El candado del .xlsm solo controla la licencia: no hace cálculos, no descarga nada y no se ejecutó.

## Validación

Cada enfoque se recalculó en Python a partir de las entradas del Excel y se comparó contra los valores que Excel guardó.

| Bloque | Celdas comparadas | Resultado |
|---|---|---|
| Costos, Arandas | 50 | 50 iguales · valor físico 8,580,000 |
| Costos, plantillas | totales de TU, TCH, TR, TRC, MEH | todos iguales |
| Mercado y homologación | 24 en Arandas, más TU y TU_OFICIAL | todos iguales · valor comparativo 1,528,000 |
| Rentas e ingresos | 150 en cinco libros | todos iguales |
| Cifra en letras | 18 valores en siete libros | 18 iguales |

Conclusión: la metodología está entendida al nivel de celda. El sistema puede reproducir el Excel con exactitud, incluidos sus errores si así se decide.

Para volver a correr la validación, desde esta carpeta:

```bash
python volcar_excel.py ~/Documents/Avaluos     # genera dump/, que no se versiona
python metodologia/validar_costos_arandas.py
python metodologia/validar_costos_plantillas.py
python metodologia/02-mercado_validacion.py
python metodologia/03-rentas-ingresos_validacion.py
python metodologia/tools/verify_cifra.py
```

Requiere `openpyxl`.

## Documentos de detalle

| Documento | Contenido |
|---|---|
| [01-costos.md](metodologia/01-costos.md) | Terreno, construcciones, instalaciones especiales, indirectos, valor físico, MEH |
| [02-mercado-homologacion.md](metodologia/02-mercado-homologacion.md) | Comparables, factores, potencia n, valor adoptado, métodos alternativos de MEH |
| [03-rentas-ingresos.md](metodologia/03-rentas-ingresos.md) | Homologación de rentas, deducciones, tasa, capitalización |
| [04-estructura-conclusion.md](metodologia/04-estructura-conclusion.md) | Campos por hoja, conclusión, cifra en letras, dependencias entre hojas, catálogos |

Cada uno lista las entradas con su celda, las fórmulas en orden de dependencia, los redondeos y los errores del Excel.

## La regla del factor de superficie

Es la discrepancia más importante y afecta a los tres enfoques. La regla correcta es una sola:

> El factor lleva el valor unitario de la **referencia** al **sujeto**: `F_sup = (S_referencia / S_sujeto)^(1/n)`

Un terreno más grande vale menos por metro cuadrado. Si la referencia es más grande que el sujeto, su valor unitario se sube con un factor mayor que 1.

| Enfoque | Referencia | TU, TCH, TR, TRC | TU_OFICIAL |
|---|---|---|---|
| Mercado | Comparable | Correcto | Invertido |
| Ingresos | Comparable de renta | Correcto | Invertido |
| Costos | Lote tipo | **Invertido** | Correcto |

Quien hizo la versión oficial invirtió las tres fórmulas: corrigió costos y rompió mercado e ingresos. Ninguna versión está completa. En el formato habitacional, costos da 1.0455 donde debería dar 0.9565, porque el lote tipo mide 140 m² y el sujeto 160 m².

Hoy el efecto casi no llega al valor final. El valor adoptado de mercado se escribe a mano y en los ejemplos el lote tipo es igual al sujeto. Aun así, el sistema debe aplicar la regla correcta y el perito debe confirmarla.

## Cómo concluye hoy el Excel

- **No pondera enfoques.** El valor concluido es un solo renglón del resumen, redondeado a decenas de miles. Seis libros concluyen con mercado; Arandas concluye con costos.
- **El valor adoptado de mercado es captura libre.** No está ligado al promedio homologado y en tres libros queda fuera del rango homologado.
- **No hay tablas de factores.** Cada factor se teclea como `=1/1.1`. El anexo de homologación es texto descriptivo.
- **La hoja de construcciones no alimenta a costos** en las plantillas: edad, vida útil y superficies se capturan dos veces. Arandas sí las liga y es el modelo a seguir.
- **No hay listas desplegables.** Los catálogos viven en 406 notas de celda; están reconstruidos en `04-estructura-conclusion.md`, sección (g).

## Errores del Excel que cambian el valor

Ordenados por impacto en el dictamen.

1. **TU imprime un valor de ingresos y concluye otro.** La hoja visible muestra 230,800 (opción 1) y la conclusión toma 110,000 (opción 2, filas ocultas). En TU_OFICIAL la cifra en letras dice 231,000.
2. **Factor de superficie invertido**, según la tabla anterior.
3. **MEH aplica la conservación dos veces.** Da 933,000; con una sola aplicación daría 952,000.
4. **Rural: las fracciones II y III del terreno valen 0** por referir la columna equivocada.
5. **Instalaciones especiales:** privativa o común y cantidad están tecleadas en la tabla de valuación, no ligadas a la captura. Una partida común se valúa como privativa y la cantidad es siempre 1.
6. **Factor de edad sin tope:** si la edad supera la vida útil, el valor neto sale negativo.
7. **Cifra en letras con errores ya impresos:** "TREINTA Y TRÉS MIL" en un valor real, "ONCE DE PESOS", y siempre "00/100" aunque haya centavos.
8. **Potencia n:** la moda sugerida omite pares de comparables, puede dar 0 o #N/A, y el valor que se usa siempre es manual.
9. **Datos cruzados en plantillas:** propietario y solicitante invertidos en TRC, un comparable de TRC con la oferta de otro, la Ley Agraria citada en formatos urbanos y unidades mal etiquetadas (ha contra m²).

La lista completa está en la sección de errores de cada documento.

## Decisiones de diseño para el sistema

Propuestas; las que dicen *pendiente* esperan al perito.

- **Motor determinista con trazabilidad.** Cada resultado guarda sus entradas, su fórmula y su redondeo, y se puede seguir hasta el dato de origen.
- **Una captura, muchos usos.** Superficies, edades y construcciones se capturan una vez y los enfoques las leen, como en Arandas.
- **Valor adoptado sugerido y editable.** El sistema propone el promedio homologado; el perito lo puede cambiar con justificación. Se muestra una alerta si queda fuera del rango homologado.
- **Factores con catálogos configurables por despacho**, y la IA propone el valor sin decidirlo, como dice la cotización.
- **Conclusión por selección de enfoque**, con ponderación opcional apagada por defecto.
- **Redondeos configurables por tipo de avalúo** con los valores actuales del Excel como punto de partida. *Pendiente.*
- **Cifra en letras** en modo "corregido" por defecto, con opción "igual al Excel". *Pendiente.*
- **Casos de prueba:** Arandas y las seis plantillas se vuelven pruebas automáticas del motor. Cada fórmula del sistema debe reproducir estos valores o documentar por qué difiere a propósito.

## Derechos sobre las plantillas

Las hojas "Términos y Condiciones" declaran que la plantilla es propiedad de herramientasexcel.com. El cliente es dueño de herramientasexcel.com, confirmado el 23 de septiembre de 2026, así que el sistema puede usar la estructura y los textos de las plantillas.

# Motor de cálculo

`src/features/valuations/engine/` calcula los tres enfoques, la conclusión y la cifra en letras. Es código puro: no lee la base ni la interfaz, recibe datos y devuelve resultados. Cubre las características 6 a 10 y 19 de COT-2026-001.

La metodología viene de los Excel del despacho, levantada en [fase0/](fase0/README.md). El motor reproduce esos libros al centavo; donde el Excel tiene un error, el motor aplica la regla correcta y un perfil permite reproducir el error si hace falta comparar.

## Módulos

| Archivo | Qué calcula |
|---|---|
| `costs.ts` | Enfoque de costos: terreno urbano (lote tipo y factores) o rural (fracciones por hectárea), construcciones, instalaciones especiales, bienes distintos a la tierra, indirectos y valor físico |
| `market.ts` | Homologación de comparables (terrenos, inmuebles o rentas), estadísticos, potencia sugerida, valor adoptado y valor comparativo |
| `income.ts` | Capitalización de rentas: renta homologada, renta bruta, deducciones, tasa por la tabla de calificaciones o capturada, valor |
| `conclusion.ts` | Resumen de valores, conclusión por un enfoque o ponderada, cifra en letras |
| `amount-in-words.ts` | Cifra en letras corregida, con el formato de los dictámenes: `( OCHO MILLONES … PESOS 00/100 M. N.)` |
| `factors.ts` | Factor de edad, factor de superficie y producto de factores en orden de captura |
| `rounding.ts` | `ROUND` de Excel: mitades hacia afuera sobre los dígitos decimales |
| `trace.ts` | Registro de cada cifra con su fórmula y entradas |
| `config.ts` | Configuración, perfiles de cada libro y decisiones pendientes |

## Configuración y perfiles

Los libros difieren en redondeos y en la dirección del factor de superficie. `EXCEL_PROFILES` tiene un perfil por libro (`ARANDAS`, `TCH`, `TU`, `TU_OFICIAL`, `TR`, `TRC`) que lo reproduce exacto. `DEFAULT_ENGINE_CONFIG` es lo que usará el sistema:

- **Factor de superficie** con la regla `(S_referencia / S_sujeto)^(1/n)` en los tres enfoques. Ningún libro la aplica completa.
- **Redondeos** del último caso real (Arandas): valor de mercado a decenas, terreno a centenas, construcciones a decenas de miles, instalaciones a miles, valor físico y conclusión a decenas de miles.
- **Factor de edad** `1 − (edad / vida útil)^1.4`, con mínimo 0. El Excel lo deja negativo cuando la edad supera la vida útil, y la base de datos rechaza deméritos negativos.

`PENDING_DECISIONS` lista lo que espera respuesta del perito, con el número de pregunta de [PREGUNTAS-PERITO.md](fase0/PREGUNTAS-PERITO.md). Cuando conteste, se cambia la configuración y no el código.

## Validación

Las pruebas `tests/valuation-engine-*.test.ts` alimentan al motor con las entradas de los libros y comparan cada cifra con el valor que guardó Excel, con tolerancia relativa de 10⁻¹².

| Caso | Qué se compara |
|---|---|
| Arandas, costos | 38 cifras: terreno, factor de edad, VRN, VNR, las 8 instalaciones, sumas y valor físico 8,580,000 |
| TU, TCH, TR y TRC, costos | Valor físico de cada plantilla. TCH da 3,740,000 con su factor invertido y 3,680,000 con la regla correcta |
| Arandas, mercado | 5 valores homologados, promedio, dispersión, subtotal y valor 1,528,000; potencia sugerida 2 |
| TU contra TU_OFICIAL | El factor invertido cambia todos los homologados; con él, el valor adoptado queda fuera del rango |
| TCH y Arandas, ingresos | Rentas homologadas, deducciones, tasa de la tabla 8.857 %, renta neta y valor 700,902.93 |
| Cifra en letras | Los 15 importes distintos que imprimen los libros; solo cambia "TRÉS" por "TRES" |
| Conclusión | Arandas concluye con costos en 8,580,000 y su cifra en letras |

## Trazabilidad

Cada cifra queda en un `TraceStep` con clave estable (`costos.construcciones.T-1.vnrParcial`), etiqueta, fórmula legible, entradas y redondeo. Así un valor del dictamen se sigue hasta el dato capturado.

## En el editor

Cada sección de cálculo tiene su panel, arriba de sus bloques:

| Sección | Panel | Guarda en |
|---|---|---|
| Enfoque de mercado en venta | Comparables de terrenos o de inmuebles, superficie del sujeto, lote tipo, potencia n, valor adoptado | `ComparableAvaluo`, `FactorHomologacion`, `EnfoqueMercado` |
| Mercado de rentas | Comparables en renta y renta unitaria adoptada | Las mismas, tipo `INMUEBLE_RENTA` |
| Enfoque de costos | Terreno (con el valor adoptado en mercado), construcciones, instalaciones especiales, indirectos | `EnfoqueCosto`, `CostoTerreno`, `ConstruccionAvaluo`, `TipoConstruccionAvaluo`, `CostoConstruccion`, `InstalacionEspecialAvaluo`, `CostoInstalacion`, `CostoIndirecto` |
| Enfoque de ingresos | Superficie rentable, deducciones, tabla de tasa o tasa capturada | `EnfoqueIngreso`, `DeduccionIngreso` |
| Conclusión | Enfoque con el que se concluye o ponderación, justificación | `ResumenValor` |

- **El navegador calcula en vivo** con el mismo motor, a cada tecla. **El servidor recalcula** al guardar y guarda los resultados en las columnas de cada tabla y el rastro en `EjecucionCalculo` y `ResultadoCalculo`, una ejecución vigente por enfoque (`MOTOR.MERCADO.<tipo>`, `MOTOR.COSTOS`, `MOTOR.INGRESOS`, `MOTOR.CONCLUSION`).
- **Los cambios se encadenan en el servidor:** el mercado de terrenos recalcula costos, el de rentas recalcula ingresos, y cada enfoque recalcula la conclusión.
- **Una sola captura:** las construcciones y las instalaciones del panel de costos llenan también las tablas de la sección de construcciones.
- **El dictamen sigue a los cálculos:** lo que guarda el servidor se escribe en el documento como bloques generados (ids con prefijo `motor-`), que el editor muestra de solo lectura y que reemplazan a los bloques de plantilla. La conclusión llena los conceptos de su sección y el valor y la cifra en letras de la carátula, sin tocar el texto del perito. El workspace sincroniza al abrir y después de cada cambio; si nada cambió, el documento queda igual.
- **Los guardados van en fila:** cada panel envía un guardado a la vez con lo último capturado, para que un guardado anterior no pise al más reciente.
- **Concluido y reabrir:** los avalúos concluidos muestran los cálculos de solo lectura y la API rechaza cambios. Reabrir copia comparables, factores y los cuatro enfoques a la nueva versión.

Esquema: la migración 032 agrega las calificaciones de los factores, la potencia n, la superficie base y la justificación del mercado, y permite ejecuciones del motor sin nodo del documento. La 033 guarda el método de conclusión. Falta la configuración de metodología por organización: hoy todos usan `DEFAULT_ENGINE_CONFIG`.

## Diferencias a propósito con el Excel

- Terreno rural: las fracciones II y III usan su propio factor. El Excel toma la columna equivocada y les da valor 0.
- El comparable 5 respeta el lote tipo. El Excel lo compara siempre contra el sujeto.
- El valor adoptado de mercado, si no se captura, es el promedio homologado. El motor avisa si queda fuera del rango.
- La cifra en letras escribe bien los acentos y los centavos.

## Pendiente

- Métodos de ingresos de TU y TR (pregunta 2) y maquinaria MEH (pregunta 3). Sus fórmulas están en `fase0/metodologia/`.
- Indirectos: hoy la base se captura. Falta decidir si se liga al VNR de construcciones (pregunta 11).

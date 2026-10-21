# Motor de cálculo

`src/features/valuations/engine/` calcula los tres enfoques, la conclusión y la cifra en letras. Es código puro: no lee la base ni la interfaz, recibe datos y devuelve resultados. Cubre las características 6 a 10 y 19 de COT-2026-001.

La metodología viene de los Excel del despacho, levantada en [fase0/](fase0/README.md). El motor reproduce esos libros al centavo; donde el Excel tiene un error, el motor aplica la regla correcta y un perfil permite reproducir el error si hace falta comparar.

## Módulos

| Archivo | Qué calcula |
|---|---|
| `costs.ts` | Enfoque de costos: terreno urbano (lote tipo y factores) o rural (fracciones por hectárea), construcciones, instalaciones especiales, bienes distintos a la tierra, indirectos y valor físico |
| `market.ts` | Homologación de comparables (terrenos, inmuebles o rentas), estadísticos, potencia sugerida, valor adoptado y valor comparativo |
| `income.ts` | Capitalización de rentas en tres métodos, como los libros: **tabla** (TCH: deducciones y tasa por la tabla de 7 criterios o capturada), **anualidad** (TU: vacíos por días, deducciones, opción 1 con la tasa base mercado u opción 2 con el valor presente de la renta a TIIE − inflación + 1/VUR) y **mercado** (TR: tasa de cada comparable de renta contra su precio de venta; valor = ingreso neto del sujeto / tasa promedio) |
| `machinery.ts` | Maquinaria y equipo (MEH): costos del bien (cotización × tipo de cambio × (1 + gastos), edad `1 − (E/VUT)^1.4` × tabla de conservación 1–10, FCo, FMt y obsolescencias) más aditamentos con edad lineal; mercado con la mediana de las ofertas depreciadas, cada una con su vida útil o la común. Los redondeos los elige el valuador; de inicio, los del libro: valor físico a miles y valor de mercado a decenas de miles |
| `conclusion.ts` | Resumen de valores, conclusión por un enfoque o ponderada, cifra en letras |
| `amount-in-words.ts` | Cifra en letras corregida, con el formato de los dictámenes: `( OCHO MILLONES … PESOS 00/100 M. N.)` |
| `factors.ts` | Factor de edad, factor de superficie y producto de factores en orden de captura |
| `rounding.ts` | `ROUND` de Excel: mitades hacia afuera sobre los dígitos decimales |
| `trace.ts` | Registro de cada cifra con su fórmula y entradas |
| `config.ts` | Configuración, perfiles de cada libro y decisiones pendientes |

## Configuración y perfiles

Los libros difieren en redondeos y en la dirección del factor de superficie. `EXCEL_PROFILES` tiene un perfil por libro (`ARANDAS`, `TCH`, `TU`, `TU_OFICIAL`, `TR`, `TRC`) que lo reproduce exacto. `DEFAULT_ENGINE_CONFIG` es lo que usa el sistema, según las [respuestas del perito](fase0/RESPUESTAS-PERITO.md):

- **Factor de superficie.** En mercado y rentas el comparable se lleva a la base, `(base / comparable)^(1/n)`: la base es el lote tipo (homologación indirecta) o el sujeto (directa). El valor de mercado es superficie del sujeto × valor unitario adoptado (+ monto adicional), como el libro (T53 = T52 × T50): **el sujeto no se homologa en mercado** (aclaración del 9 oct 2026, «el detallito»). Con lote tipo, el sujeto se homologa contra él solo en el bloque A) Terreno del enfoque de costos, con la tabla completa (Neg., Ubic., Sup. = `(lote tipo / sujeto)^(1/n)`, Serv., Clas., Top. → FRe → valor unitario neto → valor del terreno); sin lote tipo esa tabla queda en 1 en superficie. El lote tipo del terreno sale del enfoque de mercado (`market.baseArea`) salvo que el valuador escriba otro en el panel de costos. Hasta el motor 2026.09 el valor de mercado también llevaba `(lote tipo / sujeto)^(1/n)` (`indirectSubjectFactor`), lo que contaba dos veces el ajuste; ya no existe. El valuador puede escribir otro factor en cada comparable. `n` es 3, 6, 9 o 12.
- **Valor adoptado.** Lo captura el valuador; promedio y mediana son referencia. Fuera del ±30 % de ambos el panel avisa (posible error de captura, como 130,000 por 13,000) pero se guarda: desde las observaciones del 13–14 oct 2026 el rango es un aviso, no un candado, porque el campo en rojo no le dejaba borrar ni reescribir el valor y el servicio no tenía forma de guardarlo con justificación. `adoptedOutsideLimits` lo marca. Con «Homologación de acuerdo a: Sujeto» el lote tipo capturado se conserva pero ni el mercado ni el terreno de costos lo usan (`NSuperficieBase` queda vacío).
- **Factor de edad** `1 − (edad / vida útil)^1.4`; si la edad alcanza o rebasa la vida útil, la vida útil pasa a edad + 1.
- **Redondeos.** Los elige el valuador por avalúo (terreno, construcciones, instalaciones, valor físico, valor de mercado y conclusión), o ninguno. Mientras no elija se usan los del último caso real (Arandas).
- **Indirectos.** Sobre el valor de construcciones e instalaciones, salvo que se capture otra base.
- **Factores de homologación.** El sistema no propone valores ni rangos; cada despacho puede guardar su propio catálogo.

Los campos numéricos de cálculo aceptan fórmulas que empiezan con `=` (`calculation/free-formula.ts`): + − × ÷ ^ %, paréntesis, `RAIZ`, `POTENCIA` y `REDONDEAR`, con la precedencia de Excel.

`PENDING_DECISIONS` lista lo que aún espera respuesta del perito; está vacía desde el 9 de octubre de 2026.

## Validación

Las pruebas `tests/valuation-engine-*.test.ts` alimentan al motor con las entradas de los libros y comparan cada cifra con el valor que guardó Excel, con tolerancia relativa de 10⁻¹².

| Caso | Qué se compara |
|---|---|
| Arandas, costos | 38 cifras: terreno, factor de edad, VRN, VNR, las 8 instalaciones, sumas y valor físico 8,580,000 |
| TU, TCH, TR y TRC, costos | Valor físico de cada plantilla. TCH da 3,740,000 con su factor invertido y 3,680,000 con la regla correcta |
| Arandas, mercado | 5 valores homologados, promedio, dispersión, subtotal y valor 1,528,000; potencia sugerida 2 |
| TU contra TU_OFICIAL | El factor invertido cambia todos los homologados; con él, el valor adoptado queda fuera del rango |
| TCH y Arandas, ingresos | Rentas homologadas, deducciones, tasa de la tabla 8.857 %, renta neta y valor 700,902.93 |
| TU, ingresos | Vacíos 8.33 %, renta neta 1,437.33, opción 1 = 230,800.37 y opción 2 = 110,689.59 |
| TR, ingresos | Tasa de mercado 0.1821 %, valor 5,090,678.68 |
| MEH, costos | Bien 740,788.90, aditamentos 192,389.25, valor físico 933,000; con la conservación una sola vez, 952,000 |
| MEH, mercado | 5 ofertas depreciadas, promedio, mediana 978,738.73 y valor 980,000 |
| Cifra en letras | Los 15 importes distintos que imprimen los libros; solo cambia "TRÉS" por "TRES" |
| Conclusión | Arandas concluye con costos en 8,580,000 y su cifra en letras |

## Trazabilidad

Cada cifra queda en un `TraceStep` con clave estable (`costos.construcciones.T-1.vnrParcial`), etiqueta, fórmula legible, entradas y redondeo. Así un valor del dictamen se sigue hasta el dato capturado.

La **memoria de cálculo** (`/avaluos/<uuid>/memoria-calculo`, `memory/calculation-memory.ts`) lo imprime: el servidor guarda solo la clave y el valor de cada paso, así que la memoria vuelve a correr el motor con lo que el avalúo tiene guardado (lo mismo que hacen los paneles) y compara cada paso con lo guardado; si un paso no coincide, o lo guardado es de otra versión del motor, lo dice. Las fórmulas escritas en los campos de los paneles (`=1345*235`) se guardan ya calculadas, salvo los factores capturados como calificaciones (`=sujeto/comparable`), que la memoria escribe como fórmula.

## En el editor

Cada sección de cálculo tiene su panel, arriba de sus bloques:

| Sección | Panel | Guarda en |
|---|---|---|
| Enfoque de mercado en venta | Comparables de terrenos o de inmuebles, superficie del sujeto, lote tipo, potencia n, valor adoptado | `ComparableAvaluo`, `FactorHomologacion`, `EnfoqueMercado` |
| Mercado de rentas | Comparables en renta y renta unitaria adoptada | Las mismas, tipo `INMUEBLE_RENTA` |
| Enfoque de costos | Terreno (con el valor adoptado en mercado), construcciones, instalaciones especiales, indirectos | `EnfoqueCosto`, `CostoTerreno`, `ConstruccionAvaluo`, `TipoConstruccionAvaluo`, `CostoConstruccion`, `InstalacionEspecialAvaluo`, `CostoInstalacion`, `CostoIndirecto` |
| Enfoque de ingresos | Método; superficie rentable, deducciones y tabla de tasa o tasa capturada (TCH); vacíos, TIIE, inflación, vida útil remanente y opción (TU); precio de venta de cada comparable de renta, negociación y vacíos (TR) | `EnfoqueIngreso` (el método y sus datos en `JConfiguracion`), `DeduccionIngreso` (en TR, gastos de operación) |
| Conclusión | Enfoque con el que se concluye o ponderación, justificación | `ResumenValor` |
| Enfoque de costos, en un avalúo de maquinaria y equipo | Identificación del bien, cotización y tipo de cambio, gastos, edad, vida útil, calificación de conservación y factores, aditamentos, redondeo | `EnfoqueMaquinaria.JCostos` |
| Enfoque de mercado en venta, en un avalúo de maquinaria y equipo | Nivel de oferta, vida útil, ofertas con su contacto, gastos, edad, calificación y factores, redondeo | `EnfoqueMaquinaria.JMercado` |

- **El navegador calcula en vivo** con el mismo motor, a cada tecla. **El servidor recalcula** al guardar y guarda los resultados en las columnas de cada tabla y el rastro en `EjecucionCalculo` y `ResultadoCalculo`, una ejecución vigente por enfoque (`MOTOR.MERCADO.<tipo>`, `MOTOR.COSTOS`, `MOTOR.INGRESOS`, `MOTOR.CONCLUSION`).
- **Maquinaria y equipo.** Un avalúo cuyo tipo de bien es "Maquinaria y equipo" (`MAQUINARIA_EQUIPO`, se elige al crearlo) muestra en costos y en mercado los paneles del formato PT-MEH en lugar de los de inmuebles, sus páginas del dictamen siguen las hojas «IV. ENF. COSTOS» y «V. ENF. MERCADO» del libro (bloques `motor-maquinaria-costos` y `motor-maquinaria-mercado`), y la conclusión toma sus dos valores (`MOTOR.MAQUINARIA.COSTOS`, `MOTOR.MAQUINARIA.MERCADO`); no tiene enfoque de ingresos. En el resumen cada enfoque se redondea como la conclusión, igual que el libro (933,000 en la hoja de costos, 930,000 en el resumen).
- **Los cambios se encadenan en el servidor:** el mercado de terrenos recalcula costos, el de rentas recalcula ingresos, y cada enfoque recalcula la conclusión.
- **Una sola captura (pregunta 10, 9 oct 2026):** los tipos de construcción (referencia, descripción, clasificación, calidad, superficie, edad y vida útil total; la remanente se calcula) se capturan una vez en la sección de construcciones (`ConstructionTypesPanel`, `GET/PUT /api/avaluos/[id]/construcciones`, `TipoConstruccionAvaluo`). En el panel de costos cada construcción elige un tipo de esa lista y solo captura sus columnas (factor de conservación, grado de terminación, indiviso, VRN unitario; `CostoConstruccion`). Un tipo que se quita se lleva su renglón de costos; cambiar la edad en la sección recalcula costos y conclusión. Los avalúos guardados antes ya tenían sus tipos en `TipoConstruccionAvaluo` (el panel de costos los escribía ahí), así que no hay migración de datos; un cliente que todavía mande los datos del tipo con los costos crea el tipo si falta, y si existe se ignoran (la sección es la fuente). Las instalaciones especiales siguen capturándose en costos y llenan su tabla de la sección de construcciones.
- **El dictamen sigue a los cálculos:** lo que guarda el servidor se escribe en el documento como bloques generados (ids con prefijo `motor-`), que el editor muestra de solo lectura y que reemplazan a los bloques de plantilla. La conclusión llena los conceptos de su sección y el valor y la cifra en letras de la carátula, sin tocar el texto del perito. El workspace sincroniza al abrir y después de cada cambio; si nada cambió, el documento queda igual.
- **Los guardados van en fila:** cada panel envía un guardado a la vez con lo último capturado, para que un guardado anterior no pise al más reciente.
- **Concluido y reabrir:** los avalúos concluidos muestran los cálculos de solo lectura y la API rechaza cambios. Reabrir copia comparables, factores y los cuatro enfoques a la nueva versión.

Esquema: la migración 032 agrega las calificaciones de los factores, la potencia n, la superficie base y la justificación del mercado, y permite ejecuciones del motor sin nodo del documento. La 033 guarda el método de conclusión. La 039 agrega el tipo de bien "Maquinaria y equipo" y la tabla `devpware_enfoques_maquinaria`. Falta la configuración de metodología por organización: hoy todos usan `DEFAULT_ENGINE_CONFIG`.

`ENGINE_VERSION` es `motor-2026.10.1` desde el 9 oct 2026: los avalúos con lote tipo en mercado cambian de valor de mercado al recalcularse (ya sin el factor del sujeto) y, si no habían capturado lote tipo en costos, su terreno pasa a homologarse contra el lote tipo del mercado. Se recalculan al abrir o guardar.

## Maquinaria: conservación (pregunta 3, decidida el 9 oct 2026)

La conservación entra dos veces, exactamente como el libro: dentro del factor de edad `(1 − (E/VUT)^1.4) · Fcal` y otra vez como FCo en el factor resultante (`MACHINERY_CONSERVATION_TWICE = true`; el ejemplo del libro da 933,000). El FCo del bien sale de la tabla de calificaciones (`MACHINERY_CONSERVATION`: 10 → 1.00 … 8 → 0.975 … 2 → 0.1, 1 → 0): el panel lo llena al elegir la calificación y lo deja editable, con fórmula si hace falta, porque el criterio es del valuador. Cada avalúo guarda `conservationTwice` con el que se capturó; con `false` el panel y el dictamen no muestran el FCo del bien.

## Diferencias a propósito con el Excel

- Terreno rural: las fracciones II y III usan su propio factor. El Excel toma la columna equivocada y les da valor 0.
- El comparable 5 respeta el lote tipo. El Excel lo compara siempre contra el sujeto.
- El valor adoptado de mercado, si no se captura, es el promedio homologado. El motor avisa si queda fuera del rango.
- La cifra en letras escribe bien los acentos y los centavos.

## Pendiente

- Maquinaria MEH: faltan los métodos alternativos (costo-capacidad, tercer renglón de la conclusión del libro), la tabla libre de características técnicas, las fotografías de sujeto y comparables en la hoja de mercado, la inspección física que da la calificación (se captura la calificación resultante) y los textos de carátula propios de maquinaria.
- En TR, como los libros, el ingreso de cada comparable sale de su renta homologada (03 §9.5); se revisa con el perito.
- Regresión lineal, en un apartado propio.

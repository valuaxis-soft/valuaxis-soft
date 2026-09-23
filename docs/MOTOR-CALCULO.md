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
- **Factor de edad** `1 − (edad / vida útil)^1.4`, sin mínimo, como el Excel.

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

## Dónde se guarda

El esquema de Prisma ya tiene las tablas, por versión del avalúo, y los catálogos cargados. El motor no escribe; la capa de persistencia de la Fase 1 lee de estas tablas, llama al motor y guarda resultados y rastro.

| Dato | Tabla |
|---|---|
| Construcciones: superficie, edad, vida útil, grado, indiviso | `ConstruccionAvaluo`, `TipoConstruccionAvaluo` (se capturan una vez; costos las lee, como en Arandas) |
| Instalaciones especiales, privativa o común | `InstalacionEspecialAvaluo` (`IdTipoParticipacion`) |
| Costos: VRN unitario y factores, resultados | `EnfoqueCosto`, `CostoTerreno`, `CostoConstruccion`, `CostoInstalacion`, `CostoIndirecto` |
| Comparables con fotos y contacto | `Propiedad`, `DireccionPropiedad`, `PublicacionPropiedad` (contacto, teléfono, correo, URL), `ComparableAvaluo` (precio, superficies, fotos en `JImagenesSnapshot`) |
| Factores de homologación | `FactorHomologacion` por comparable: tipo (catálogo con 15 tipos), valor, justificación, origen (`USUARIO`, `CALCULO`, `IA`) y orden |
| Mercado, rentas e ingresos | `EnfoqueMercado` (por tipo de comparable), `EnfoqueRenta`, `EnfoqueIngreso`, `DeduccionIngreso` |
| Resumen y conclusión | `ResumenValor`, `ConclusionAvaluo` |
| Rastro de cada cálculo | `EjecucionCalculo` (entradas, salidas, redondeo, versión, sobrescritura con motivo) y `ResultadoCalculo` (una fila por `TraceStep`). Claves de `CalculoPermitido`: `VALOR_NETO_REPOSICION`, `VALOR_HOMOLOGADO`, `CAPITALIZACION`, `VALOR_FINAL` |

### Cambios de esquema para la Fase 1

Se hacen junto con las pantallas de captura:

1. `FactorHomologacion`: columnas para la calificación del sujeto y la del comparable, que hoy el Excel escribe como `=1/1.15`. El factor de superficie se guarda como una fila más, de tipo `SUPERFICIE` y origen `CALCULO`, en su posición.
2. `EnfoqueMercado` y `EnfoqueRenta`: potencia n, superficie base (lote tipo o sujeto) y escala por hectárea. Hoy caben en `JConfiguracion`; conviene pasarlos a columnas.
3. Configuración de metodología por organización: perfil base y ajustes (redondeos, factor de edad, dirección del factor de superficie). No existe tabla para esto.

## Diferencias a propósito con el Excel

- Terreno rural: las fracciones II y III usan su propio factor. El Excel toma la columna equivocada y les da valor 0.
- El comparable 5 respeta el lote tipo. El Excel lo compara siempre contra el sujeto.
- El valor adoptado de mercado, si no se captura, es el promedio homologado. El motor avisa si queda fuera del rango.
- La cifra en letras escribe bien los acentos y los centavos.

## Pendiente

- Métodos de ingresos de TU y TR (pregunta 2) y maquinaria MEH (pregunta 3). Sus fórmulas están en `fase0/metodologia/`.
- Indirectos: hoy la base se captura. Falta decidir si se liga al VNR de construcciones (pregunta 11).

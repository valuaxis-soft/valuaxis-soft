# Respuestas del perito a las preguntas de metodología

Ing. Álvaro Gutiérrez, 30 de septiembre de 2026 (PDF y audios por WhatsApp). Contesta [PREGUNTAS-PERITO.md](PREGUNTAS-PERITO.md).

**Principio.** El sistema calcula y protege de errores de captura; no recomienda ni limita el criterio del valuador, que por ley no debe estar influenciado y justifica lo que decide.

| # | Respuesta | En el sistema |
|---|---|---|
| 1 | Factor de superficie. Con lote tipo, homologación indirecta: comparables con `(lote tipo / comparable)^(1/n)` y sujeto con `(lote tipo / sujeto)^(1/n)`. Sin lote tipo, directa: `(sujeto / comparable)^(1/n)`. O un valor o fórmula libre | `surfaceOrientation` e `indirectSubjectFactor` en `engine/config.ts`; factor capturado por comparable |
| 2 | La celda oculta de TU era un error; el valuador elige con qué enfoque concluir | Anualidad parte de la opción 1; la conclusión ya dejaba elegir |
| 3 | Edad y conservación son factores distintos y se usan los dos. No entendió "dos veces" | **Pendiente**: se le aclaró. `PENDING_DECISIONS` |
| 4 | Promedio y mediana solo como referencia; el valuador captura su valor, con candado de ±30 % | `adoptedValueLimits`; el servicio rechaza fuera del rango |
| 5 | Si la edad rebasa la vida útil, la vida útil pasa a edad + 1 | `ageFactor.extendUsefulLife` |
| 6 | Concluir con un enfoque o ponderar con porcentajes libres | Sin cambio |
| 7 | No recomendar ni limitar factores: es el criterio del valuador | Catálogo vacío por omisión, sin rangos; justificación por factor |
| 8 | Potencia n: 3, 6, 9 o 12, a elección | `SURFACE_POWERS` |
| 9 | Vidas útiles libres; las tablas son de paga | Sin cambio |
| 10 | No entendió la pregunta | **Pendiente**: se le aclaró. Hoy se captura una vez |
| 11 | Indirectos casi nunca; sobre el valor total de construcciones | Base por omisión: construcciones + instalaciones; no aparecen si no se usan |
| 12 | m² o hectáreas, decide el valuador | Sin cambio |
| 13 | Cifra en letras tal cual, con centavos | Sin cambio |
| 14 | Folio libre; vigencia en meses, máximo 12 | `IMesesVigencia` (migración 037) |
| 15 | Membrete libre; las firmas que hagan falta, cada una con nombre y cédula | `JFirmas` (migración 037); la cédula se exige al concluir |
| 16 | Textos legales opcionales y libres | Sin cambio |
| + | Redondeo a criterio del valuador: cuántos dígitos, o ninguno | Redondeo por enfoque y de la conclusión |
| + | Cálculos libres tipo Excel: `=` con + − × ÷, raíz y potencia | `calculation/free-formula.ts`, en todos los campos numéricos de cálculo |
| + | Regresión lineal solo en un apartado específico | Pendiente |

Interpretaciones que conviene confirmarle: el candado del ±30 % va del 70 % del menor al 130 % del mayor entre promedio y mediana; la base de indirectos incluye instalaciones especiales; `^` sigue la precedencia de Excel (`=(1345*235)^1/6` divide entre 6; la raíz sexta es `^(1/6)` o `RAIZ(x; 6)`).

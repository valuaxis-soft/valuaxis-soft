# 03 · Mercado de rentas y enfoque de ingresos (capitalización de rentas)

Fuente: volcado en `scratchpad/dump/<FORMATO>/…` más la lectura directa de los originales (comentarios de celda, filas ocultas y estado de las hojas) con openpyxl. Los originales no se modificaron.
Script de validación: `metodologia/03-rentas-ingresos_validacion.py`. Recalcula 150 celdas y da **0 diferencias** contra la caché.

## 0. Mapa: qué formato tiene qué

| Formato | Hojas del área | Estado | ¿Alimenta la conclusión? | Método de capitalización |
|---|---|---|---|---|
| **TCH** | `VIII. MERCADO RENTAS` + `IX. ENF. INGRESOS` | visibles | Sí: `X. CONCLUSION!R17 = ROUND('IX. ENF. INGRESOS'!I65,-4)` (solo informativo; el valor concluido `L54 = R15` es el de mercado) | **A**: renta bruta × (1 − Σ deducciones) × 12 / tasa (tasa por tabla de 7 criterios, capturada a mano) |
| **REAL_ARANDAS** (basado en TCH) | las mismas 2 hojas | **ocultas (hidden)** | **No.** `VIII. CONCLUSION!R17` = texto "NO APLICA"; el valor concluido `L60 = R13` (costos) | igual a A, pero con los **datos de ejemplo de la plantilla TCH sin tocar** |
| **TU** | todo dentro de `VII. ENF. INGRESOS` | visible (filas 74 y 84‑92 **ocultas**) | Sí: `R17 = ROUND('VII. ENF. INGRESOS'!K92,-4)` (Opción 2, ¡en filas ocultas!) | **B**: vacíos por días + deducciones; Opción 1 (tasa "de mercado") y Opción 2 (anualidad con TIIE − inflación + 1/VUR) |
| **TU_OFICIAL** (.xlsm) | `VII. ENF. INGRESOS` | **veryHidden** | Sí: igual que TU (`K92`); además `CIFRAENLETRAS!F46 = K82` (Opción 1) | B, con el **factor de superficie invertido** y `K82` redondeado |
| **TR** | todo dentro de `VII. ENF. INGRESOS` | visible | Sí: `R17 = ROUND('VII. ENF. INGRESOS'!K93,-2)` | **C**: tasa de mercado sacada de pares venta/renta de los mismos comparables |
| **TRC** | no existe | — | `R17` = texto "NO APLICA" | — |
| **MEH** | no existe (solo el texto de `ANEXO 2` "3. FACTORES UTILIZADOS EN COMPARABLES DE INMUEBLES EN RENTA", con `#REF!`) | — | No | — |

---

## 1. Parte común: homologación de rentas (TCH, Arandas, TU, TU_OFICIAL y TR)

La tabla es la misma en todos los formatos: filas 38‑42 (comparables 1‑5) y columnas iguales. Solo cambian la celda de la superficie del sujeto y, en TR, la conversión a hectáreas.

### 1.a Entradas del perito (captura de comparables)

| Dato | Unidad | TCH / Arandas | TU / TU_OFICIAL | TR |
|---|---|---|---|---|
| Nivel de oferta (marca "( X )") | texto | E14/K14/O14/E15/K15/O15 | igual | igual |
| Ficha del comparable (frentes, uso de suelo, forma, zona, frente, fondo…) | texto/m | AE21:AO25 | AD21:AN25 | AD21:AN25 (uso, clasif. agrícola, forma, fuente hídrica, vías, ubicación) |
| Superficie rentable del comparable | m² | **AK21:AK25** | **AJ21:AJ25** | **AJ21:AJ25** (dice "Ha", pero son m²) |
| Oferta de renta | $/mes | **AN21:AN25** | **AM21:AM25** | AM21:AM25; **S28/S29 capturadas a mano** (7,500) en lugar de la fórmula |
| Contacto, teléfono, conservación/fecha | texto | C28:M32 | C28:M32 | C28:M32 |
| Factores de homologación por comparable: Neg. (L), Zona (M), Ubic. (O), Cal./Serv. (P), Top. (Q) | adim. | L38:Q42 (se capturan como `=1/0.95`, etc.) | igual | igual |
| Potencia *n* del factor de superficie | entero | **Z37** (plantilla = 3) | **Z37** (= 6) | **Z37** (= 6) |
| Superficie rentable del sujeto | m² | H45 = `'lll. INF TERRENO'!T40` (TCH) / `!T41` (Arandas) = sup. de construcción | I44 = `'lll. INF TERRENO'!$H$42` (sup. total de terreno) | I44 = `'lll. INF TERRENO'!$H$41` (dice "ha", es = T41 en m²) |
| **Valor homologado a utilizar** (criterio del perito) | $/m²/mes (TR: $/Ha/año) | **T46** (= 30) | **T48** (= 14) | **T48** (= 16,500) |
| Monto adicional | $ | T50 | — | — |

Comentarios de celda del Excel que hay que llevar a la app como ayudas:
- L17/H34: "ES RECOMENDABLE QUE LOS COMPARABLES SE ORDENEN DE MAYOR A MENOR SUPERFICIE".
- AC36: dispersión "RECOMENDABLE MENOR A 1.25".
- Z37: "Lo recomendable puede ser lo que arroje en la fórmula del cálculo del cociente, pero de acuerdo a su mejor criterio…".
- T46/T48: "Puedes escribir el valor a considerar según tu mejor criterio".

### 1.b Cálculos en orden de dependencia (fila r = 38..42, comparable k = r − 37)

| # | Concepto | Fórmula legible | Excel (TCH) | Excel (TU/TR) |
|---|---|---|---|---|
| 1 | Sup. del comparable | Pₖ = Sup_rentable_k (si hay contacto) | `P28 =IF(C28<>0,AK21,"")` | `P28 =IF(AJ21<>0,AJ21,"")` |
| 2 | Oferta | Sₖ = Oferta_k | `S28 =IF(C28<>0,AN21,"")` | `S28 =IF(AM21<>0,AM21,"")` |
| 3 | Unitario de oferta | Uₖ = Sₖ / Pₖ (TR: × 10,000 → $/Ha) | `U28 =IFERROR(S28/P28,"")` | TR: `=IFERROR(S28/P28*10000,"")` |
| 4 | Copia a la tabla | Cᵣ = Sₖ ; Fᵣ = Pₖ ; Iᵣ = Cᵣ/Fᵣ (TR ×10,000) | `C38 =IF(S28<>0,S28,"")`, `F38 =IF(P28<>0,P28,"")`, `I38 =IFERROR(C38/F38,"")` | igual; TR `I38 =C38/F38*10000` |
| 5 | **Factor de superficie** | **Z = (F_comp / S_sujeto)^(1/n)** | `Z38 =IFERROR((F38/$H$45)^(1/$Z$37),"")` | TU/TR `=(F38/$I$44)^(1/$Z$37)`; **TU_OFICIAL `=($I$44/F38)^(1/$Z$37)`** |
| 6 | Sup. en la tabla | Nᵣ = Zᵣ | `N38 =Z38` | igual |
| 7 | Factor resultante | FReᵣ = Neg·Zona·Sup·Ubic·Cal·Top | `R38 =IF(L38*M38*N38*O38*P38*Q38<>0, L38*…*Q38," ")` | igual |
| 8 | Unitario homologado | Tᵣ = FReᵣ · Iᵣ | `T38 =IFERROR(R38*I38,"")` | igual |
| 9 | Dispersión | máx(T)/mín(T) | `AC37 =IF(T42<>0,MAX(T38:W42)/MIN(T38:W42),MAX(T38:W41)/MIN(T38:W41))` | igual |
| 10 | Promedio homologado | T̄ = promedio(T) | `T44 =AVERAGE(T38:W42)` | igual |
| 11 | Estadísticos | máx, mín, rango | TCH: `T45 =T39` ("valor más parecido", fijo al comp. 2) | TU/TR: `T45 =MAX`, `T46 =MIN`, `T47 =T45-T46` |
| 12 | **Valor a utilizar** | V_u = **captura manual** (no está ligado a T̄) | `T46` = 30 | `T48` = 14 / 16,500 |
| 13 | Renta de mercado del sujeto (solo TCH) | S_suj · V_u + adicional | `T48 =H45`, `T49 =T48*T46`, `T51 =T49+T50` (**no la usa nadie**) | — |

**Calibración auxiliar de *n*** (columnas AE:AN; es informativa y no alimenta Z37):
- `AF = Fᵣ/Fᵣ₊₁`, `AG = Iᵣ/Iᵣ₊₁`, `AJ = LOG10(AG)`, `AK = LOG10(AF)`, `AL = AJ/AK` (elasticidad).
- `AM = ROUND(1/AL,0)`, `AN = ABS(AM)`.
- Moda: TCH `AM42 =MODE(AN38:AN41)`, TU/TR `AN42 =_xlfn.MODE.SNGL(AN38:AN41)`.
- `AM44` = 3 es **texto fijo** ("coeficiente recomendable"), no una fórmula.

---

## 2. Método A: TCH y REAL_ARANDAS (`IX. ENF. INGRESOS`)

### 2.a Entradas
| Dato | Unidad | Celda | Valor en la plantilla |
|---|---|---|---|
| Descripción del tipo T‑1 / T‑2 | texto | C15, C16 | "Casa Habitación de 2 niveles de 250 m²" |
| Superficie rentable por tipo | m² | **N15, N16** (**captura fija**, no ligada a H45) | 250 |
| Valor unitario T‑2 | $/m²/mes | Q16 | vacío |
| Deducciones (%) | fracción | F20 Vacíos, F21 Predial, F22 ISR, N20 Mantenimiento, N21 Administración, N22 Seguros, V20 Energía eléctrica, V21 Agua, V22 Depreciación fiscal | 0.10, 0.04, 0.04, 0.06, 0.03, 0.03, 0.01, 0, 0 |
| Tasas de la tabla | fracción | H29, K29, M29, O29, R29, U29 | 0.07, 0.08, 0.09, 0.10, 0.11, 0.12 |
| Calificación por criterio (un "1" por fila) | 0/1 | filas 31, 33, 35, 37, 40, 43, 45 en columnas H/K/M/O/R/U | K31, O33, K35, M37, M40, H43, R45 |
| Tasa obtenida de mercado / ponderada | fracción | J54, J55 | vacías (sin cálculo) |
| **Tasa aplicada** | fracción | **J56** (captura manual) | 0.0886 |

Comentario B51: "Podrás considerar la Tasa que de acuerdo a tu criterio sea la mejor aplicable, así como añadir en esta pestaña el desarrollo de la tasa que desees".

### 2.b Tabla de construcción de la tasa (constantes)

| Criterio (fila) | H = 7% | K = 8% | M = 9% | O = 10% | R = 11% | U = 12% |
|---|---|---|---|---|---|---|
| Edad (años) (30/31) | 0‑5 | 5‑20 | 20‑40 | 40‑50 | 50‑60 | más de 60 |
| Vida útil remanente (32/33) | más de 60 | 50‑60 | 40‑50 | 20‑40 | 5‑20 | terminada |
| Estado de conservación (34/35) | nueva | muy bueno | bueno | regular | malo | ruinoso |
| Proyecto (36/37) | muy bueno | bueno | adecuado | regular | deficiente | malo |
| Relación terreno/construcción (38‑39/40) | const>terr, mayor 3‑1 | const>terr, hasta 3‑1 | const>terr, hasta 2‑1 | 1‑1 | terr>const, hasta 3‑1 | terr>const, mayor 3‑1 |
| Uso del inmueble (41‑42/43) | casa unif. | edif. prod. hab‑com | dpto/casa condom. | ofna/local condom. | ofna/local unif. | bodega/industria |
| Clasificación de zona (44/45) | lujo | 1er orden | 2do orden | 3er orden | prol. serv. com. | prol. serv. inc. |

### 2.c Cálculos (en orden)
| # | Concepto | Fórmula legible | Excel |
|---|---|---|---|
| 1 | Unitario de renta | Q15 = V_u de mercado de rentas | `Q15 ='VIII. MERCADO RENTAS'!T46` |
| 2 | Renta mensual por tipo | Rᵢ = Nᵢ · Qᵢ | `T15 =N15*Q15`, `T16 =N16*Q16` |
| 3 | **Renta bruta mensual** | RB = Σ Rᵢ | `T17 =SUM(T15:W16)` ; `N17 =SUM(N15:P16)` |
| 4 | **Total de deducciones** | D = Σ de los 9 porcentajes (**vacíos incluidos en la suma**) | `K24 =F20+F21+F22+N20+N21+N22+V20+V21+V22` |
| 5 | Suma de calificaciones por columna | cⱼ = Σ calificaciones en la columna j | `H47 =SUM(H30:J45)`, `K47 =SUM(K30:L45)`, `M47 =SUM(M30:N45)`, `O47 =SUM(O30:Q45)`, `R47 =SUM(R30:T45)`, `U47 =SUM(U30:W45)` |
| 6 | Peso de capitalización | wⱼ = tⱼ / 7 · 100 | `H48 =H29/7*100` … `U48 =U29/7*100` |
| 7 | Tasa parcial | pⱼ = cⱼ · wⱼ | `H49 =H47*H48` … |
| 8 | **Tasa resultante** | t_res = Σ cⱼ·tⱼ / 7 (promedio de los 7 criterios) | `U50 =SUM(H49:W49)/100` ; `J53 =U50` |
| 9 | Tasa aplicada | t = J56 (manual; en la plantilla es t_res redondeada a 4 decimales a mano) | `I64 =J56` |
| 10 | **Renta neta mensual** | RN = RB − RB·D = RB(1 − D) | `I60 =T17`, `I61 =K24`, `I62 =I60-(I60*I61)` |
| 11 | Renta neta anual | RNA = 12 · RN | `I63 =I62*12` |
| 12 | **Valor por capitalización** | V = RNA / t | `I65 =I63/I64` |
| 13 | Conclusión | ROUND(V, −4) | `X. CONCLUSION!R17 =ROUND('IX. ENF. INGRESOS'!I65,-4)` |

Valores de la plantilla TCH: RB 7,500; D 0.31; RN 5,175; RNA 62,100; t_res 0.088571; t 0.0886; V 700,902.93 → **700,000**.

### 2.d REAL_ARANDAS: ¿las hojas ocultas tienen datos y alimentan la conclusión?
- **Sí tienen datos, pero son los datos de ejemplo de la plantilla TCH sin modificar.** Contienen los mismos 4 comparables (Sr. Hugo Méndez, Tu casa inmob., Altena), las mismas ofertas (9,500 / 9,000 / 8,300 / 8,000), los mismos factores, `T46` = 30, las mismas deducciones (31%), la misma tabla de tasa y `J56` = 0.0886. Solo cambian las fichas AE22:AE25, AG24 y AH24 (frentes, forma y zona, que son texto y no entran al cálculo).
- Lo único "real" es `H45 ='lll. INF TERRENO'!T41` = **467.27 m²** (construcción de los departamentos). Con eso cambian los factores de superficie (0.957, 0.950, 0.933, 0.908), el promedio `T44` = 21.54 y `T49` = 14,018.10. Pero `IX. ENF. INGRESOS!N15` sigue fijo en **250**, así que `I65` = **700,902.93**, idéntico a la plantilla TCH.
- **No alimentan la conclusión.** `VIII. CONCLUSION!R17` = "NO APLICA" (texto), `L60 = R13` (costos = 8,580,000) y B54 lo justifica: "el enfoque de ingresos… no se estima por no influir directamente en el valor comercial". Los anexos que las citan (`ANEXO 2. CROQUIS…` con 95 referencias y `ANEXO 3. FACT. HOMOLOGACION` con 6) también están ocultos.
- Ejemplo del riesgo de `N15` fijo: si `N15` estuviera ligado a 467.27, V = 467.27·30·0.69·12/0.0886 = 1,310,043.66 → 1,310,000 (casi el doble).

---

## 3. Método B: TU y TU_OFICIAL (`VII. ENF. INGRESOS`, filas 50‑92)

### 3.a Entradas
| Dato | Unidad | Celda | Plantilla |
|---|---|---|---|
| Superficie rentable del sujeto (para la renta) | m² | N53 = `'lll. INF TERRENO'!$S$42` (sup. rentable; **distinta de I44**, que es la sup. total) | 160 |
| Valor homologado a utilizar | $/m²/mes | T48 | 14 |
| Descuento por vacíos | días | O58 | 60 |
| Duración de contrato / ocupación | años | O59 | 2 |
| Otros ingresos (publicidad, estacionamiento) | $/mes | O61 | 0 |
| Deducciones | fracción | F66 **Servicios de Agua**, F67 Predial, F68 ISR, N66 Mantenimiento, N67 Administración, N68 Seguros, V66 Energía eléctrica, V67 Depreciación fiscal, V68 Otros | 0.10, 0.04, 0.04, 0.05, 0.03, 0.03, 0.01, 0, 0 |
| TIIE 28 días (tasa real) | fracción | I87 | 0.0792 |
| Inflación anual estimada | fracción | I88 (manual; comentario: "puede ingresarse directamente… o calcularse con las celdas de la derecha") | 0.045 |
| INPC año anterior / actual | índice | N88 / R88 (**no se usan**) | 110.65 / 106.996 |
| Vida útil remanente (VUR) | años | M89 | 12 |

### 3.b Cálculos (en orden)
| # | Concepto | Fórmula legible | Excel |
|---|---|---|---|
| 1 | Renta mensual T‑1 | R = N53 · T48 | `Q53 =T48`, `T53 =N53*Q53`, `T54 =SUM(T53:W53)` |
| 2 | Renta bruta potencial | RBP = R | `J56 =T54` |
| 3 | **Factor de vacíos** | DV = días / (años · 360) | `O60 =(O58/(O59*360))` → 0.083333 |
| 4 | **Renta bruta efectiva** | RBE = RBP(1 − DV) + otros | `J63 =(J56-(J56*O60))+O61` → 2,053.33 |
| 5 | Total de deducciones | D = Σ 9 porcentajes (**sin** vacíos) | `K70 =F66+F67+N66+N67+V66+V67+F68+N68+V68` → 0.30 |
| 6 | **Renta neta mensual** | RN = RBE(1 − D) | `J72 =(J63-(J63*K70))` → 1,437.33 |
| 7 | Renta neta anual | RNA = 12·RN | `U72 =J72*12` → 17,248 |
| **Opción 1** (filas 76‑82 visibles; la etiqueta de la fila 74 está oculta) | | | |
| 8 | Renta bruta mensual | = RBP | `I77 =J56` |
| 9 | Deducciones efectivas | d = 1 − RN/RBP | `I78 =1-(J72/J56)` → 0.358333 |
| 10 | Unitario de renta | = T48 | `I79 =T48` |
| 11 | "Tasa de capitalización neta, base mercado" | t₁ = (12·u − 12·u·d/100) / RBP | `I80 =(((I79*12)-(I79*12*I78/100))/I77)` → 0.07473 |
| 12 | Valor Opción 1 | V₁ = RNA / t₁ | TU `K82 =U72/I80` → 230,800.37 ; **TU_OFICIAL `K82 =ROUND(U72/I80,-3)` → 231,000** |
| **Opción 2** (filas 84‑92 **ocultas en impresión**) | | | |
| 13 | Tasa de recuperación | r_VUR = 1/VUR | `I89 =1/M89` → 0.083333 |
| 14 | VUR en meses | m = 12·VUR | `Q89 =M89*12` → 144 |
| 15 | **Tasa de capitalización** | t₂ = (TIIE − inflación) + 1/VUR | `I90 =(I87-I88)+I89` → 0.117533 |
| 16 | **Valor Opción 2** (valor presente de una anualidad mensual) | V₂ = RN · [1 − (1 + t₂/12)^(−m)] / (t₂/12) | `K92 =(J72*(1-(1+(I90/12))^-Q89))/(I90/12)` → 110,689.59 |
| 17 | Conclusión | ROUND(V₂, −4) | `VIII. CONCLUSION!R17 =ROUND('VII. ENF. INGRESOS'!K92,-4)` → **110,000** |
| 18 | Cifra en letras (solo OFICIAL) | a partir de V₁ | `CIFRAENLETRAS!F46 ='VII. ENF. INGRESOS'!K82` → "DOSCIENTOS TREINTA Y UN MIL"; `B94 =CIFRAENLETRAS!I46` |

---

## 4. Método C: TR (`VII. ENF. INGRESOS`, filas 50‑93)

Las unidades de TR dicen "Ha", pero **todas las superficies están en m²**, y las fórmulas multiplican o dividen entre 10,000 para expresar valores en $/Ha.

### 4.a Entradas adicionales
| Dato | Unidad | Celda | Plantilla |
|---|---|---|---|
| Precio de venta de cada comparable (el mismo inmueble que el de renta) | $ | H61:H65 = `'VI. ENF. MERCADO'!C37:C41` | 3,120,000 / 2,900,000 / 2,500,000 / 2,100,000 |
| Factor de negociación | fracción | S58 (comentario: no aplicarlo si ya se aplicó o si son rentas reales) | 0 |
| Descuento por vacíos | fracción | H69 | 0.03 |
| Gastos de operación | fracción | S69 Predial, S70 Conserv. y Mtto., S71 Servicios, W69 Seguros, W70 Otros | 0.05, 0.03, 0.03, 0.01, 0 |
| Valor homologado a utilizar | $/Ha/año | T48 | 16,500 (**no entra al valor**) |

Comentarios: N56 dice que "esta tasa se utiliza solo si los comparables tienen valor de renta y venta". B58 dice que "para pequeños y medianos terrenos… hasta I.B.E. y para terrenos de mayor tamaño… hasta I.N.O.", pero la hoja **siempre** calcula hasta I.N.O.

### 4.b Cálculos (k = 1..5)
| # | Concepto | Fórmula legible | Excel |
|---|---|---|---|
| 1 | Renta bruta anual del sujeto (informativa) | S · T48 / 10,000 | `T53 =N53*Q53/10000`, `T54` (**no la usa nadie**) |
| 2 | Renta anual "homologada" del comparable | Kₖ = (Tₖ/10,000) · Área_k | `K61 =(T38/10000)*D61` |
| 3 | Precio de venta neto | Rₖ = Hₖ(1 − neg) | `R61 =H61-H61*$S$58` |
| 4 | I.B.P. anual | IBPₖ = Kₖ(1 − neg) | `U61 =K61-K61*$S$58` |
| 5 | Gastos totales | G = Σ | `W71 =S69+S70+S71+W69+W70` → 0.12 |
| 6 | I.B.E. anual | IBEₖ = IBPₖ(1 − vac) | `J74 =D74-D74*$G74` (G74 = H69) |
| 7 | I.N.O. anual / mensual | INOₖ = IBEₖ(1 − G); /12 | `U74 =J74-J74*$O74`; `R74 =U74/12` |
| 8 | Ingreso unitario | INOₖ / Área_k · 10,000 | `K83 =(H83/D61)*10000` |
| 9 | **Tasa de mercado** | tₖ = INOₖ / Precioₖ | `O83 =H83/D83` |
| 10 | Multiplicador | Precioₖ / INOₖ | `S83 =D83/H83` |
| 11 | Promedios | ū = prom(K83:K87); t̄ = prom(O83:O87) | `K88 =AVERAGE(K83:N87)`, `O88 =AVERAGE(O83:R87)` → 0.001821 |
| 12 | I.N.O. del sujeto | ū/10,000 · S | `I91 =(B91/10000)*F91` → 9,270.19 |
| 13 | **Valor** | V = INO_suj / t̄ | `R91 =I91/M91` → 5,090,678.68 |
| 14 | Unitario | ū / t̄ ($/Ha) | `U91 =B91/M91` |
| 15 | Redondeo | ROUND(V, −3) | `K93 =ROUND(R91,-3)` → 5,091,000 |
| 16 | Conclusión | ROUND(K93, −2) | `R17 =ROUND('VII. ENF. INGRESOS'!K93,-2)` → 5,091,000 |

---

## 5. Constantes y valores por defecto (resumen)

| Constante | TCH/Arandas | TU/TU_OF | TR |
|---|---|---|---|
| Vacíos | 10% (sumado a las deducciones) | 60 días / (2 años × 360) = 8.33% (multiplicativo) | 3% (multiplicativo) |
| Predial | 4% | 4% | 5% |
| ISR | 4% | 4% | — |
| Mantenimiento | 6% | 5% | 3% (Conserv. y Mtto.) |
| Administración | 3% | 3% | — |
| Seguros | 3% | 3% | 1% |
| Energía eléctrica | 1% | 1% | — |
| Agua / Servicios | 0% | **10% (sospechoso)** | 3% |
| Depreciación fiscal | 0% | 0% | — |
| Otros | — | 0% | 0% |
| **Total** | **31%** | **30% (+ vacíos)** | **12% (+ 3% vacíos)** |
| Año comercial | — | **360 días** | — |
| Tasa | tabla 7‑12%, 7 criterios, divisor 7; J56 manual | TIIE 7.92% − infl. 4.5% + 1/12 | derivada del mercado |
| Factor de negociación en la homologación de rentas | 0.95 | 0.95 | 0.95 (+ S58 = 0) |
| Potencia n | 3 | 6 | 6 |
| Umbral de dispersión recomendado | < 1.25 (comentario) | igual | igual |

## 6. Redondeos exactos

| Punto | Regla |
|---|---|
| Valor unitario homologado a usar (T46/T48) | Sin fórmula: el perito captura una cifra redondeada a criterio (30 frente a T̄ 26.54; 14 frente a 14.11; 16,500 frente a 14,886.75). |
| Tasa aplicada TCH (J56) | Manual. En la plantilla es la tasa resultante (0.0885714) redondeada a 4 decimales: 0.0886. |
| Calibración de n (AM38:AM41) | `ROUND(1/AL,0)` y luego `ABS`. |
| TCH I65 | Sin redondeo. En la conclusión, `ROUND(…,-4)` (decenas de miles). |
| TU K82 | Sin redondeo; **TU_OFICIAL `ROUND(…,-3)`**. |
| TU/TU_OF K92 | Sin redondeo; en la conclusión, `ROUND(…,-4)`. |
| TR K93 | `ROUND(R91,-3)`; en la conclusión, `ROUND(K93,-2)` (no tiene efecto). **Es inconsistente con el −4 de los demás formatos.** |
| Todos | `ROUND` de Excel redondea la mitad alejándose de cero; en la app hay que usar decimal/`ROUND_HALF_UP` y no el redondeo bancario. |

## 7. Diferencias entre formatos

1. **Dirección del factor de superficie.** TU, TCH, Arandas, TR y TRC usan `(Sup_comp / Sup_sujeto)^(1/n)` en rentas, en venta y en costos. **TU_OFICIAL lo invierte en las tres hojas** (`($I$44/F38)`, `($M$37/F42)`, `(D14/$D$18)`), así que es un cambio sistemático de esa versión y no un error aislado. En rentas, el promedio homologado baja de 14.11 a 12.25 $/m². **El valor de ingresos no cambia (110,000)** porque `T48` se captura a mano; el cambio sí afecta lo que se imprime y lo que el perito usa para decidir.
2. **Dónde está la homologación.** En TCH va en una hoja propia (`MERCADO RENTAS`); en TU y TR, dentro de `ENF. INGRESOS`.
3. **Vacíos.** TCH los suma a las deducciones (RN = RB·(1 − 0.31)). TU y TR los aplican en cascada (RN = RB·(1 − DV)·(1 − D)). Para porcentajes iguales, el resultado difiere.
4. **Tasa.** TCH construye la tasa con una tabla. TU la arma como TIIE − inflación + recuperación (Opción 2) o con una fórmula "de mercado" (Opción 1). TR la extrae de pares venta/renta.
5. **Fórmula de valor.** TCH y TR usan capitalización directa (V = INO/t). TU Opción 2 usa el valor presente de una anualidad finita a VUR meses.
6. **Unidades.** TCH y TU trabajan en $/m²/mes. TR trabaja en $/Ha/año (con superficies en m² y etiquetas en "Ha").
7. **Conclusión.** TCH redondea a −4. TU/TU_OF a −4 sobre la Opción 2. TR a −3 y luego −2. Arandas y TRC ponen "NO APLICA". MEH no tiene enfoque de ingresos.

### ¿Qué dirección del factor de superficie es la correcta?

**La de TU/TCH/TR: F_sup = (S_comparable / S_sujeto)^(1/n).** TU_OFICIAL tiene el factor invertido.

Por qué:
- El factor se multiplica por el unitario del **comparable** para llevarlo a las condiciones del **sujeto** (T = FRe × I_comp). En el mercado inmobiliario, el valor o la renta unitarios bajan conforme crece la superficie (V_u ∝ S^(−1/n)). Entonces V_u,suj = V_u,comp · (S_comp/S_suj)^(1/n).
- Un comparable **más grande** que el sujeto tiene un unitario más bajo del que tendría el sujeto, y el factor debe ser **> 1** para subirlo. (S_comp/S_suj)^(1/n) > 1 cumple esto; la versión invertida da < 1 y castiga dos veces al comparable grande.
- Esta es la forma habitual en la práctica mexicana de homologación: los procedimientos técnicos tipo INDAABIN (los formatos se llaman "PT‑TU", "PT‑TCH", igual que los procedimientos técnicos de INDAABIN) y la literatura de homologación para SHF/peritos usan F_sup = (S_comp/S_suj)^(1/n). (Conviene que el perito confirme con la norma que aplica en su despacho.)
- La propia hoja lo confirma. La calibración AL = log(Vu_c/Vu_s)/log(S_c/S_s) supone Vu ∝ S^(−1/n), y en TR comp1‑vs‑comp2 da AL = −1.000 exacto, que corresponde a la ley inversa. Además, el comentario "ordenar de mayor a menor superficie" solo tiene sentido con esa ley.
- Recomendación para la app: dirección fija `(S_comp/S_suj)^(1/n)`, con un parámetro de compatibilidad `invertir_factor_superficie` (default `false`) solo para reproducir avalúos históricos hechos con TU_OFICIAL.

## 8. Validación con Python (recalculado desde las entradas)

Ejecución: `scratchpad/venv/bin/python scratchpad/metodologia/03-rentas-ingresos_validacion.py`

- **150 celdas comparadas, 0 diferencias** (tolerancia relativa 1e‑9) en REAL_ARANDAS, TCH, TU, TU_OFICIAL y TR. Incluye I/Z/R/T por comparable, T44, AC37, deducciones, tasas y valores finales.
- REAL_ARANDAS: T44 = 21.54452 ✔, T49 = 14,018.10 ✔, U50 = 0.0885714 ✔, I65 = 700,902.93 ✔ (el mismo valor que TCH, porque `N15` está fijo en 250); en la conclusión no aplica.
- TCH: I65 = 700,902.93 → ROUND −4 = **700,000** ✔.
- TU: K82 = 230,800.37 ✔; K92 = 110,689.59 → **110,000** ✔. TU_OFICIAL: T44 = 12.2527 ✔ (factor invertido); K82 = 231,000 ✔; K92 → 110,000 ✔.
- TR: O88 = 0.00182101 ✔; R91 = 5,090,678.68 → K93 = **5,091,000** ✔.
- Como Arandas trae datos de plantilla, **no existe todavía un caso real de ingresos** para validar. Se validó contra las cachés de las plantillas.

## 9. Errores o riesgos del Excel

**Críticos (cambian el valor o lo que se imprime):**
1. **TU/TU_OF: la conclusión usa la Opción 2, que está en filas ocultas (84‑92).** El informe impreso muestra la Opción 1 (K82 = 230,800 / 231,000) y el resumen de valores dice 110,000. En TU_OFICIAL, además, la cifra en letras (B94, de K82) dice "doscientos treinta y un mil", contradictoria con R17.
2. **TU Opción 1 (`I80`) no tiene coherencia dimensional.** Divide la renta unitaria anual ($/m²/año) entre la renta total mensual ($/mes) y aplica `/100` a una deducción que ya es fracción. El resultado (7.47%) es numerología, no una tasa.
3. **TU Opción 2 cuenta dos veces la recuperación del capital.** Suma 1/VUR a la tasa (método de Ring) **y además** usa una anualidad finita de VUR meses. En un **terreno**, que no se deprecia, no debería haber recuperación por VUR. Las celdas INPC (N88/R88) no se usan y parecen invertidas (el año anterior es mayor que el actual).
4. **TCH/Arandas: `N15` (superficie) está capturada fija**, no ligada a `H45`. En Arandas, la homologación usa 467.27 m² y la renta 250 m².
5. **TR: la tasa de mercado se calcula con rentas ya homologadas al sujeto (Tₖ) multiplicadas por el área del comparable.** Debería usar la renta real del comparable, sin homologar, contra su precio de venta. Los porcentajes de gasto se aplican igual a todos.
6. **TR: `T48` (valor homologado a utilizar, 16,500) y `T54` (renta bruta del sujeto) no entran al valor.** El valor sale del promedio de los comparables (K88), así que el criterio del perito se ignora.
7. **TR: la tasa de 0.18% es irrazonable** (multiplicador de 550×). El enfoque termina replicando el de mercado (5.09 M frente a 5.03 M); no es un enfoque independiente.
8. **TR: S28 y S29 están capturadas a mano (7,500)** y la ficha AM21/AM22 dice 6,500. La descripción impresa (Q21) muestra una oferta distinta de la calculada.
9. **TR, comparable 5 roto:** a C42 y T42 les falta la fórmula, `I42` no multiplica ×10,000, `K65` no existe, `B65` revisa `'VI. ENF. MERCADO'!C41` pero `B78` revisa `C50`, y `G78` = 3% aunque la fila esté vacía.

**Moderados:**
10. TU_OFICIAL: el factor de superficie está invertido (ver §7).
11. TU: la homologación usa `I44` = sup. total (`H42`) y la renta usa `N53` = sup. rentable (`S42`). Son fuentes distintas.
12. TU: el primer renglón de deducciones dice "Servicios de Agua" con 10%. En la misma posición, TCH tiene "Vacíos" con 10%. Parece un sobrante de la plantilla y hace que los vacíos se cuenten dos veces.
13. TCH: la tasa de la tabla divide entre 7 fijo. Si el perito marca 0 o 2 casillas en un criterio, la tasa sale mal sin aviso. `J56` es manual y puede quedar desfasada de `U50`. "Tasa de mercado" y "ponderada" (J54/J55) no tienen cálculo.
14. TCH: `T45` ("valor más parecido") está fijo al comparable 2. `T51` (valor comparativo de mercado de rentas) no se usa.
15. Moda de n: da `#N/A` cuando no hay repetidos (TR). Incluye n = 0 (TU AM39), lo que dividiría entre cero si se usara. `ABS` oculta elasticidades con el signo equivocado. `AM44` = 3 es texto fijo.
16. `R38` devuelve `" "` (espacio) si algún factor está vacío. Ese comparable desaparece del promedio en silencio.
17. TR: las etiquetas "Ha" sobre valores en m² (`'lll. INF TERRENO'!H41` "ha" = T41 m²). La regla del comentario B58 (IBE frente a INO según tamaño) no está implementada.
18. Redondeo final inconsistente: −4 en TCH/TU frente a −3/−2 en TR.
19. TU: `O60` usa un año de 360 días.
20. Arandas: las hojas ocultas conservan los contactos y datos de ejemplo de la plantilla. Si alguien las muestra, se imprimen comparables ficticios.

## 10. Preguntas concretas para el perito

1. **Factor de superficie:** ¿confirma que la dirección correcta es (S_comp/S_suj)^(1/n) y que la inversión de TU_OFICIAL es un error? ¿Hay avalúos emitidos con la versión OFICIAL que debamos reproducir?
2. **TU:** ¿cuál es el valor oficial de ingresos, la Opción 1 (visible, 230,800) o la Opción 2 (oculta, 110,000, la que va a la conclusión)? ¿La Opción 1 es obsoleta?
3. **TU Opción 2:** en un terreno, ¿por qué se suma 1/VUR a la tasa **y** se usa además una anualidad finita a VUR? ¿Prefiere capitalización directa (V = RNA/t) o flujo finito sin la recuperación?
4. **TU Opción 1:** ¿cuál era la intención de `I80`? ¿Una tasa de mercado INO/precio de venta como la de TR?
5. **Vacíos:** ¿se restan en cascada (TU/TR) o se suman a las deducciones (TCH)? ¿Año de 360 o 365 días?
6. **TU `F66` "Servicios de Agua" 10%:** ¿es correcto o debería ser "Vacíos"? ¿Qué porcentajes por defecto quiere para cada formato?
7. **ISR y depreciación fiscal como deducción:** ¿se mantienen? ¿Con qué porcentaje por defecto?
8. **Tasa TCH:** ¿la tabla de 7 criterios (7‑12%) es su metodología estándar? ¿La tasa aplicada debe ser siempre la resultante redondeada a 4 decimales, o puede capturarla? ¿Implementamos "tasa de mercado" y "tasa ponderada" (J54/J55)? ¿Con qué fórmula y ponderación?
9. **Valor homologado a utilizar (T46/T48):** ¿debe tener por defecto el promedio T̄ y un redondeo sugerido (¿a qué múltiplo?), con posibilidad de ajuste manual y justificación?
10. **TR:** ¿la oferta de renta rural es anual o mensual? ¿El I.N.O. del comparable debe salir de su renta real (sin homologar) contra su precio? ¿La regla de B58 (IBE para terrenos pequeños o medianos, INO para grandes) la quiere automática? ¿Con qué umbral de superficie? ¿Por qué `T48` no interviene en el valor?
11. **Redondeo final del enfoque de ingresos:** ¿único para todos (ROUND −4) o −3 en rural?
12. **TCH:** ¿la superficie rentable del sujeto debe ser siempre la de construcción de `INF TERRENO`? ¿`N15` se liga automáticamente?
13. **Potencia n:** ¿la app debe proponer n con la moda de la calibración (excluyendo 0) o siempre un valor fijo (3/6)? ¿Qué hacer si la dispersión supera 1.25: bloquear o solo advertir?
14. **TRC y MEH:** ¿nunca llevan enfoque de ingresos o solo se omitió en la plantilla?
15. **Arandas:** confirmar que en ese avalúo el enfoque de ingresos "no aplica" y que las hojas ocultas son residuo de la plantilla (no hay rentas reales que capturar).

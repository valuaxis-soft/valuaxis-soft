# 02 · Enfoque comparativo de mercado (venta) y homologación

Alcance: hojas «ENF. MERCADO VENTA» / «ENF. MERCADO» de TU, TU_OFICIAL, TCH, TR, TRC, MEH y REAL_ARANDAS; anexos «FACT. HOMOLOGACION» y «CROQUIS Y FOTO COMP»; en MEH, la parte comparativa de «METODOS ALTERNATIVOS».
Fuente: `scratchpad/dump/<FORMATO>/*.txt`. Validación ejecutable: `metodologia/02-mercado_validacion.py`.

> **Conclusiones clave**
> 1. **El factor de superficie correcto es el de TU/TCH/TR/TRC/REAL: `Fsup = (S_comparable / S_base)^(1/n)`.** El de TU_OFICIAL, `(S_base / S_comparable)^(1/n)`, está invertido: castiga dos veces al comparable grande y premia dos veces al chico. La justificación está en §5.
> 2. En el Excel, **el valor unitario adoptado (T50 / T45 / T46 / T90) es una captura manual** y no se liga al promedio. Por eso invertir el factor en OFICIAL no cambia el resultado final: 7,000 $/m² en ambos libros, aunque el promedio homologado baja de 6,840 a 5,156. Varios libros adoptan valores **fuera del rango homologado**: TCH adopta 5,000 con un mínimo de 6,941; TR adopta 6.9 M $/ha con un máximo de 5.94 M; OFICIAL adopta 7,000 con un máximo de 5,393.
> 3. El anexo «FACT. HOMOLOGACION» **no tiene tablas numéricas**: solo trae texto descriptivo, y en TU/TCH ese texto está desfasado respecto al factor que describe. Todos los factores se capturan a mano como `=calif_sujeto/calif_comparable`. No hay ningún lookup.
> 4. REAL_ARANDAS se recalculó desde sus entradas y **coincide al 100 %** con la caché (§6).

---

## 1. Estructura general (común a los formatos inmobiliarios)

Hay tres bloques por sección, y un formato puede tener una sección de terrenos y otra de inmuebles:

1. **Captura de comparables** (lado derecho, columnas AA–AR). Tiene 5 renglones fijos: siempre 5 comparables como máximo y ningún mínimo forzado.
2. **Resumen/contacto** (renglones 29–33 en TU/TCH/REAL): contacto, teléfono, fecha, superficie, oferta y $/m².
3. **Homologación** (renglones 42–46): oferta, superficie, valor unitario, 6 factores, FRe y valor unitario homologado. Debajo van el promedio, el «valor más parecido», el **valor adoptado manual**, la superficie del sujeto, el subtotal, un monto adicional y el valor comparativo.
4. **Auxiliar «potencia»** (columnas Z–AN): exponente n del factor de superficie, dispersión y n sugerido.

El nivel de oferta (MUY ALTA … NULA) se marca a mano con «( X )» (E15/K15/O15/E16/K16/O16) y es solo texto.

---

## 2. Entradas del perito

### 2.1 Por comparable (terrenos urbanos: TU, TU_OFICIAL, TCH, REAL)

Renglón i = 22..26 (comparable 1..5). En TU las columnas empiezan en AC; en TCH y REAL, en AD (una columna a la derecha).

| Campo | Unidad / tipo | TU / TU_OFICIAL | TCH / REAL | ¿Participa en el cálculo? |
|---|---|---|---|---|
| Ref. | entero | B22, AA22 | B22, AB22 | no |
| Ubicación (dirección) | texto | C22 | C22 | no. Además `C29<>0` es el «interruptor» del comparable |
| Uso de suelo (descripción larga) | texto | M22 | M22 | no |
| N.º de frentes | entero | AC22 | AD22 | no (solo informa el factor Ubic.) |
| Uso de suelo (clave) | texto | AD22 | AE22 | no |
| Forma | texto (Regular/Irregular) | AE22 | AF22 | no |
| Zona (Calle Tipo/Superior/Inferior) | texto | AF22 | AG22 | no |
| Frente | m | AG22 | AH22 | no |
| Fondo | m | AH22 | AI22 | no |
| **Superficie** | m² | **AI22** | **AJ22** | **sí** |
| Topografía | texto | AJ22 | AK22 | no |
| Servicios | texto | AK22 | AL22 | no |
| **Precio de oferta** | $ | **AL22** | **AM22** | **sí** |
| Observaciones | texto | AM22 | AN22 | no |
| Link | URL | AQ22 | AR22 | no |
| Contacto / fuente | texto | C29..C33 | C29..C33 | controla `IF(C29<>0, …)` |
| Teléfono | texto | H29..H33 | H29..H33 | no |
| Fecha de la oferta | fecha | K29..K33 | K29..K33 | no |
| Q22 «Características» | fórmula CONCATENATE de los campos | Q22 | Q22 | solo impresión |

**Factores de homologación por comparable** (renglón h = 42..46, igual en todos los formatos urbanos). Todos son captura manual:

| Col. | Etiqueta TU/TCH | Etiqueta REAL (editada por el perito) | Captura típica |
|---|---|---|---|
| L | Neg. | Neg. | número directo (0.95) |
| M | Ubic. | Ubic. | `=calif_suj/calif_comp`, p. ej. `=1/1.1`, `=1/1.15` |
| N | Sup. | Sup. | **fórmula** `=Z_h` (calculado) |
| O | Serv. | **Zona** | `=1/0.95`, `=0.9/1.05` |
| P | Clasif. | **Frent** | `=1/1`, `=1/1.15` |
| Q | Top. | **Uso** | `=1/0.95`, `=1.1/1.05` |

> Las etiquetas L41..Q41 son texto editable. El perito **reutiliza las columnas para otros factores** (REAL cambió Serv/Clasif/Top por Zona/Frent/Uso). En la app, cada «slot» de factor debe tener **nombre libre + calificación sujeto + calificación comparable**.

### 2.2 Del sujeto y de parámetros (urbanos)

| Entrada | Celda TU | Celda TCH | Celda REAL | Nota |
|---|---|---|---|---|
| Superficie del sujeto | F48 = `'lll. INF TERRENO'!H42` (160) | F48 = `…!H40` (160) | F48 = `…!H41` (169.78) | viene de otra hoja |
| Marca «Lote tipo» | I37 = "x" | I37 = "x" | (vacío) | selector |
| Marca «Lote sujeto» | I38 = "x" | (vacío) | I38 = "x" | selector |
| Lote tipo | M37 (140) | M37 (140) | M37 (140) | m² |
| Frente tipo / fondo tipo | U37 / U38 | U37 / U38 | U37 (8) / U38 (17.5) | **no se usan en ninguna fórmula** |
| Potencia n | Z41 (3) | Z41 (3) | **Z41 (6)** | manual |
| **Valor unitario adoptado** | **T50 = 7000** | **T50 = 5000** | **T50 = 9000** | **manual, no ligado** |
| «Valor más parecido» | T49 `=T42` | T49 `=T43` | T49 `=T44` | puntero manual a un renglón; informativo |
| Monto adicional | T54 = 0 | T54 = 0 | T54 = 0 | $ |

### 2.3 Rural (TR, TRC terrenos)

Comparables en renglones 20..24 (TR) o 21..25 (TRC), columnas AC..AQ: uso de suelo, clasif. zona, forma, fuente hídrica, vías de acceso, ubicación (accesibilidad), **superficie AI (m²)**, topografía, servicios, **oferta AL**, observaciones y link. El contacto, el teléfono y la fecha van en C/H/K de los renglones 27..31 (TR) o 28..32 (TRC).
Los factores están en L..Q de los renglones 37..41 (TR) o 38..42 (TRC), con las etiquetas Neg/Ubic/Sup/Serv/Clasif/Top. La potencia está en Z36 (TR) o Z37 (TRC). El sujeto está en F43 (TR, `'lll. INF TERRENO'!H41`) o F44 (TRC, `…!H40`). Aquí **no existe la opción lote tipo**.
El valor adoptado es **T45 (TR, 6,900,000 $/ha)** o **T46 (TRC, 6,800,000 $/ha)**.

### 2.4 Inmuebles (TCH renglones 68–98, TRC renglones 65–95)

- Captura: ubicación, uso, frentes, forma, zona, frente, fondo, **sup. construida** (AJ en TCH, AI en TRC), conservación, calidad, **oferta** y observaciones. En el resumen: contacto, **edad (H)**, conservación (J) y **sup. terreno (M)**. La edad y la superficie de terreno **no se usan** en ningún cálculo.
- Factores: TCH L..Q = Neg/Ubic/Sup/Zona/Cal/Otro; TRC = Neg/Zona/Sup/Ubic/Cal/Top.
- Sujeto: sup. construida J92 (TCH `'lll. INF TERRENO'!T40`) o J89 (TRC `…!H41`). Potencia Z84 (TCH) o Z81 (TRC).
- Valor adoptado: TCH **T93 = ROUND(T91,-3)** (automático); TRC **T90 = 23000** (manual).

### 2.5 MEH (maquinaria), hoja «V. ENF. MERCADO»

- Resumen por comparable C1..C5 (renglones 23–27): descripción D, marca L, modelo P, año S, horas U, aditamentos X, fecha AD y **valor de oferta AJ**.
- Contacto (renglones 31–35): contacto D, empresa J, teléfono P, correo T, link W, ubicación AA y observaciones AF.
- Características técnicas (renglones 55–75, sujeto en G y comparables en M/S/Y/AE/AK): marca, modelo, año, conservación, tipo de mantenimiento, ubicación, procedencia, cabina, horas, km, cucharón, brazo, rotomartillo, reparaciones, edo. operativo, nivel de oferta/demanda, **edad (renglón 72)**, **VUT (renglón 73)**, VUR = VUT − E y precio de oferta.
- Homologación (renglones 81–85): F:E:E:S % en J (fletes/embalaje/seguros), gastos de instalación % en M, **calificación de conservación 1–10 en AS**, y factores manuales FCo (AA), FMt (AC), FOt (AE) y FOe (AG).

---

## 3. Cálculos en orden de dependencia

Notación: i = comparable, h = renglón de homologación, n = potencia, S_b = superficie base.

### 3.1 Terrenos urbanos (TU, TU_OFICIAL, TCH, REAL)

| # | Concepto | Fórmula matemática | Excel (celda, renglón 42 como ejemplo) |
|---|---|---|---|
| 1 | Superficie en resumen | S_i | M29 `=IF(C29<>0,AI22,"")` (TU); `=IF(C29<>0,AJ22,"")` (TCH/REAL) |
| 2 | Oferta en resumen | P_i | Q29 `=AL22` (TU, **sin IF**); `=IF(C29<>0,AM22,"")` (TCH/REAL) |
| 3 | $/m² de oferta (resumen) | P_i / S_i | U29 `=IFERROR(Q29/M29,"")` |
| 4 | Oferta / superficie en la homologación | | C42 `=IF(Q29<>0,Q29,"")`, F42 `=IF(M29<>0,M29,"")` |
| 5 | Valor unitario | Vu_i = P_i / S_i | I42 `=IFERROR(C42/F42,"")` |
| 6 | Superficie base | S_b = M37 (lote tipo) si I37≠vacío; si no, F48 (sujeto) | lógica dentro de Z42. M38 `=IF(I38=I37,"MARCA UNA X",IF(I38>0,F48,IF(I37>0,F48,"ERROR")))` solo muestra el valor |
| 7 | **Factor superficie** | **F_sup = (S_i / S_b)^(1/n)** | Z42 `=IFERROR(IF($I$37<>0,(F42/$M$37)^(1/$Z$41),((F42/$F$48)^(1/$Z$41))),"")`; N42 `=Z42` |
| 7' | *TU_OFICIAL* | *(S_b / S_i)^(1/n)* ← invertido | Z42 `=IFERROR(IF($I$37<>0,($M$37/F42)^(1/$Z$41),(($F$48/F42)^(1/$Z$41))),"")` |
| 7'' | Renglón 46 (comparable 5) | (S_5 / **F48**)^(1/n) **siempre** | Z46 `=IFERROR((F46/$F$48)^(1/$Z$41),"")` ← **no respeta lote tipo** |
| 8 | Factor resultante | FRe = F_neg · F_ubic · F_sup · F_O · F_P · F_Q | R42 `=IF(L42*M42*N42*O42*P42*Q42<>0,L42*M42*N42*O42*P42*Q42," ")` |
| 9 | VU homologado | VUH_i = FRe_i · Vu_i | T42 `=IFERROR(R42*I42,"")` |
| 10 | Promedio | VUH̄ = (1/k) Σ VUH_i (solo celdas numéricas) | T48 `=AVERAGE(T42:W46)` |
| 11 | Dispersión | max(VUH) / min(VUH) | AC41 `=IF(R46<>0,MAX(T42:W46)/MIN(T42:W46),MAX(T42:W45)/MIN(T42:W45))` |
| 12 | Valor adoptado | V_u* (captura) | T50 (literal) |
| 13 | Superficie del sujeto | S_s | T52 `=F48` |
| 14 | Subtotal | S_s · V_u* | T53 `=T52*T50` |
| 15 | Valor comparativo | S_s · V_u* + monto adicional | TU/TCH: T55 `=T53+T54`; **REAL: `=ROUND(T53+T54,-2)`** |
| 16 | Hacia costos | V_u terreno para el enfoque de costos | `'ENF. COSTOS'!T14 =ROUND('…MERCADO VENTA'!T50,-1)`; lote tipo `D14 =IF(I37<>0,M37,M38)` |
| 17 | Hacia conclusión | valor de mercado | TU: `'CONCLUSION'!R15 =ROUND(T55,-4)`; TCH: `=ROUND(T98,-4)` (sección **inmuebles**); REAL: «NO APLICA» (texto) |

Nota de precisión: Excel evalúa el producto de izquierda a derecha (L·M·N·O·P·Q). La app debe usar **el mismo orden** en doble precisión para reproducir la caché bit a bit. En TCH, R44 = 1.1968169611771506 mientras Z44 = …509, y la diferencia se explica por el orden de las operaciones.

### 3.2 Cálculo auxiliar de la potencia n (sugerida, no vinculada)

Modelo implícito: Vu ∝ S^(−1/n). Para dos comparables consecutivos:

- AF_j = S_j / S_{j+1}; AG_j = Vu_j / Vu_{j+1}
- 1/n_j = log10(AG_j) / log10(AF_j) (sin el signo menos del modelo)
- n_j = |ROUND(1/(1/n_j), 0)|
- Moda de los n_j, luego `ODD(moda)` (redondea hacia arriba al siguiente impar).

| Formato | Celdas | Rango de la moda | Recomendado |
|---|---|---|---|
| TU | AF42:AG45, AF49:AJ53 (renglones 49,50,52,53; **el 51 no existe**) | `ROUND(MODE.SNGL(AJ49:AJ52),0)` → **excluye el par 4v5 (renglón 53)** | AI56 `=ODD(AI54)` = 3 |
| TCH/REAL terreno | AF42:AN45 | `MODE.SNGL(AN42:AN45)` (los 4 pares) | AM48 = **3 fijo (texto)** |
| TCH inmuebles | AF85:AN88 | `MODE(AN85:AN88)` | AM91 = 3 fijo |
| TR | AF37:AG40, AF44:AJ48 | `MODE.SNGL(AJ44:AJ47)` → **el renglón 45 duplica el par 1v2** (etiquetado «2 vs 3») y **excluye 4v5** | AI51 = 3 fijo |
| TRC terreno | AF45:AJ50 | `MODE.SNGL(AJ45:AJ49)` → **duplica 1v2 y excluye 4v5** | AI53 = 3 fijo |
| TRC inmuebles | AF89:AJ93 | `MODE.SNGL(AJ89:AJ92)` → **el renglón 90 repite 1v2, falta el 2v3 real y excluye 4v5** | AI96 = 3 fijo |

La potencia **usada** (Z41/Z36/Z37/Z84/Z81) es siempre captura manual e independiente del valor sugerido. REAL usa n = 6, aunque su moda es 2.

### 3.3 Rural (TR; TRC igual con el renglón desplazado +1)

| # | Concepto | Fórmula | Excel TR |
|---|---|---|---|
| 1 | Superficie | S_i (m²) | M27 `=AI20`; P27 `=IF(M27<>0,M27,"")`. **Encabezado «(ha)», pero el valor está en m²** |
| 2 | Oferta | P_i | S27 `=IF(AL20<>0,AL20,"")` |
| 3 | $/ha | P/S·10 000 | U27 `=IFERROR(S27/P27*10000,"")`; I37 `=IFERROR(C37/F37*10000,"")` |
| 4 | F_sup | (S_i / S_s)^(1/n) | Z37 `=IFERROR(IF($I37<>0,((F37/$F$43)^(1/$Z$36))),"")` |
| 5 | FRe | producto | R37 `=IFERROR(L37*M37*N37*O37*P37*Q37,"")` (**sin la protección `<>0`**) |
| 6 | VUH | FRe·Vu | T37 `=IFERROR(R37*I37,"")` |
| 7 | Promedio | | T43 `=AVERAGE(T37:W41)`; TRC además T45 `=MEDIAN(T38:W42)` |
| 8 | Adoptado $/ha | captura | T45 (TR) / T46 (TRC) |
| 9 | Adoptado $/m² | /10 000 | T46 `=T45/10000` |
| 10 | Subtotal | S_s/10 000 · V_ha | T49 `=(T48/10000)*T45` |
| 11 | Valor comparativo | + monto | T51 `=T49+T50`; conclusión `=ROUND(T51,-4)`; costos `J14 ='VI. ENF. MERCADO'!T45` (sin redondeo) |

### 3.4 Inmuebles (TCH / TRC)

VU = oferta / sup. construida (I85 `=IFERROR(C85/F85,"")`); F_sup = (Sc_const / Ss_const)^(1/n) (Z85 `=IFERROR((F85/$J$92)^(1/$Z$84),"")`). FRe y VUH son iguales al caso de terrenos. Promedio en T91. **TCH adopta T93 = ROUND(T91,-3)**, TRC adopta T90 manual. Valor = T95·T93 (+T97), y en la conclusión se aplica `ROUND(…,-4)`. En TRC, U72 `=S72/P72` no lleva IFERROR.

### 3.5 MEH, «V. ENF. MERCADO»

| # | Concepto | Fórmula | Excel (C1) |
|---|---|---|---|
| 1 | VUR | VUT − E | M74 `=M73-M72` |
| 2 | % gastos | J + M | P81 `=J81+M81` |
| 3 | Oferta puesta en sitio | D·(1 + ΣG) | S81 `=D81+(D81*P81)` |
| 4 | Factor de conservación (tabla, calif. 1–10) | 10→1, 9→0.99, 8→0.975, 7→0.92, 6→0.82, 5→0.66, 4→0.47, 3→0.25, 2→0.10, 1→0 | AT81: 10 IF concatenados que devuelven **texto** («  0.975       ») |
| 5 | FEd | (1 − (E_comp/VUT)^1.4) · F_cons | AR81 `=(1-((M72/M73)^1.4))*AT81`; Y81 `=AR81` |
| 5' | (sin uso) | 1 − E/(E+VUT); (VUT−E)/VUT | AP81, AQ81 |
| 6 | FRe | FEd·FCo·FMt·FOt·FOe | AI81 `=Y81*AA81*AC81*AE81*AG81` |
| 7 | «V.N.R. unitario instalado» | FRe · S | AK81 `=AI81*S81` |
| 8 | Promedio / mediana | | AI88 `=AVERAGE(AK81:AO85)`; AI89 `=MEDIAN(AK81:AO85)` |
| 9 | **Valor comparativo** | **ROUND(mediana, −4)** | AI91 `=ROUND(AI89,-4)` → conclusión R15 |

### 3.6 MEH, «METODOS ALTERNATIVOS» (solo la parte comparativa)

**Método 1, costo-capacidad** (renglones 26–55):
- Q_i = ROUND((Cap_s / Cap_i)^0.6 · P_i, −2) → Q37 `=ROUND((($J$42/J37)^O37)*D37,-2)` (O = 0.6, regla de los seis décimos).
- Ponderación por capacidad: w_i = Cap_i / ΣCap (V46), con Y46 = Q_i·w_i.
- VRN = ROUND(promedio(simple M51, ponderado Y51), −3) → AH53.
- VNR_i = Q_i · FRe_sujeto (AI37 `=Q37*$AG$37`, donde FRe viene de `'IV. ENF. COSTOS'!J42..S42`); resultado AH55 `=ROUND(AVERAGE(AH46:AO50),-3)`.

**Método 2, regresión lineal**: los coeficientes se **pegan a mano** (AR109:AR115) desde la salida del complemento «Análisis de datos» (BD78:BL100, estáticos). Y = b0 + Σ b_k·X_k (D109) y el resultado es AH111 `=ROUND(D109,-4)`. El recálculo en Python reproduce los coeficientes pegados usando las 20 filas.

---

## 4. Anexo «FACT. HOMOLOGACION» y tablas de factores

**No hay tablas de valores ni lookup en ningún formato.** El anexo solo trae:
- El nombre del factor tomado de las etiquetas de la hoja de mercado (`=CONCATENATE('VI. ENF. MERCADO VENTA'!L$41,":")`, etc.).
- Un texto descriptivo fijo por factor y un bloque «OTROS» (Forma, Calidad, Edo. conservación) con texto fijo.
- En REAL, el perito escribió la justificación libre de «Frent» y «Uso» (N17, N19). Ejemplo: «El sujeto tiene 7.5 m de frente … comp. 4 tiene 11 m … castigo este comparable».

Por lo tanto, **la elección de cada factor es 100 % juicio del perito**, capturada como cociente literal. Los valores observados en los libros se resumen así (calificación del comparable en el denominador y del sujeto en el numerador):

| Factor | Valores usados | Dónde |
|---|---|---|
| Negociación | 0.95 (fijo en todos) | L42..L46 en todos los formatos |
| Ubicación / esquina | 1/1.1; 1/1.15 (comparable con 2 frentes o esquina) | TU/TCH M42; REAL M45 |
| Zona | 0.9/1; 0.9/1.05 | REAL O42..O46 |
| Frente | 1/1.15 (frente 11 m vs 7.5 m) | REAL P45 |
| Uso de suelo | 1.1/1.05; 1.1/1 | REAL Q42..Q46 |
| Servicios | 1/0.95 (incompletos) | TCH O44, O45 |
| Topografía | 1/0.95; 1/0.85 (lomerío suave); 1.05 directo | TU Q45, TCH Q45, TR Q38/Q40 |
| MEH FCo / FMt / FOt | 0.5–1.0 directos | AA81:AG85 |
| MEH conservación (sí es tabla) | 10→1 … 1→0 (ver §3.5) | AT81:AT85 |

**Defectos del anexo:**
- TU/TCH/TR/TRC: las descripciones están **cruzadas**. «Serv.» dice «características agrológicas», «Clasif.» describe topografía y «Top.» describe servicios. «Neg.» usa el texto correcto.
- MEH: las descripciones son de terreno (agrológicas, topografía) y aplican a FEd/FCo/FMt, y las secciones 2 y 3 dan **`#REF!`** (B25..M39).
- Las etiquetas del anexo cambian si el perito reetiqueta columnas, pero el texto descriptivo no cambia. En REAL, la sección 2 (inmuebles) etiqueta «Cal.» con un texto de topografía.

**Propuesta para la app:** catálogo configurable por despacho (factor → lista de calificaciones con valor numérico, p. ej. Zona: Calle Superior 1.05 / Tipo 1.00 / Inferior 0.95). El factor se calcula como `calif_sujeto / calif_comparable` y la captura manual con justificación obligatoria queda como alternativa. Esto se debe **confirmar con el perito** (§8).

---

## 5. Diferencias entre formatos y dirección de los factores

### 5.1 Resumen de diferencias

| Aspecto | TU | TU_OFICIAL | TCH | REAL | TR | TRC | MEH |
|---|---|---|---|---|---|---|---|
| F_sup | (S_c/S_b)^(1/n) | **(S_b/S_c)^(1/n)** | (S_c/S_b)^(1/n) | (S_c/S_b)^(1/n) | (S_c/S_s)^(1/n) | ídem | n/a |
| Lote tipo | sí (I37/I38) | sí | sí (**activo**, 140) | sujeto | no | no | n/a |
| n usado | 3 | 3 | 3 / 3 | **6** / 3 | 3 | 3 / 3 | — |
| Unidad | $/m² (encabezado dice **$/ha**) | ídem | ídem | ídem | $/ha | $/ha y $/m² inmuebles | $ por equipo |
| Valor adoptado | T50 manual 7000 | T50 manual 7000 | T50 manual 5000; inmuebles `ROUND(prom,-3)` | T50 manual 9000 | T45 manual | T46 / T90 manual | `ROUND(MEDIAN,-4)` |
| Redondeo del valor de la sección | ninguno (conclusión −4) | ídem | ninguno (conclusión −4 sobre inmuebles) | **−2** | ninguno (conclusión −4) | ídem | −4 |
| FRe vacío | `" "` | ídem | ídem | ídem | `""` vía IFERROR | ídem | sin protección |
| Mediana | no | no | no | no | no | sí (T45) | sí (se usa) |
| Q29 (oferta resumen) | `=AL22` sin IF | ídem | con IF | con IF | con IF | con IF | — |

### 5.2 Convención de dirección

Todos los formatos usan la convención **«se ajusta el comparable para que se parezca al sujeto»**: VUH = Vu_comparable × FRe. Con esa convención:

- En atributos donde **más calificación implica más valor** (zona, ubicación, frente, uso, servicios, topografía, calidad, conservación), el factor correcto es **F = calif_sujeto / calif_comparable**. Si el comparable es mejor, F < 1 y su precio baja. Así están capturados todos los factores de los libros (`=1/1.1`, `=0.9/1.05`, `=1/0.95`). ✔
- **Negociación**: factor directo < 1 que convierte la oferta en precio probable de cierre. ✔
- **Superficie**: el valor unitario **decrece** con el tamaño (Vu ∝ S^(−1/n)). El «índice de valor» de cada predio es S^(−1/n), así que el cociente sujeto/comparable de ese índice da:

  F_sup = S_s^(−1/n) / S_c^(−1/n) = **(S_c / S_s)^(1/n)**

  Esta es exactamente la fórmula de TU/TCH/TR/TRC/REAL. Ejemplo TU: comparable de 260 m² contra un sujeto de 160 m² da F = 1.176. El comparable grande tiene un $/m² menor que el que obtendría un lote de 160 m², y el factor lo sube. ✔
- **TU_OFICIAL** usa (S_s/S_c)^(1/n) = 0.851 para el mismo caso: **baja todavía más** el $/m² de un comparable que ya está «barato» por ser grande. El sesgo ocurre dos veces en la misma dirección. En el ejemplo, el promedio homologado cae 24.6 % (6,840 → 5,156), y la dispersión empeora de 1.063 a 1.123. **Está invertido y es incorrecto.**

**Soporte normativo y de práctica** (a confirmar por el perito con el texto vigente):
- Los nombres de los formatos (PT-TU, PT-TCH, PT-TR, PT-MEH…) provienen de los *Procedimientos Técnicos* del INDAABIN. En ellos, y en las Reglas/Metodología de la SHF para inmuebles de vivienda, la homologación **ajusta cada comparable a las características del sujeto**, y el factor de superficie se expresa como el cociente de superficies comparable/sujeto elevado a 1/n (con n empírico, típicamente de 2 a 8 o 12, según el mercado).
- La prueba económica es independiente de cualquier norma: con F = (S_c/S_s)^(1/n), si el mercado cumple Vu ∝ S^(−1/n), todos los comparables homologados convergen al mismo valor. Con la fórmula invertida divergen: la dispersión aumenta, y lo muestran los propios datos de TU.
- El único caso en que (S_b/S_c) sería correcto es la convención contraria, en la que se ajusta **el sujeto** o se divide Vu_c entre el factor. Ningún formato del despacho la usa, y OFICIAL multiplica igual que los demás.

**Otras direcciones a revisar:**
- **Costos (fuera de esta área, pero alimentado por ella)**: cuando se usa lote tipo, el valor adoptado corresponde al lote tipo y en costos se pasa al sujeto con `Y18 =(D18/$D$14)^(1/$Y$17)` = (S_s/S_lt)^(1/n). En TCH da 1.0455 (sujeto de 160 contra lote tipo de 140). **Está invertido**: el sujeto más grande debería tener un factor < 1, es decir, (S_lt/S_s)^(1/n) = 0.9565. Con lote sujeto el factor vale 1 y no afecta.
- **MEH, FEd**: se multiplica el precio del comparable por **su propia depreciación** (1 − (E_c/VUT)^1.4)·F_cons. **La edad del sujeto (G72 = 14) no se usa en ninguna parte**. El precio de un usado ya refleja su depreciación, así que esto deprecia dos veces y no compara con el sujeto. La forma correcta es **FEd = D(E_sujeto)/D(E_comparable)** (el sujeto tiene 14 años y los comparables de 6 a 10, por lo que el factor debe ser < 1). Además, la conservación entra dos veces: dentro de FEd (tabla AT) y en FCo.
- **MEH, costo-capacidad**: (Cap_s/Cap_c)^0.6 tiene la dirección correcta. Pero aplica la regla a **precios de usados** (modelos 2009–2016), los llama «VRN» y después les aplica de nuevo la depreciación del sujeto (FRe = 0.592). El resultado es una doble depreciación.

---

## 6. Validación: REAL_ARANDAS recalculado desde sus entradas

Script: `metodologia/02-mercado_validacion.py`. Lee las entradas del volcado (ofertas AM22:AM26, superficies AJ22:AJ26, factores literales L..Q42:46, Z41 = 6, F48 = 169.78, T50 = 9000) y recalcula todo.

| Comp. | Oferta | S (m²) | Vu | Neg | Ubic | F_sup (n=6) | Zona | Frent | Uso | FRe | VUH | Caché |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,260,000 | 140 | 9,000.00 | 0.95 | 1 | 0.968368 | 0.9/1 | 1 | 1.1/1.05 | 0.867381 | 7,806.43 | = |
| 2 | 1,220,000 | 140 | 8,714.29 | 0.95 | 1 | 0.968368 | 0.9/1.05 | 1 | 1.1/1.05 | 0.826077 | 7,198.67 | = |
| 3 | 2,032,590 | 192.5 | 10,558.91 | 0.95 | 1 | 1.021153 | 0.9/1 | 1 | 1.1/1 | 0.960394 | 10,140.71 | = |
| 4 | 2,261,130 | 196.62 | 11,500.00 | 0.95 | 1/1.15 | 1.024763 | 0.9/1 | 1/1.15 | 1.1/1 | 0.728764 | 8,380.78 | = |
| 5 | 1,330,000 | 140 | 9,500.00 | 0.95 | 1 | 0.968368 | 0.9/1 | 1 | 1.1/1.05 | 0.867381 | 8,240.12 | = |

| Resultado | Python | Caché Excel |
|---|---|---|
| T48 promedio | 8,353.341571216495 | 8,353.341571216495 ✔ |
| AC41 max/min | 1.4086928282510671 | 1.4086928282510671 ✔ |
| T53 = 169.78 × 9000 | 1,528,020 | 1,528,020 ✔ |
| T55 = ROUND(…,−2) | 1,528,000 | 1,528,000 ✔ |
| Costos T14 = ROUND(T50,−1) | 9,000 | 9,000 ✔ |
| n por pares (AN42:AN45) | [—, 2, 0, 2] → moda 2 | 2 ✔ |

**Coincidencia exacta (tolerancia 1e-9) en las 24 celdas comparadas.**

Estadística que el Excel **no** calcula, pero que la app debería mostrar: mínimo 7,198.67; máximo 10,140.71; rango 2,942.04; desviación estándar muestral 1,100.07; **CV 13.17 %**; mediana 8,240.12.
El **valor adoptado de 9,000 queda +7.74 % sobre el promedio** y por encima de 4 de los 5 homologados. El dato es válido porque es juicio del perito, pero **no hay justificación escrita**. La dispersión de 1.41 es alta: la práctica usual pide ≤ 1.2–1.3, y el perito debe confirmar su criterio.

TU / TU_OFICIAL también se recalcularon y coinciden con su caché: promedios 6,840.11 contra 5,155.75.
Regresión MEH: los coeficientes recalculados con las 20 filas coinciden con los pegados (b0 = 1,891,271.80; edad −7,524.06; …).

---

## 7. Errores y riesgos del Excel

**Críticos (cambian valores):**
1. **TU_OFICIAL**: el factor de superficie está invertido (§5). Hoy no afecta el valor final solo porque T50 se captura a mano.
2. **El valor adoptado no está ligado** (T50/T45/T46/T90 son literales). Casos fuera de rango:
   - TCH: 5,000 contra un rango homologado de 6,941–8,450.
   - TR: 6,900,000 contra 5,315,787–5,936,019.
   - OFICIAL: 7,000 contra 4,803–5,393.
   - TCH además pasa ese 5,000 al enfoque de costos (T14).

   **La app debe exigir la justificación y alertar cuando el adoptado quede fuera de [mín, máx] homologado.**
3. **Z46 (comparable 5, formatos urbanos) ignora el lote tipo**: siempre divide entre F48. En TCH (lote tipo activo), un quinto comparable se homologaría contra 160 m² y los otros cuatro contra 140 m².
4. **Costos, factor lote tipo → sujeto invertido** (`(D18/$D$14)^(1/n)`). En TCH da 1.0455 donde debería dar 0.9565.
5. **MEH FEd**: deprecia el comparable por su propia edad, no usa la edad del sujeto y cuenta dos veces la conservación. AT devuelve **texto**, y si AS está vacío o no es entero de 1 a 10 se produce `#VALUE!`.
6. **Un factor en blanco**: en los urbanos el comparable se **excluye en silencio** (R = " " → T = ""). En TR/TRC un blanco vale 0, R = 0 y **T = 0 entra al promedio y al MIN**, lo que produce una dispersión `#DIV/0!` y un promedio sesgado a la baja.
7. **REAL, sección inmuebles vacía**: R85:R88 = `#VALUE!` y T91/T93/T96/T98/AC84 = `#DIV/0!`, AM89 = `#N/A`. No afecta porque la conclusión dice «NO APLICA», pero la app necesita un estado «sección no aplica».

**Rangos y auxiliares:**
8. Moda de n: TU excluye el par 4v5; TR/TRC duplican el par 1v2 y excluyen 4v5; TRC inmuebles además omite el par 2v3 real (detalle en §3.2). `ROUND(1/x)` puede dar **n = 0** (REAL AN44, TR AI44/45). Con par de superficies iguales el resultado es "" (REAL AL42). **ABS oculta el signo**: en TU/TCH los comparables más grandes son más caros por m², lo que contradice el modelo, y la hoja sugiere n = 2 sin avisar. Si no hay moda, `MODE.SNGL` devuelve `#N/A`.
9. AC41 `IF(R46<>0,…)`: R46 vale " " cuando está vacío, así que la condición siempre es verdadera. No causa error solo porque MAX/MIN ignoran texto.
10. TR/TRC etiquetan la superficie como «(ha)» y guardan m² (P27, F35, F43). En urbanos, T40 dice «$/ha» cuando es $/m². El texto de MEH «Valor Prom. Homologado ($/m²)» es para un equipo.

**Anexos:**
11. **TRC croquis, comparable 4**: U56:U59 apuntan al renglón 23 (comparable 3). Se imprime clasif. zona, fuente hídrica, ubicación y **oferta 2,500,000 del comparable 3** en lugar de 2,100,000.
12. REAL/TCH croquis, rentas: «UBICACIÓN» (D188, P188…) apunta a la columna C de RENTAS, que contiene el número de referencia (imprime «1», «2»…), y los campos vacíos imprimen 0.
13. MEH anexo: `#REF!` en 12 celdas. En todos los formatos las descripciones de factores están cruzadas.
14. El croquis no muestra topografía, servicios, contacto ni fecha. Las fotos y los mapas son imágenes o objetos que no aparecen en el volcado (openpyxl no reporta imágenes, así que probablemente sean formas o marcadores sin contenido que se pegan a mano).

**MEH «Métodos alternativos»:**
15. En la regresión, las filas 99–104 **repiten los comparables 9–14** (mismo ID, precio, edad, horas, HP, tracción y distancia; solo cambia el odómetro). Son 20 observaciones de las cuales 14 son distintas, lo que infla R² y los grados de libertad. Los datos del sujeto son incongruentes con otras hojas: edad 17 contra 14, horas 11,250 contra 8,498, HP 111 contra 101. Los coeficientes son estáticos (pegados), y AI108 apunta a `AR169`, una celda vacía.
16. En costo-capacidad, la ponderación por capacidad (V46) da más peso al comparable más grande, no al más parecido. Además aplica doble depreciación (§5).

**Datos de ejemplo incongruentes** (las plantillas traen datos de prueba; a limpiar antes de migrar):
- TU M42 = 1/1.1 para el comparable 1 (Calle Tipo, 1 frente), mientras el comparable 2 (Calle Superior, 2 frentes) tiene 1.
- TU O44 = 1 con servicios «Incompletos», mientras TCH usa 1/0.95 para el mismo dato.
- TR Q38 = 1.05 para topografía plana.
- Folios, fechas y encabezados cruzados («TRC-001-04-2026» en TU).

---

## 8. Preguntas para el perito

1. **Factor de superficie**: ¿confirma que la fórmula correcta es (S_comparable/S_sujeto)^(1/n) (la de TU) y que la de la versión OFICIAL con macros es un error? ¿Qué versión usa hoy en sus avalúos reales?
2. ¿Cómo elige n? ¿Usa la moda sugerida, un valor fijo (3) o criterio propio (REAL usó 6)? ¿Por qué `ODD()` (solo impares)? ¿Hay un rango permitido de n?
3. **Valor adoptado**: ¿cuál es la regla (promedio, mediana, valor más parecido, redondeo a miles)? ¿Acepta que la app lo proponga automáticamente y le deje sobrescribirlo con justificación? ¿Qué redondeo quiere: −1, −2 o −3?
4. ¿Qué límites usa para cada factor individual, para el factor resultante (p. ej. 0.80–1.20 / 0.65–1.35) y para la dispersión o el CV? ¿Qué hace si se exceden: descarta el comparable o solo justifica?
5. ¿Tiene tablas de calificación estándar (zona, ubicación/esquina, frente, forma, topografía, servicios, uso de suelo, edad, conservación, calidad) o todo es juicio caso por caso? Si las tiene, ¿nos las comparte?
6. Número de comparables: ¿mínimo 3, 4 o 5? ¿Quiere permitir más de 5?
7. **Lote tipo**: cuando lo usa, ¿el valor final del sujeto debe pasar de lote tipo a sujeto con (S_lote_tipo/S_sujeto)^(1/n)? Hoy costos aplica el inverso. ¿Para qué sirven el «frente tipo» y el «fondo tipo» (U37/U38), si no se usan? ¿Quiere factores de frente y fondo calculados?
8. El factor de negociación de 0.95, ¿es fijo o depende del nivel de oferta marcado?
9. Inmuebles (TCH/TRC): ¿la edad y la superficie de terreno del comparable deberían entrar (factor edad, factor conservación con Ross-Heidecke)? Hoy se capturan y no se usan.
10. MEH: ¿el factor de edad debe comparar la vida consumida del sujeto contra la del comparable? ¿Por qué se cuenta la conservación dos veces (tabla AT y FCo)? ¿De qué autor es la fórmula (1 − (E/VUT)^1.4)?
11. MEH métodos alternativos: ¿las filas 99–104 de la regresión son duplicados intencionales? ¿Qué método prevalece en la conclusión (mercado 980,000; costo-capacidad 855,000; regresión 1,400,000)?
12. En REAL, la conclusión dice «NO APLICA» para mercado, pero el terreno homologado alimenta costos. ¿Siempre es así en inmuebles con construcción?
13. ¿Qué campos del comparable son obligatorios para la trazabilidad: link, fecha, teléfono, fotografía, coordenadas? ¿Quiere un mapa con geolocalización en lugar del croquis pegado?

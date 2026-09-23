# 01 · Enfoque de Costos (Físico) + Anexo 4 Indirectos

Fuente: hojas `ENF. COSTOS` y `ANEXO 4. INDIRECTOS` de los libros de Valuadores de los Altos (dump en `scratchpad/dump/`).
Scripts de validación: `metodologia/validar_costos_arandas.py` (50/50 celdas coinciden) y `metodologia/validar_costos_plantillas.py`.

Nombres de hoja por formato:

| Formato | Hoja costos | Hoja indirectos | Celda resultado (consumida por Conclusión) |
|---|---|---|---|
| TU | `V. ENF. COSTOS` | `ANEXO 4. INDIRECTOS` | `U48` |
| TU_OFICIAL | `V. ENF. COSTOS` (veryHidden) | `ANEXO 4. INDIRECTOS` (veryHidden) | `U48` (+ `W50` cifra en letras) |
| TCH | `VI. ENF. COSTOS` (título impreso "VIII. ENFOQUE FÍSICO O DE COSTOS") | `ANEXO 4. INDIRECTOS` | `U69` |
| TR | `V. ENF. COSTOS` | `ANEXO 4. INDIRECTOS` (hidden) | `T64` |
| TRC | `VI. ENF. COSTOS` | `ANEXO 4. INDIRECTOS` | `U84` |
| MEH | `IV. ENF. COSTOS` | — (no existe) | `V61` |
| REAL_ARANDAS (TCH) | `VII. ENF. COSTOS` | `ANEXO 4. INDIRECTOS` (hidden, no se usa) | `U65` |

Notación: `ROUND` = redondeo de Excel (mitad se aleja de cero, **no** redondeo bancario). `""` = celda vacía/texto vacío; en SUM cuenta como 0.

---

## 1. Estructura general del enfoque

```
Valor físico = ROUND( A Terreno + B Construcciones + C IE/EA/OC + [D Bienes distintos a la tierra] + [E Indirectos] , r )
```

| Bloque | TU | TCH | TR | TRC | MEH | REAL_ARANDAS |
|---|---|---|---|---|---|---|
| A Terreno (lote tipo + factores) | sí | sí | por ha, 1 factor | por ha, 1 factor | — | sí |
| B Construcciones | — | sí (5 filas) | — | sí (5 filas) | bien principal | sí (1 fila) |
| C IE/EA/OC | sí (5 filas) | sí (5) | sí (5) | sí (5) | aditamentos (2) | sí (8) |
| D Bienes distintos a la tierra (cultivos) | — | — | sí (5) | sí (5) | — | — |
| E Indirectos (Anexo 4) | sí | sí | sí | sí | — | **eliminado de la suma** |
| Redondeo final | ROUND(-4) | ROUND(-4) | ninguno | ninguno | ROUND(-3) | ROUND(-4) |

---

## 2. Entradas que captura el perito (a)

### 2.1 Terreno urbano (TU / TU_OFICIAL / TCH / REAL_ARANDAS)

| Entrada | Unidad | TU / TU_OF | TCH | REAL_ARANDAS | Observación |
|---|---|---|---|---|---|
| Lote tipo (se elige en Mercado) | m² | `MERCADO!M37` si `I37` marcado, si no `M38` (=sup. sujeto) | igual (`VII. ENF. MERCADO VENTA`) | igual (`VI. ENF. MERCADO VENTA`) | Llega a `D14` |
| Valor homologado a utilizar | $/m² | `'VI. ENF. MERCADO VENTA'!T50` (capturado a mano) | `'VII…'!T50` | `'VI…'!T50` | Llega redondeado a `T14` |
| Superficie del sujeto | m² | `'lll. INF TERRENO'!S42` (¡Superficie *Rentable*!) | `'lll. INF TERRENO'!H40` (Sup. total) | `'lll. INF TERRENO'!H41` (Sup. total) | `D18` |
| Exponente superficie *n* | — | `Y17` = 3 | `Y17` = 3 | `Y17` = 3 | Constante tecleada, no ligada al "coeficiente recomendable" del mercado (`AM48`) |
| F. Negociación | factor | `J18` | `J18` | `J18` | tecleado |
| F. Ubicación | factor | `K18` | `K18` | `K18` | tecleado |
| F. Servicios | factor | `M18` | `M18` | `M18` | tecleado |
| F. Frente ("Fren") / Clasificación ("Clas") | factor | `N18` (`=1/1`) | `N18` (`=1/1`, rotulado "Clas") | `N18` (`=1/1`) | fórmula-constante; el perito sobrescribe |
| F. Topografía | factor | `O18` (`=1/1`) | `O18` | `O18` | ídem |

### 2.2 Terreno rural (TR / TRC)

| Entrada | Unidad | TR | TRC |
|---|---|---|---|
| Valor comparativo de mercado | $/ha | `J14 ='VI. ENF. MERCADO'!T45` | `K14 ='VII. ENF. MERCADO'!T46` |
| Fracción/descripción (3 filas) | texto | `A17:B19` | `B17:C19` |
| Superficie de la fracción | **m²** (el encabezado dice "ha", pero la fórmula divide entre 10 000) | `E17:E19` | `F17:F19` |
| Valor unitario $/ha por fracción | $/ha | `H17 (=J14)`, `H18:H19` a mano | `I17 (=K14)`, `I18:I19` a mano |
| Factor (coeficiente) | factor | `J17:J19` | `K17:K19` |
| Motivo del coeficiente | texto | `K17:K19` | `L17:L19` |

### 2.3 Construcciones (TCH / TRC / REAL_ARANDAS) — filas T-1…T-5

| Entrada | Unidad | TCH (filas 26-30) | TRC (28-32) | REAL (26) |
|---|---|---|---|---|
| Tipo de construcción | texto | `C26` | `C28` | `C26 ='IV. INF CONSTRUCCIONES'!C29` |
| Superficie construida | m² | `K26` | `K28` | `K26 ='IV. INF CONSTRUCCIONES'!Q29` |
| Edad | años | `M26` | `M28` | `M26` (tecleado 2; no ligado a INF `N29`) |
| Vida útil total (VUT) | años | `N26` | `N28` | `N26` (tecleado 70; no ligado a INF `O29`) |
| F. Conservación | factor | `Q26` | `Q28` | `Q26` (0.98 tecleado; INF dice "Bueno") |
| F. Otro | factor | `S26` | `S28` | `S26` |
| Grado de terminación | fracción | `U26` | `U28` | `U26` |
| Indiviso | fracción | `W26` | `W28` | `W26` |
| VRN unitario | $/m² | `L34` (fila de valuación 34-38) | `L36` (36-40) | `L30` |

### 2.4 IE / EA / OC (todos los formatos inmobiliarios) — tabla de captura + tabla de valuación

| Entrada | Unidad | TU (cap. 26-30 / val. 34-38) | TCH (47-51 / 55-59) | TR (29-33 / 37-41) | TRC (49-53 / 57-61) | REAL (39-46 / 50-57) |
|---|---|---|---|---|---|---|
| P/C (Privativa/Común) — captura | P/C | `B26` | `B47` | `A29` | `B49` | `B39` |
| P/C — tabla de valuación (**se vuelve a capturar**, no está ligada) | P/C | `B34` | `B55` | `A37` | `B57` | `B50` |
| Ref. | # | `C26` | `C47` | `B29` | `C49` | `C39` |
| Descripción | texto | `D26` | `D47` | `C29` | `D49` | `D39 =INF!E125…` |
| Unidad | texto | `K26` | `K47` | `J29` | `K49` | `K39` |
| Cantidad | u | `L26` | `L47` | `K29` | `L49` | `L39 =INF!N125…` |
| Edad | años | `M26` | `M47` | `L29` | `M49` | `M39 =INF!O…` |
| Vida útil | años | `N26` | `N47` | `M29` | `N49` | `N39 =INF!P…` |
| F. Conservación | factor | `Q26` | `Q47` | `P29` | `Q49` | `Q39` |
| F. Otro | factor | `S26` | `S47` | `R29` | `S49` | `S39` |
| Grado de terminación | fracción | `U26` | `U47` | `T29` | `U49` | `U39` |
| Indiviso | fracción | `W26` | `W47` | `V29` | `W49` | `W39` |
| VRN unitario | $/unidad | `M34` | `M55` | `L37` | `M57` | `M50` (balcones `=L30`, VRN de la construcción) |

### 2.5 Bienes distintos a la tierra / cultivos (TR, TRC) — 5 filas

| Entrada | Unidad | TR (53-57) | TRC (73-77) |
|---|---|---|---|
| Cultivo | texto | `B53` | `C73` |
| Unidad | texto | `H53` | `I73` |
| Cantidad | u | `I53` | `J73` |
| Edad | años | `J53` | `K73` |
| Vida útil | años | `K53` | `L73` |
| VRN unitario | $/u | `L53` | `M73` |
| F. Conservación | factor | `N53` | `O73` |
| F. Riesgo | factor | `P53` | `Q73` |

### 2.6 Maquinaria y equipo (MEH)

| Entrada | Unidad | Celda |
|---|---|---|
| Costo en moneda de origen | moneda | `M28 ='ll. DATOS'!G54` |
| Tipo de cambio | MXN/moneda | `'ll. DATOS'!G30` (17.65) |
| Factor "Otro" sobre cotización | factor | `U28` |
| % Gastos aduanales, fletes, seguros, ingenierías, instalación, otros | fracción | `C34, F34, I34, K34, M34, O34` |
| Calificación de conservación 1-10 | entero | `A41 ='ll. DATOS'!G195` (moda de las X marcadas en `'ll. DATOS'!G178:P193`) |
| Edad | años | `F42 ='ll. DATOS'!H97` |
| Vida útil total | años | `H42 ='ll. DATOS'!H99` |
| F. Conservación FCo | factor | `L42` (tecleado) |
| F. Mantenimiento FMt | factor | `N42` |
| Obsolescencia tecnofuncional FOt | factor | `Q42` |
| Obsolescencia económica FOe | factor | `S42` |
| Aditamentos: cotización MXN | $ | `R50:R51` |
| Aditamentos: % F.E.E.S., Ing., Instal. | fracción | `D56:H57` |
| Aditamentos: edad, VUT, FCo, FMt, Obs. | años/factor | `M56:N57`, `Q56:T57` |
| % participación por componente | fracción | `M68, M70, M72, M74, M76, M80` |
| Horas/Km sujeto y nominal | h/km | `Q70`, `T70` |

### 2.7 Anexo 4 · Indirectos (idéntico en TU, TU_OF, TCH, TR, TRC, REAL)

| Concepto | Unidad | % (cantidad) | Base "V.N.R. de las construcciones" |
|---|---|---|---|
| Proyecto ejecutivo | % | `H16` | `J16` |
| Costo financiero | % | `H17` | `J17` |
| Utilidad de inversión en el proyecto | % | `H18` | `J18` |
| Escrituración de terreno | % | `H19` | `J19` |
| Administración | % | `H20` | `J20` |

`H16:H20` tienen formato **General** → el perito debe teclear `0.05` para 5 % (si teclea `5` multiplica por 5). `J16:J20` son **captura manual** (formato moneda), no están ligadas al VNR calculado.

---

## 3. Cálculos derivados en orden de dependencia (b)

Se documenta con la numeración de TCH y se indica la celda equivalente por formato.

### 3.1 A) Terreno urbano

| # | Fórmula legible | Excel (TCH / TU / REAL) |
|---|---|---|
| A1 | `LoteTipo = (marcado "Lote tipo") ? M37 : SupSujeto` | `D14 =IF('…MERCADO VENTA'!I37<>0,'…'!M37,'…'!M38)` |
| A2 | `Vc = ROUND(ValorHomologadoMercado, -1)` | `T14 =ROUND('…MERCADO VENTA'!T50,-1)` |
| A3 | `Vu = Vc` | `G18 =T14` |
| A4 | `Fsup = (S / LoteTipo)^(1/n)` (TU, TCH, REAL) — **en TU_OFICIAL: `(LoteTipo / S)^(1/n)`** | `Y18 =IFERROR((D18/$D$14)^(1/$Y$17),"")`; TU_OF: `=IFERROR((D14/$D$18)^(1/$Y$17),"")` |
| A5 | `L18 = Fsup` | `L18 =Y18` |
| A6 | `FRe = Fneg·Fubi·Fsup·Fser·Ffre·Ftop` (si producto = 0 → `" "`) | `P18 =IF(J18*K18*L18*M18*N18*O18<>0,J18*K18*L18*M18*N18*O18," ")` |
| A7 | `VuNeto = FRe · Vu` | `R18 =P18*G18` |
| A8 | `VpTerreno = VuNeto · S` | `U18 =R18*D18` |
| A9 | `Sup. valuada = S`; `V. unit. medio = VuNeto` | `F20 =D18`, `N20 =R18` |
| A10 | **`A = ROUND(VpTerreno, -4)`** (REAL: **-2**) | `V20 =ROUND(U18,-4)`; REAL `V20 =ROUND(U18,-2)` |

### 3.2 A) Terreno rural (TR; TRC entre corchetes)

| # | Fórmula | Excel |
|---|---|---|
| R1 | `Vu_i = Vc` (solo fila I) | `H17 =J14` [`I17 =K14`] |
| R2 | `VuRes_i = F_i · Vu_i` | `Q17 =IFERROR(J17*H17,"")` [`R17 =IFERROR(K17*I17,"")`]; **filas II-III usan columna equivocada**: `Q18 =IFERROR(L18*H18,"")` [`R18 =IFERROR(M18*I18,"")`] |
| R3 | `Vp_i = VuRes_i · Sup_i / 10 000` | `T17 =IFERROR(Q17*E17/10000,"")` [`U17 =IFERROR(R17*F17/10000,"")`] |
| R4 | `SupTotal = Σ Sup_i`; `Subtotal = Σ Vp_i` | `E20 =SUM(E17:G19)`, `T20 =SUM(T17:V19)` [`F20`, `U20`] |
| R5 | **`A = Subtotal`** (sin redondeo) | `U22 =T20` [`V22 =U20`] |
| R6 | `V. unit. medio ($/ha) = A / SupTotal · 10 000` | `M22 =(U22/E22)*10000` [`N22 =(V22/F22)*10000`] |

### 3.3 B) Construcciones (TCH filas 26/34; TRC 28/36; REAL 26/30)

| # | Fórmula | Excel (TCH) |
|---|---|---|
| C1 | `VUR = VUT − E` (si 0 → vacío; solo informativo) | `O26 =IF(N26-M26<>0,N26-M26,"")` |
| C2 | **`Fed = 1 − (E / VUT)^1.4`** | `R26 =IFERROR(1-((M26/N26)^1.4),"")` |
| C3 | `FRe = Fco · Fed · Fotro` | `T26 =IFERROR(Q26*R26*S26,"")` |
| C4 | `Sup = K26` | `J34 =IF(K26<>0,K26,"")` (REAL: `J30 =K26`) |
| C5 | `VRN parcial = VRNu · Sup` | `N34 =IFERROR(L34*J34,"")` |
| C6 | `Q34 = FRe` | `Q34 =T26` |
| C7 | `VNRu = FRe · VRNu` | `S34 =IFERROR(Q34*L34,"")` |
| C8 | `VNR parcial = VNRu · Sup · GradoTerm · Indiviso` | `V34 =IFERROR(S34*J34*U26*W26,"")` |
| C9 | `SupTotal = Σ Sup`; `Subtotal = Σ VNR parcial` | `J39 =SUM(J34:K38)`, `V39 =SUM(V34:W38)` |
| C10 | **`B = ROUND(Subtotal, -4)`** (TCH, REAL); **TRC sin redondeo** `V43 =V41` | `V41 =ROUND(V39,-4)`; REAL `V33 =ROUND(V31,-4)` |
| C11 | `V. unit. medio = B / SupTotal` (usa el valor ya redondeado en TCH/REAL) | `N41 =V41/F41`; REAL `N33 =V33/F33`; TRC `N43 =V43/F43` |

### 3.4 C) IE / EA / OC (TU filas 26→34; TCH 47→55; TR 29→37; TRC 49→57; REAL 39→50)

| # | Fórmula | Excel (TU) |
|---|---|---|
| I1 | `VUR = VU − E` (informativo) | `O26 =IF(N26-M26<>0,N26-M26,"")` |
| I2 | `Fed = 1 − (E/VU)^1.4` | `R26 =IFERROR(1-((M26/N26)^1.4),"")` |
| I3 | `FRe = Fco · Fed · Fotro` | `T26 =IFERROR(Q26*R26*S26,"")` |
| I4 | Copias: descripción, unidad, cantidad | `D34 =IF(D26<>0,D26,"")`, `K34 =IF(K26<>0,K26,"")`, `L34 =IF(L26<>0,L26,"")` |
| I5 | `VRN parcial = Cant · VRNu` | `O34 =IFERROR(L34*M34,"")` |
| I6 | `R34 = FRe` (si 0 → vacío) | `R34 =IF(T26<>0,T26,"")` |
| I7 | `VNRu = FRe · VRNu` | `S34 =IFERROR(R34*M34,"")` |
| I8 | `VNR parcial = VNRu · Cant · Indiviso · GradoTerm` | `V34 =IFERROR(S34*L34*W26*U26,"")` |
| I9 | `Σ Privativa = Σ VNR parcial donde P/C="P"` | `V40 =SUMIFS($V$34:$V$38,$B$34:$B$38,X40)` (X40="P") |
| I10 | `Σ Común = Σ … donde P/C="C"` (SUMIFS no distingue mayúsculas; X41="c") | `V41 =SUMIFS($V$34:$V$38,$B$34:$B$38,X41)` |
| I11 | `Subtotal = Σ VNR parcial` (todas, sin importar P/C) | `V42 =SUM(V34:W39)` |
| I12 | **`C = Subtotal`** (TU, TR, TRC: sin redondeo) / **`ROUND(Subtotal,-3)`** (TCH, REAL) | TU `V44 =V42`; TCH `V65 =ROUND(V63,-3)`; REAL `V63 =ROUND(V61,-3)`; TR `U47 =U45`; TRC `V67 =V65` |

Las sumas privativa/común son **informativas**: el total usa el subtotal completo.

### 3.5 D) Bienes distintos a la tierra (TR 53-57; TRC 73-77)

| # | Fórmula | Excel (TR) |
|---|---|---|
| D1 | `Fed = 1 − (E/VU)^1.4` | `O53 =IFERROR(1-((J53/K53)^1.4),"")` |
| D2 | `FRe = Fco · Fed · Friesgo` | `Q53 =IFERROR(N53*O53*P53,"")` |
| D3 | `VNRu = FRe · VRNu` | `R53 =IFERROR(Q53*L53,"")` |
| D4 | `VNR parcial = VNRu · Cant` (sin grado de terminación ni indiviso) | `U53 =IFERROR(R53*I53,"")` |
| D5 | `D = Σ` (sin redondeo) | `U58 =SUM(U53:V57)`, `U60 =U58` [TRC `V78`, `V80`] |

### 3.6 E) Indirectos (Anexo 4)

| # | Fórmula | Excel |
|---|---|---|
| E1 | `Ind_k = %_k · Base_k` | `R16 =H16*J16` … `R20 =H20*J20` |
| E2 | `E = Σ Ind_k` | `R21 =SUM(R16:U20)` |
| E3 | Traslado a costos | TU `V46`, TCH `V67`, TR `U62`, TRC `V82` `='ANEXO 4. INDIRECTOS'!R21`; REAL: no existe |

### 3.7 Valor físico total

| Formato | Fórmula | Excel |
|---|---|---|
| TU / TU_OF | `ROUND(A + C + E, -4)` | `U48 =ROUND(V20+V44+V46,-4)` |
| TCH | `ROUND(A + B + C + E, -4)` | `U69 =ROUND(V20+V41+V65+V67,-4)` |
| REAL | `ROUND(A + B + C, -4)` | `U65 =ROUND(V20+V33+V63,-4)` |
| TR | `A + C + D + E` (sin redondeo) | `T64 =U22+U47+U60+U62` |
| TRC | `A + B + C + D + E` (sin redondeo) | `U84 =V22+V43+V67+V80+V82` |
| MEH | `ROUND(VNR bien + VNR aditamentos, -3)` | `V61 =ROUND(W42+V59,-3)` |

### 3.8 MEH – cálculo del bien

| # | Fórmula | Excel |
|---|---|---|
| M1 | `CotMXN = CostoOrigen · TC` | `R28 =M28*'ll. DATOS'!G30` |
| M2 | `VRNu = CotMXN · Fotro` | `W28 =R28*U28` |
| M3 | `ΣGastos% = aduana+fletes+seguros+ing.+instal.+otros` | `U34 =C34+F34+I34+K34+M34+O34` |
| M4 | `VRN instalado = VRNu · (1 + ΣGastos%)` | `W34 =W28*(1+U34)` |
| M5 | Montos informativos de gastos (aduana y fletes sobre `R28`, resto sobre `W28`) | `C35 =C34*R28`, `F35 =F34*R28`, `I35 =I34*W28`, `K35`, `M35`, `O35`, `T35 =U34*W28` |
| M6 | `Fcal = Tabla(calificación)` (texto concatenado, ver §4) | `B41 =IF(A41=10,1," ")&IF(A41=9,0.99," ")&…` |
| M7 | **`FEd = (1 − (E/VUT)^1.4) · Fcal`** (ya incluye conservación) | `B38 =(1-((F42/H42)^1.4))*B41` |
| M8 | `J42 = FEd` | `J42 =B38` |
| M9 | **`FRe = FEd · FCo · FMt · FOt · FOe`** (FCo aplica conservación **otra vez**) | `U42 =J42*L42*N42*Q42*S42` |
| M10 | `VNR bien = FRe · VRN instalado` | `W42 =U42*W34`, `V44 =SUM(V41:X42)` |
| M11 | Aditamento: `ΣG = F.E.E.S.+Ing.+Instal.` | `J56 =SUM(D56:I56)` |
| M12 | `VRN inst. = Cot · (1 + ΣG)` | `K56 =R50+(J56*R50)` |
| M13 | `VUR = VUT − E`; **`FEd = VUR / VUT` (lineal)** | `O56 =N56-M56`, `P56 =(N56-M56)/N56` |
| M14 | `FRe = FEd·FCo·FMt·Obs.T·Obs.E`; `VNR = VRN inst.·FRe` | `U56 =P56*Q56*R56*S56*T56`, `V56 =K56*U56` |
| M15 | `Σ aditamentos` | `V59 =SUM(V56:X57)` |
| M16 | **Valor físico = ROUND(VNR bien + Σ adit., -3)** | `V61 =ROUND(W42+V59,-3)` |
| M17 | Participación: `J_k = V61 · %_k`; `%adit = V59/V61`; `Σ% = SUM(M68:M80)` | `J68 =$J$82*M68` …, `M78 =V59/V61`, `M82 =SUM(M68:M80)` |
| M18 | Factor uso rodaje `= 1 − HrsSujeto/HrsNominal` (no se usa en ningún cálculo) | `X70 =1-(Q70/T70)` |
| — | Celdas auxiliares sin uso: `B34 =1-F42/(F42+H42)`, `B35 =(H42-F42)/H42` | — |

Además en `'ll. DATOS'`: `G194:P194 =COUNTIF(col178:col193,"x")` y `G195 =INDEX(G177:P177,1,MATCH(MAX(G194:P194),G194:P194,0))` → **moda** (rotulada "calificación promedio"; en empate gana la calificación más baja).

---

## 4. Constantes y tablas de referencia (c)

| Constante | Valor | Dónde |
|---|---|---|
| Exponente de edad | **1.4** en `1 − (E/VU)^1.4` | construcciones, IE, cultivos, bien MEH |
| Exponente superficie terreno | `n = 3` → `^(1/3)` | `Y17` |
| Conversión m² → ha | ÷ 10 000 | TR/TRC |
| Criterios P/C | `"P"`, `"c"` | `X40/X41` (TU) etc. Comentario: "NO BORRAR PARA QUE HAGA LA SUMA BIEN" |
| Tipo de cambio (MEH) | 17.65 | `'ll. DATOS'!G30` |

**Tabla de conservación MEH (calificación 1-10 → factor y leyenda)** — `IV. ENF. COSTOS!B41` y `'ll. DATOS'!H195` (también en `V. ENF. MERCADO!AT81:AT85`):

| Calif. | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|
| Factor | 1 | 0.99 | 0.975 | 0.92 | 0.82 | 0.66 | 0.47 | 0.25 | 0.10 | 0 |
| Leyenda | Nuevo | Excelente | Muy bueno | Bueno | Regular | Deficiente | Malo | Muy malo | Ruinoso | Chatarra |

**Inmuebles:** no hay tabla de conservación ni de vidas útiles en los libros. Los factores de conservación (0.98, 0.975) y las vidas útiles (70, 30, 20, 10) se teclean. En REAL_ARANDAS la hoja INF CONSTRUCCIONES anota "Vidas útiles de Indaabin y ASA" (`Y125`) pero la tabla no existe en el libro. Mapeo observado: "Bueno" → 0.98 en construcción y 0.975 en IE (inconsistente).

**Participación MEH** (tecleados): Chasis 0.25, Rodaje 0.20, Cabina 0.10, Motor 0.12, Mangueras 0.05, Otros 0.08, Aditamentos = V59/V61.

---

## 5. Redondeos exactos (d)

Solo se usa `ROUND` (no hay MROUND, CEILING, FLOOR, TRUNC ni INT). Excel redondea mitades **alejándose de cero** (usar `Decimal ROUND_HALF_UP`, nunca `round()` de Python/`Math.round` sin cuidado con negativos/flotantes). Caso real: REAL_ARANDAS `V20+V33+V63 = 8 575 000` → `ROUND(-4)` = **8 580 000** (mitad exacta).

| Celda | Qué | TU / TU_OF | TCH | REAL | TR | TRC | MEH |
|---|---|---|---|---|---|---|---|
| Valor comparativo de mercado | `ROUND(T50,-1)` | `T14` | `T14` | `T14` | — | — | — |
| A Terreno | | `ROUND(-4)` `V20` | `ROUND(-4)` `V20` | **`ROUND(-2)`** `V20` | ninguno | ninguno | — |
| B Construcciones | | — | `ROUND(-4)` `V41` | `ROUND(-4)` `V33` | — | ninguno | — |
| C IE/EA/OC | | **ninguno** `V44` | `ROUND(-3)` `V65` | `ROUND(-3)` `V63` | ninguno | ninguno | — |
| D Cultivos | | — | — | — | ninguno | ninguno | — |
| E Indirectos | | ninguno | ninguno | — | ninguno | ninguno | — |
| Valor físico | | `ROUND(-4)` `U48` | `ROUND(-4)` `U69` | `ROUND(-4)` `U65` | **ninguno** | **ninguno** | `ROUND(-3)` `V61` |

Consecuencia: en TCH/REAL hay **doble redondeo** (parciales y total); el valor unitario medio de construcción (`N41`, `N33`) se calcula sobre el valor redondeado.
Para igualdad bit a bit con Excel, respetar el orden de multiplicación de cada fórmula (ej. `S*J*U*W`, no reordenar); con reordenamiento hay diferencias en el último dígito (visto en TRC `U84`: 6509348.219682157 vs 6509348.219682156).

---

## 6. Diferencias entre formatos (e)

1. **Factor de superficie invertido entre TU y TU_OFICIAL.** TU/TCH/REAL: `(S/LoteTipo)^(1/3)`; TU_OFICIAL: `(LoteTipo/S)^(1/3)`. En TCH (S=160, lote tipo 140) da 1.0455 (el lote *mayor* sube de valor). Con la orientación de TU_OFICIAL el factor sería 0.9564 y el valor físico de TCH bajaría de 3 740 000 a **3 680 000**. En TU y REAL no se nota porque el lote tipo = superficie del sujeto (factor 1).
2. **Superficie del sujeto**: TU/TU_OF usa `INF TERRENO!S42` (Superficie rentable); TCH `H40` y REAL `H41` (Superficie total); el mercado de TU usa `H42` (total).
3. **Rótulo del factor N**: TU "Fren" (frente); TCH/REAL "Clas" (clasificación).
4. **Redondeos**: ver §5 (TU no redondea IE; TCH sí; TR/TRC no redondean nada; REAL cambió terreno a -2).
5. **Indirectos**: presentes en TU/TCH/TR/TRC; REAL eliminó la línea de la suma; MEH no tiene anexo.
6. **Terreno rural**: sin lote tipo ni factores individuales; un solo coeficiente por fracción; superficie capturada en m² aunque diga ha.
7. **Bienes distintos a la tierra** solo en TR/TRC, con factor "Riesgo" en lugar de "Otro" y sin grado de terminación/indiviso.
8. **MEH** es otra metodología: VRN por cotización × tipo de cambio × (1+gastos), factor de edad × tabla de calificación × FCo × FMt × obsolescencias; aditamentos con depreciación **lineal** (VUR/VUT) en vez de exponente 1.4.
9. **TU_OFICIAL** añade `W50 =CIFRAENLETRAS!I20` (cifra en letras) y está oculto (veryHidden); fuera de eso idéntico a TU.
10. **REAL_ARANDAS** (derivado de TCH): liga descripción/sup. de construcción e IE a `IV. INF CONSTRUCCIONES`, reduce construcciones a 1 fila, IE a 8 filas, balcones valuados al VRN de la construcción (`M52 =L30`).
11. Encabezados de fecha: TU apunta a `'ll. DATOS'!G23/R23`, TCH/TRC/REAL a `G22/R22`, TR a `G20/R20`, MEH a `G21/R21` (estructura de DATOS distinta por formato).
12. Letras de sección: TR rotula "C)" tanto a IE como a Bienes distintos (debería ser B y C); TCH imprime "VIII." aunque la pestaña es "VI.".

---

## 7. Validación con REAL_ARANDAS (f)

Script: `metodologia/validar_costos_arandas.py`. Entradas tomadas de la hoja (valores tecleados y referencias resueltas); se recalculó con la especificación de §3 usando `ROUND_HALF_UP`.

**Resultado: 50 / 50 celdas coinciden** (tolerancia relativa 1e-12).

| Concepto | Celda | Recalculado | Caché |
|---|---|---|---|
| Valor comparativo | T14 | 9 000 | 9 000 |
| Factor superficie | Y18 | 1 (lote tipo = sujeto 169.78) | 1 |
| Valor parcial terreno | U18 | 1 528 020 | 1 528 020 |
| **A Terreno** (ROUND -2) | V20 | 1 528 000 | 1 528 000 |
| Fed T-1 (2/70) | R26 | 0.993108643 | 0.993108643 |
| VNR parcial T-1 | V30 | 6 531 386.08 | 6 531 386.08 |
| **B Construcciones** (ROUND -4) | V33 | 6 530 000 | 6 530 000 |
| Σ IE (8 partidas) | V61 | 516 865.31 | 516 865.31 |
| **C IE** (ROUND -3) | V63 | 517 000 | 517 000 |
| **Valor físico** (ROUND -4) | U65 | 8 580 000 | 8 580 000 |

Sensibilidad: sin ningún redondeo intermedio el total sería 8 576 271.39; con redondeos intermedios la suma es 8 575 000 exacta y el ROUND medio-arriba la lleva a 8 580 000 (un redondeo bancario daría el mismo resultado aquí sólo por casualidad: 857.5 → 858 par).

Validación adicional contra plantillas (`validar_costos_plantillas.py`): TU `U48`=1 050 000 ✔, TCH `U69`=3 740 000 ✔, TR `T64`=2 767 708.27 ✔, TRC `U84`=6 509 348.22 ✔, MEH `W42`=740 788.90 ✔ y `V61`=933 000 ✔ (reproducido **sólo** aplicando la conservación dos veces).

---

## 8. Posibles errores en las fórmulas del Excel (g)

**Alta prioridad (cambian el valor)**

1. **MEH – conservación aplicada dos veces.** `B38 =(1-((F42/H42)^1.4))*B41` ya multiplica por el factor de tabla (0.975), y `U42 =J42*L42*…` vuelve a multiplicar por `L42` = 0.975. Valor físico actual 933 000; con una sola aplicación sería **952 000** (+2 %). Además la columna se rotula "Factor Edad FEd" pero contiene edad×conservación.
2. **Factor de superficie invertido** en TU/TCH/REAL vs TU_OFICIAL (ver §6.1). Con lote tipo ≠ sujeto el valor cambia (TCH: 3 740 000 vs 3 680 000). Además `Y18` en TU_OF usa `D14` sin `$` (inofensivo) y `Y17=3` no está ligado al coeficiente recomendado por el mercado.
3. **TR/TRC – filas II y III del terreno apuntan a la columna equivocada**: TR `Q18 =IFERROR(L18*H18,"")`, `Q19` (el factor está en `J`); TRC `R18 =IFERROR(M18*I18,"")`, `R19` (el factor está en `K`). Cualquier segunda/tercera fracción vale **0** aunque se capture factor.
4. **Tabla de valuación de IE con P/C tecleado, no ligado**: la fila 2 de captura dice "C" (TU `B27`, TCH `B48`, TR `A30`) pero la tabla de valuación dice "P" (`B35`, `B56`, `A38`) → un elemento común se suma como privativo. Además, la separación P/C no afecta al total (el subtotal suma todo), sólo informa.
5. **Cantidad tecleada sobre fórmula** en la tabla de valuación: TU `L35`, TCH `L56`, TR `K38`, TRC `L58`, REAL `L51` y `L55` = 1 fijo en lugar de `=IF(L27<>0,L27,"")`. Si el perito cambia la cantidad en la captura, el VNR no cambia. REAL `K57` = "Pza" tecleado (captura dice "Lote").
6. **REAL – edades de IE desfasadas**: `M41 =INF!O129` (debería O127), `M42 =O130` (O128), `M43 =O131` (O129); `M45`, `M46` tecleados 2 (sin liga). Hoy no afecta porque todas las edades son 2, pero es una referencia rota latente.
7. **Factor de edad sin tope**: si Edad > Vida útil, `1-(E/VU)^1.4` es **negativo** → VNR negativo; si Edad = VU, `O` queda vacío y `R`=0 → `R34 =IF(T26<>0,…,"")` deja la partida en blanco (vale 0). No hay valor residual mínimo.
8. **TCH plantilla – captura desconectada de INF CONSTRUCCIONES**: INF dice conservación "Regular", grado de terminación 0.75 (`H21`) e IE "Aire acondicionado"; costos usa 0.98, `U26`=1 y malla/bomba. En plantillas todo el bloque de construcciones/IE se vuelve a teclear (doble captura).
9. **Anexo 4**: base `J16:J20` tecleada (no ligada al VNR de construcciones); % en formato General (riesgo de teclear 5 en vez de 0.05); en TU (sin construcciones) la base "VNR de las construcciones" no tiene sentido; REAL la omitió de la suma.
10. **`P18` devuelve `" "`** (espacio) si algún factor es 0 → `R18 =P18*G18` da `#VALUE!` y rompe todo el enfoque.

**Media/baja**

11. TU usa Superficie *rentable* (`S42`) en vez de total (`H42`) para el terreno.
12. MEH `B41`/`H195` construyen el factor por **concatenación de texto** (`'  0.975       '`) que Excel convierte a número al multiplicar; frágil (una calificación fuera de 1-10 da texto vacío → `#VALUE!`).
13. MEH "calificación promedio" es en realidad la **moda** (en empate, la calificación menor).
14. MEH `C35`/`F35` calculan gastos sobre `R28` y el resto sobre `W28` (difieren si `U28≠1`); los montos son informativos (el VRN usa `U34`).
15. MEH participaciones: `M82 = 1.0062` (≠ 100 %) porque los % fijos suman 0.80 y el de aditamentos es dinámico; `X70` (factor de uso por horas) no se usa en ningún cálculo; `B34`, `B35` celdas huérfanas.
16. MEH aditamentos: depreciación lineal (`(VUT−E)/VUT`) distinta a la del bien (exponente 1.4).
17. `N41`/`N33` (valor unitario medio de construcción) se calcula con el valor ya redondeado.
18. TCH `N35:N38 =IFERROR(L35*J35,"")` devuelven 0 en filas vacías (inofensivo); `J34 =IF(K26<>0,K26,"")` vs REAL `J30 =K26`.
19. T50 del mercado (valor homologado a usar) es tecleado: en TCH 5 000 vs promedio homologado 7 561.82 — el enfoque de costos hereda esa decisión sin trazabilidad (área de mercado, se señala por impacto).
20. Rótulos: TR superficie "(ha)" pero se captura en m²; letras "C)" duplicadas en TR; TCH "VIII." vs pestaña "VI.".

---

## 9. Preguntas para el perito valuador (h)

1. **Factor de superficie**: ¿cuál es la orientación correcta, `(LoteTipo/Sujeto)^(1/n)` (TU_OFICIAL) o `(Sujeto/LoteTipo)^(1/n)` (TU/TCH)? ¿El exponente n debe ser siempre 3 o tomarse del "coeficiente recomendable" calculado en mercado?
2. **Factor de edad** `1 − (E/VU)^1.4`: ¿qué método es (nombre/fuente)? ¿Debe tener valor residual mínimo (p.ej. 10–20 %) o tope cuando la edad ≥ vida útil? ¿Aplicar lo mismo a cultivos (agave) y a aditamentos MEH (hoy lineal)?
3. **Conservación en inmuebles**: ¿existe tabla oficial (Bueno, Regular, …) → factor? Hoy "Bueno" se usa como 0.98 en construcción y 0.975 en IE. ¿Qué tabla de vidas útiles (INDAABIN/ASA) quieren precargar?
4. **MEH**: ¿la conservación debe aplicarse una vez (tabla por calificación) o también el `FCo` manual? ¿La "calificación promedio" debe ser moda, promedio o mediana?
5. **Redondeos**: ¿la app debe respetar los redondeos actuales (terreno -4, construcciones -4, IE -3, total -4; rurales sin redondeo; MEH -3)? ¿Por qué REAL_ARANDAS redondea terreno a centenas? ¿TU debería redondear IE a miles como TCH?
6. **Indirectos**: ¿cuándo se aplican? ¿La base debe ser automáticamente el VNR de construcciones (B) o (B+C)? ¿Los % se capturan como fracción? ¿Aplican en terreno sin construcción (TU)?
7. **P/C e indiviso**: ¿las partidas comunes deben sumarse al valor del sujeto multiplicadas por el indiviso, o sólo informarse? ¿Deben separarse privativas y comunes en el total?
8. **Grado de terminación**: ¿se aplica sólo al VNR (hoy no afecta al VRN parcial)? En TCH plantilla INF dice 0.75 y costos 1: ¿cuál manda?
9. **Terreno rural**: ¿la superficie se captura en m² o ha? ¿Las fracciones II/III deben usar su factor (hoy salen en 0 por error de referencia)? ¿Se requieren factores individuales (agua, suelo, acceso) como en urbano?
10. **Superficie del terreno urbano**: ¿superficie total o rentable/vendible?
11. **Factor N**: ¿es "Frente" o "Clasificación"? ¿Falta forma, frente y fondo como factores separados?
12. **Balcones y similares** valuados con el VRN de la construcción principal: ¿es criterio estándar?
13. **MEH participaciones**: ¿los porcentajes deben sumar 100 % (reescalar al incluir aditamentos)? ¿Se usa el factor por horas `1 − Hs/Hn`?
14. ¿La captura de construcciones/IE debe venir siempre de `IV. INF CONSTRUCCIONES` (una sola captura), incluyendo edad, VUT y conservación?

# 04 · Estructura, conclusión, CIFRAENLETRAS y MEH — Valuadores de los Altos

Alcance: todo lo que NO es el cálculo de costos, mercado u homologación ni ingresos: carátula, datos generales, terreno, construcciones, consideraciones, conclusión y conciliación, anexos, términos, CIFRAENLETRAS, cómo se conectan las hojas, MEH completo (incluida METODOS ALTERNATIVOS), catálogos, errores y preguntas.

Fuentes: los dumps `scratchpad/dump/<FMT>/*.txt` y los originales `/Users/brangarciaramos/Documents/Avaluos/*.xls*`, que se leyeron con openpyxl sin modificarlos.
Herramientas reproducibles en `scratchpad/metodologia/tools/`:

| Archivo | Qué hace |
|---|---|
| `cifraenletras.py` | Transliteración 1:1 de la hoja CIFRAENLETRAS. Reproduce también sus defectos. |
| `verify_cifra.py` | Compara la réplica contra **todas** las celdas en caché: **18/18 OK**. |
| `diff_tu.py` | Diff celda a celda de TU contra TU_OFICIAL (fórmulas y caché). |
| `deps.py` | Extrae las referencias entre hojas (grafo de dependencias). |
| `dv.py`, `comments.py`, `notes_full.py` → `notes_merged.json` | Validaciones de datos, notas de celda (406) y celdas combinadas de los 7 libros. |

Abreviaturas de formato: **TU** (terreno urbano), **TUO** (TU OFICIAL .xlsm), **TCH** (terreno urbano con casa habitación), **TR** (terreno rural), **TRC** (terreno rural con construcción), **MEH** (maquinaria y equipo pesado), **RA** (avalúo real "Dptos Arandas", basado en TCH).

---

## (a) Matriz formato × hoja/enfoque

Números romanos = nombre real de la pestaña. ✔ = existe y se imprime. (h) = hoja oculta. (vh) = *veryHidden*: TUO oculta todo hasta que la macro de licencia lo activa. — = no existe.

| Hoja / enfoque | TU | TUO | TCH | TR | TRC | MEH | RA |
|---|---|---|---|---|---|---|---|
| Términos y Condiciones (licencia de la plantilla) | ✔ | ✔ (única visible) | ✔ | (h) | ✔ | ✔ | — |
| l. CARÁTULA | ✔ | vh | ✔ | ✔ | ✔ | ✔ (datos del bien) | ✔ |
| ll. DATOS generales | ✔ urbano | vh | ✔ urbano | ✔ rural (región + sistema natural) | ✔ rural | ✔ MEH (incluye la inspección física y la calificación) | ✔ urbano |
| lll. INF TERRENO | ✔ (incluye la tabla IE/EA/OC) | vh | ✔ | ✔ rural (incluye la tabla IE/EA/OC) | ✔ rural | — | ✔ |
| IV. INF CONSTRUCCIONES | — | — | ✔ | — | ✔ | — | ✔ |
| CONSIDERACIONES | IV | IV (vh) | V | IV (+ definiciones agro) | V (+ agro) | III (definiciones MEH) | V |
| Enfoque de COSTOS / físico | V | V | VI | V | VI | IV | VII |
| Enfoque de MERCADO (venta) | VI (terrenos) | VI | VII (terrenos + inmuebles) | VI (terrenos rurales) | VII (terrenos + inmuebles) | V (bienes similares) | VI (visible, "NO APLICA" en la conclusión) |
| MERCADO DE RENTAS | dentro de VII | dentro de VII | VIII | dentro de VII | — | — | VIII (h) |
| Enfoque de INGRESOS | VII | VII | IX | VII | — ("NO APLICA") | — | IX (h) |
| MÉTODOS ALTERNATIVOS | — | — | — | — | — | ✔ (6 métodos) | — |
| CONCLUSIÓN | VIII | VIII | X | VIII | VIII | X | VIII |
| Anexo 1 · Fotografías del sujeto | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Anexo · Planos arquitectónicos | — | — | — | — | — | — | ✔ ("ANEXO 2. PLANOS ARQ", solo imágenes) |
| Anexo 2 · Croquis y fotos de comparables | ✔ | ✔ | ✔ (terrenos, inmuebles en venta y en renta) | ✔ | ✔ | — (las fotos están en V) | (h) |
| Anexo 3 · Factores de homologación (texto) | ✔ | ✔ | ✔ | ✔ | ✔ | ANEXO 2 | (h) |
| Anexo 4 · Indirectos | ✔ | ✔ | ✔ | (h) | ✔ | — | (h) |
| CIFRAENLETRAS | (h) 1 bloque | vh, 4 bloques | (h) 1 | (h) 1 | (h) 1 | visible, 9 bloques | (h) 1 |
| SystemConfig / SysAppInfo (licencia VBA) | — | vh | — | — | — | — | — |
| **Enfoque que llega a la carátula** | Mercado | Mercado | Mercado | Mercado | Mercado | Mercado | **Costos** |

Enfoques por tipo, para el constructor de formularios:
- **TU / TR** (terreno solo): costos (terreno + IE/EA/OC), mercado de terrenos e ingresos (rentas de terreno).
- **TCH**: costos (terreno + construcciones + IE), mercado (terrenos para el valor de suelo e inmuebles para el valor del conjunto), mercado de rentas e ingresos.
- **TRC**: costos, mercado de terrenos rurales e inmuebles. No tiene ingresos.
- **MEH**: costos (VRN → VNR), mercado (comparables homologados, mediana) y métodos alternativos. En la conclusión, el tercer renglón es "Costo‑Capacidad".
- **RA**, que es la instancia real: solo costos. Mercado e ingresos se marcan como "NO APLICA" y llevan un texto que lo justifica (Conclusión B54).

---

## (b) Hojas no‑cálculo: campos por sección

Convenciones:
- *Tipo*: `texto`, `texto largo`, `num`, `%` (se guarda 0–1 y se muestra `0%`), `fecha‑texto` (en Excel **son strings**, no fechas), `img`, `ref` (se calcula por referencia a otra hoja; no se captura).
- *Unidad*: la que da el formato de número de la celda.
- *Cat.*: el catálogo de la sección (g). Ninguna celda tiene lista desplegable real (ver g).

### b.0 Membrete repetido en todas las hojas (filas 2‑7)

| Campo | Origen | Tipo |
|---|---|---|
| Nombre del despacho | Carátula C2, se captura una vez | texto |
| Dirección | Carátula C3 | texto |
| Teléfono + correo (en una sola cadena) | Carátula C4 | texto |
| Fecha del avalúo | ref `ll. DATOS` G22 (TU G23, TR G20, MEH G21) → Carátula | fecha‑texto |
| Vigencia del avalúo | ref `ll. DATOS` R22 → Carátula | fecha‑texto |
| Folio | Carátula F7 | texto (MEH: ref a la CLAVE) |
| Título "DICTAMEN VALUATORIO" (MEH: "…DE MAQUINARIA Y EQUIPO") | fijo | — |

Nota: en TR el despacho aparece como "VALUAXIS / Calle Abasolo #82…". En RA el despacho es el nombre del perito ("MTRO. VIIBN. ARQ. JORGE IGNACIO GUTIÉRREZ NAVARRO"). El membrete tiene que ser configurable por despacho y por perito.

### b.1 Carátula (inmuebles: TU, TCH, TR, TRC, RA)

| Sección | Campo (etiqueta tal cual) | Tipo / unidad | Notas por formato |
|---|---|---|---|
| Encabezado | Fecha del Avalúo / Vigencia / Folio | ref / ref / texto | Folio con patrón `TIPO-NNN-MM-AAAA` (ver c.4) |
| Título | Tipo de dictamen (p. ej. "TERRENO URBANO CON CASA HABITACIÓN", "TERRENO RÚSTICO DE USO AGROPECUARIO", "EDIFICIO DE 4 DEPARTAMENTOS…") | texto | B10 (TRC B11) |
| | Localidad ("El Sauz, Jalisco.") | texto | B11 (TRC B12) |
| | Fotografía de portada | img | filas 12‑27 |
| DATOS DEL INMUEBLE | Calle | texto | TR/TRC: "Carretera y/o nombre del predio" |
| | Número Exterior / Interior | texto | TR/TRC: "Kilometraje y/o localización específica" |
| | Ejido o Poblado | texto | RA y TR: "Colonia"; TRC: "Ejido o Poblado" |
| | Delegación o Municipio | texto | |
| | Código postal | texto/num | |
| | Entidad Federativa | texto | |
| DATOS DE SOLICITANTE | Propietario | texto | TU/TCH/RA: **se captura aquí**. TR/TRC: ref `ll. DATOS` (en TRC está cruzado, ver h) |
| | Solicitante | texto | ídem |
| | Teléfono | texto | |
| | Correo | texto | |
| | Lugar y fecha de solicitud | texto libre ("Guadalajara, Jalisco a 12 de Enero de 2025") | |
| CARACTERÍSTICAS | Superficie total Terreno | num m² (`#,##0.00 "m2"`) | TU: **fórmula** `=C38*C39` (frente × fondo). TR: la nota permite mostrarla en ha `00-00-00.00`. TR repite la etiqueta en B37 `=C36` |
| | Frente de Terreno (m) / Fondo de Terreno (m) | num m | solo TU |
| | Superficie total de construcción | num m² | TCH/TRC/RA. RA: `='IV. INF CONSTRUCCIONES'!Q29` |
| | Uso actual del inmueble | texto | TR: "Uso actual del terreno" |
| | Número de Niveles | texto ("2 niveles") | TCH/TRC/RA |
| | Fuente Hídrica | texto ("De temporal") | solo TR |
| DATOS DEL AVALÚO | Fecha de Avalúo | fecha‑texto | **se captura aquí** (F37; TR F36; TRC F38) |
| | Vigencia de Avalúo | fecha‑texto | **se captura aquí**, a mano (+6 meses) |
| | Uso del Avalúo | ref `ll. DATOS` G28 | |
| | Propósito del Avalúo | ref `ll. DATOS` G29 | |
| SUPUESTOS Y CONDICIONES LIMITANTES QUE INFLUYEN EN EL VALOR DICTAMINADO | texto (filas 43‑45 **ocultas** en todos; en RA la fila 46 dice "niniij") | texto largo | Nota: debe concordar con Consideraciones; incluye el párrafo de reconsideración INDAABIN |
| CONCLUSIÓN | "El valor comercial del inmueble descrito en el presente documento asciende a:" | fijo | Nota: redactar según la finalidad (Valor mínimo de enajenación / máximo de adquisición / monto de indemnización; VC o VRO) |
| | VALOR COMERCIAL DEL INMUEBLE | ref Conclusión (moneda `$ #,##0.00`) | B54 (TR B52) |
| | Cifra en letras | ref Conclusión → CIFRAENLETRAS I7 | B56 (TR B54) |
| FUNDAMENTO LEGAL (filas 57‑61 **ocultas**) | Párrafo 1: art. 148 LGBN, vigencia de 6 meses; art. 27 del Reglamento INDAABIN, 60 días naturales para reconsideración | fijo | Nota TR/TRC: expropiaciones, VRO y consultoría también a 6 meses |
| | Párrafo 2: arts. 7, 15, 17, 18, 21, 22 y 26 del Reglamento INDAABIN | fijo | |
| Firma | Nombre del perito | texto | **se captura aquí** (C66; TU C68; TRC C67) |
| | `="Perito Valuador, "&Especialidad&" Ced. Fed. "&Cédula` | ref | B67 (TU B69, TRC B68) |

### b.2 Carátula MEH

Encabezado y solicitante: igual que b.1. Folio `='ll. DATOS'!E37`, que es la CLAVE del catálogo de cuentas.

DATOS DEL BIEN A VALUAR (todos texto, se capturan aquí):

| Campo | Ejemplo |
|---|---|
| Tipo de Máquina/Equipo | |
| Marca | |
| Modelo | |
| Matrícula | |
| No. de Serie Chasis | |
| No. de Serie Motor | |
| Año de Fabricación (sic "Fabración") | num |
| País de Origen | |
| Potencia (HP/kW) | "101 HP (75 Kw)" |
| Horas uso (horómetro) | "8,498 horas" |
| Ubicación del bien | |

Conclusión: "VALOR COMERCIAL DEL BIEN" `='X. CONCLUSION'!N54`.

### b.3 ll. DATOS — inmuebles urbanos (TU, TCH, RA; TU desplaza 1 fila)

| Sección | Campo | Tipo / unidad | Cat. / nota |
|---|---|---|---|
| I.1 ANTECEDENTES | Asunto | texto (default "Se emite trabajo valuatorio.") | |
| | Solicitante | ref Carátula F30 | |
| | Lugar y fecha de solicitud | ref Carátula F33 | |
| | Propietario | ref Carátula F29 | Nota: nombre completo tal como figura en el título |
| | Fecha de inspección | fecha‑texto | |
| | Fecha del avalúo / Vigencia del avalúo | ref Carátula F37 / F38 | |
| | Fecha de reporte | fecha‑texto | en todos los ejemplos queda "2 de Julio 2025", que no se actualizó |
| | Perito Valuador | ref Carátula C66 | |
| | Cédula Federal | num/texto (R25; TR S23) | vacía en TU/TCH/TUO → la carátula imprime "Ced. Fed. " sin número |
| | Especialidad | texto | |
| | Uso del avalúo | texto | Cat. `tipo_operacion` |
| | Propósito del avalúo | texto | Cat. `tipo_valor` |
| | Finalidad del avalúo | texto | nota: copiar la columna FINALIDAD de la tabla de Criterios Técnicos |
| I.2 INFORMACIÓN GENERAL DEL INMUEBLE | Inmueble que se valúa | texto | nota: tipo (edificio de oficinas, bodega…) |
| | Descripción | texto largo | |
| | Régimen de propiedad | texto ("Privado particular") | Cat. `regimen` (implícito) |
| | Nº cuenta predial / Clave catastral / Nº cuenta de agua | texto ("No se proporcionó") | |
| 1.3 UBICACIÓN DEL INMUEBLE | Calle, Nº, Colonia/Ejido, Municipio, CP, Entidad | ref Carátula (etiqueta y valor) | |
| | Clave de Municipio (INEGI) | num | |
| | Clave de Entidad Federativa (INEGI) | num | |
| | Superficie total Terreno | ref `lll. INF TERRENO` H40 (m²) | |
| | Longitud / Latitud Geográfica | texto DMS (102°26'5.25"O) | |
| | Altitud Geográfica | texto ("1,997 msnm.") | |
| II. CARACTERÍSTICAS URBANAS DE LA ZONA | Características de la Zona | texto largo | |
| | Clasificación de la Zona | texto ("Habitacional - Comercial Mixto") | |
| | Referencia de proximidad urbana | texto | Cat. `proximidad_SHF` (1‑5) |
| | Construcción dominante | texto | |
| | Índice de saturación de la zona | % | nota: % de predios construidos contra baldíos |
| | Nivel socioeconómico | texto ("Medio ( c )") | Cat. `nivel_socioeconomico` (implícito) |
| | Densidad de Población | texto | Cat. `alta_media_baja` |
| | Contaminación ambiental | texto | |
| | Uso del Suelo | texto largo | nota: uso oficial y su fuente; indicar si hay uso adquirido |
| II.1 EQUIPAMIENTO URBANO | Infraestructura disponible en la zona | % | |
| | Agua potable; Drenaje y alcantarillado; Electrificación; Alumbrado Público; Vialidades; Banquetas / Guarniciones; Servicios Públicos; Equipamiento Urbano | texto | |
| II.2 OTROS SERVICIOS | Gas; Red Telefónica; Señalización; Transporte público; Vigilancia; Recolección de basura | texto | |

### b.4 ll. DATOS — rural (TR, TRC)

- **I.1**: igual que b.3. En TR y TRC, **Solicitante (G14/G16) y Propietario (G17/G19) se capturan aquí** y la carátula los toma de aquí. El encabezado de sección dice "I. ASPECTOS GENERALES".
- **1.3 Ubicación**, con etiquetas rurales: Carretera y/o nombre del predio; Kilometraje; Colonia o Ejido; Municipio; CP; Entidad. Además claves INEGI y coordenadas. TRC no trae la superficie.
- **II. DATOS DE LA REGIÓN**: Características de la Región; Clasificación de la Región (nota: Agostadero, Agua rodada, Temporal, Riego por aspersión, Riego por goteo); Referencia de proximidad urbana ("Rural"); Construcción dominante; Índice de saturación (%); Nivel socioeconómico; Densidad; Contaminación.
- **II.1 CLASIFICACIÓN DEL SISTEMA NATURAL**:

| Campo | Tipo | TR | TRC | Cat. / nota |
|---|---|---|---|---|
| Estación Meteorológica | texto | ✔ | ✔ | nota: fuente SMN, CFE, SAGARPA… |
| Región Fisiográfica | texto | ✔ | ✔ | |
| Tipo de Estación | texto | ✔ | — | |
| Normal Meteorológica + Clave | texto + num | ✔ | — | nota: en Arandas es El Tule 14060 |
| Cuenca | texto | ✔ | — | |
| Tipo de Clima | texto | ✔ | ✔ | Cat. `clima` |
| Altitud | texto | — | ✔ | |
| Precipitación pluvial | texto | ✔ | ✔ | Cat. `precipitacion` |
| Precipitación pluvial anual | texto mm | ✔ | ✔ | |
| Temperatura | texto | ✔ | ✔ | Cat. `temperatura` |
| Granizadas / Heladas (días) | texto | — | ✔ | Cat. `siniestralidad` |
| Vientos / Inundaciones / Sequías | texto | — | ✔ | |
| Otros | texto | ✔ | ✔ | |
| Actividad Agropecuaria | texto largo | ✔ | ✔ | |
| Vegetación nativa de la Región | texto | ✔ | ✔ | |
| Recursos Acuíferos | texto | ✔ | ✔ | Cat. `recursos_acuiferos` |
| Origen Geológico | texto | ✔ | ✔ | Cat. `origen_geologico` |
| Edafología | texto | ✔ | — | |
| Restricciones de la Región | texto | ✔ | ✔ | |

- **II.2 EQUIPAMIENTO URBANO** (no trae "Servicios Públicos") y **II.3 OTROS SERVICIOS**: igual que b.3.
- **II.4 USO CONSUNTIVO** (solo TR): texto largo.

### b.5 lll. INF TERRENO — urbano (TU, TCH, RA)

| Sección | Campo | Tipo / unidad |
|---|---|---|
| III.1 VÍAS DE ACCESO… | 3 renglones: nombre de la vía + "importancia, distancia y orientación" | texto |
| Croquis | MACROLOCALIZACIÓN / MICROLOCALIZACIÓN | img |
| III.2 MEDIDAS Y COLINDANCIAS | Tabla Rumbo (Al Norte, Al Sur, Al Este, Al Oeste) × Distancia (m) × Colindancias | texto (RA: "7.50 m") |
| | Linderos y colindancias según | texto (nota: documento fuente y diferencias) |
| III.3 CONFIGURACIÓN Y TOPOGRAFÍA | Frente del terreno (m) / Fondo del terreno (m) | num m |
| | Superficie total de Terreno (m²) | num m². RA: `='l. CARATULA'!C37` |
| | Sup. total de Construcción (m²) | TCH: ref Carátula C38. RA: `=H42` |
| | Superficie Vendible (m²) | num m² (TCH, RA). RA: ref Construcciones Q29 |
| | Superficie Rentable (m²) | num m² (solo TU, S42) |
| | Indiviso | % |
| | Tramo de calles transversales, limítrofes y orientación | texto |
| | Topografía | texto ("Plano") |
| | Pendiente | texto ("Menor a 5%") |
| | Numero de frentes | num |
| | Características panorámicas | texto |
| | Servicios urbanos del terreno | texto |
| | Uso de Suelo Autorizado / Uso de Suelo Actual | texto |
| | C.O.S. / C.U.S. (RA: "C.U.S. + I.C.U.S." `=1.4+1.8`) | num |
| | Densidad Habitacional | texto (nota: viviendas posibles según el plan) |
| | Intensidad de la construcción | texto (nota: m² construibles) |
| | Servidumbres, Restricciones y/o Afectaciones | texto |
| | Otros | texto |
| IV. IE/EA/OC (solo TU, dentro de esta hoja) | Tabla #, Tipo, Edad, VUT, VUR, Conservación, Mantenimiento, Descripción | ver b.8 |

### b.6 lll. INF TERRENO — rural (TR, TRC)

- **III.1** y **III.2**: igual que b.5.
- **III.3 CONFIGURACIÓN Y TOPOGRAFÍA**:
  - Superficie total de Terreno (ha) = `=T41`. Es **el mismo número en m²**, mostrado con el formato `00-00-00.00 "ha"`, o sea ha‑a‑ca: 7295.15 m² se lee "00‑72‑95.15 ha".
  - Superficie total de Terreno (m²) = ref Carátula C36 (TRC: C38).
  - TRC agrega Sup. total de Construcción (m²).
  - Topografía; Pendiente; Número de frentes (TR); Características panorámicas; C.O.S.; C.U.S. (TR); Intensidad de la construcción (TRC); Uso de suelo actual / autorizado (TRC).
- **III.4 SITUACIÓN JURÍDICA**: Escrituras; Permisos y concesiones; Ordenamiento ecológico; Servidumbres; Restricciones; Afectaciones; Otros. Todos texto.
- **III.5 CARACTERÍSTICAS EDAFOLÓGICAS Y FISICOQUÍMICAS**:
  - Color; Textura.
  - Salinidad (Cat. `salinidad`); Erosión (Cat. `erosion`).
  - Profundidad de la capa arable; Profundidad del manto freático.
  - Pedregosidad (Cat. `pedregosidad`); Permeabilidad y drenaje (TR).
  - TRC agrega **Productividad Actual**: ALTA ( ) / MEDIA (X) / BAJA ( ), que se marca con X.
- **III.6 CARACTERÍSTICAS HIDROLÓGICAS**: Fuente de abastecimiento de agua; No. de título de Concesión; Volumen de agua autorizado; Sistemas de riego.
- **III.7 ESPECIFICACIONES DEL POZO**: No. de registro; Gasto; Antigüedad; Profundidad de perforación; Diámetro de perforación; Diámetro de tubería de ademe; HP del motor.
- **III.8 USO CONSUNTIVO**: texto largo.
- **III.9 DESCRIPCIÓN GENERAL DEL TERRENO**: Terreno (texto); Uso actual (texto). Tabla **Tipo o uso de suelo × Superficie (ha‑a‑ca) × Cultivos y variedades**, con 5 filas y SUMA `=SUM(I87:L91)`. Tipos observados: Agrícola de temporal, Forestal, Cuerpo de agua, Apicultura, Construcción habitacional, Otro. **La SUMA no se valida contra la superficie total** (ver h).
- **III.10 BIENES DISTINTOS A LA TIERRA** y **III.11 DATOS PROMEDIOS DE LA REGIÓN**: Descripción de cultivos; Rendimiento (ton/ha); Tecnología utilizada; Forma de riego; Mejoras territoriales; Seguros.
- **IV. IE/EA/OC**: tabla (solo TR), ver b.8.

### b.7 IV. INF CONSTRUCCIONES (TCH, TRC, RA)

| Sección | Campo | Tipo | Cat. / nota |
|---|---|---|---|
| IV. DESCRIPCIÓN GENERAL | Uso actual | texto | |
| | Distribución del inmueble (RA: "Descripción del inmueble") | texto largo | nota: empezar por el terreno, luego los niveles, en orden |
| | Superficies de construcción (solo RA, 4 renglones por nivel) | texto | |
| | Número de niveles | texto | |
| | Estado de conservación | texto | Cat. `conservacion` |
| | Calidad del proyecto | texto ("Moderno") | Cat. `calidad_proyecto` |
| | Clase general del inmueble | texto | Cat. `clase_inmueble` (1‑7) |
| | Calidad y clasificación de la construcción | texto | |
| | Clase de Edificio (TCH, RA) | texto | Cat. `clase_edificio` (A+, A, B, C) |
| | Unidades susceptibles a rentarse (TCH, RA) | num/texto | |
| | Grado de terminación de obra | % | |
| IV.1 TIPOS DE CONSTRUCCIONES | Tabla con renglones T‑1…T‑3: Tipo · Uso · Clasificación · Calidad · Conservación · **Edad** (años) · **VUT** (años) · **VUR `=VUT−Edad`** · **Sup. (m²)** · Descripción | num + texto | nota: agrupar por tipo y calidad |
| V. ELEMENTOS DE CONSTRUCCIÓN (texto libre por rubro) | V.1 Obra negra: Cimentación, Estructura, Muros, Entrepisos, Techos, Azoteas, Bardas | texto | |
| | V.2 Revestimientos: Aplanados, Plafones, Lambrines, Pisos, Zoclos, Escaleras, Pintura, Recubrimientos especiales | texto | |
| | V.3 Carpintería: Puertas de intercomunicación, Puertas de closets, Interiores de closet | texto | |
| | V.4 Hidrosanitarias: Red hidráulica, Red sanitaria, Lavabos, Muebles de baño, Accesorios, Canceles de baño | texto | |
| | V.5 Eléctricas: Tipo de instalación, Materiales, Salidas, Tableros, Tipo de voltaje | texto | |
| | V.6 Herrería y cancelería: Tipo, Material, Perfiles, Claros, Material vidriería, Tipo, Espesor, Espejos, Domos, Tragaluces | texto | RA junta "Domos y tragaluces" y quita Claros y Espesor |
| | V.7 Otros: Cerrajería, Cocina, Obra exterior | texto | |
| VI. IE, EA, OC | tabla, ver b.8 | | TRC la numera "V.8" |

### b.8 Tabla de Instalaciones Especiales, Elementos Accesorios y Obras Complementarias

- Columnas en TU, TCH, TR y TRC: `# · Tipo · Edad · VUT · VUR · Conservación · Mantenimiento · Descripción`.
  - Tipo ∈ Cat. `tipo_ie` (I.E., E.A., O.C.).
  - **VUR se teclea** (4 = 7−3). No es fórmula.
- RA (evolucionada): `# · Tipo · Descripción · Cant. · Edad · VUT · VUR (=VUT−Edad) · Conservación · Mantenim.`, más la nota "Vidas útiles de Indaabin y ASA". En RA esta tabla **sí alimenta** el enfoque de costos (ver e).

### b.9 CONSIDERACIONES

- **.1 CONSIDERACIONES GENERALES**:
  - Criterio técnico (texto). Valores: "724 (criterios numéricos) AD‑BI‑TU (Octágono de Control) Metodología de Valor Comercial (17‑jun‑2017)" en urbanos y MEH; "IN‑BN‑TR" en rurales.
  - Fundamento legal (texto). Urbanos y MEH: art. 143 fr. I, 145 y 148 LGBN y art. 3 fr. IV del Reglamento INDAABIN. Rurales: art. 143 fr. VII y 145 LGBN, art. 3 fr. IV del Reglamento y art. 93 fr. II de la Ley Agraria.
  - En RA las filas 13‑17 están **ocultas**.
- **.2 DEFINICIONES** (glosario fijo). Término en B y definición en F:
  - Urbano: Valor comercial; Enfoque de costos; Enfoque de ingresos; Valor físico o directo; Valor de capitalización de rentas; Enfoque de mercado; VNR; VRN; Valor de inversión o valía; VLO; VLF.
  - Factores: zona, ubicación, frente, forma, superficie, topografía, uso de suelo, negociación, proyecto, edad, estado de conservación, relación T/C‑CUS, calidad.
  - Rural agrega: Agropecuario; Bienes distintos a la tierra; Predio rústico; Terrenos en breña; en agostadero; Coeficiente de agostadero; Terrenos de temporal; de humedad; de riego (3 párrafos); Cultivo cíclico; Cultivo perenne.
  - MEH (III): Bien mueble; Maquinaria; Equipo; VUT; VUR; enfoques; Valor comercial; Valor de adquisición; Depreciación, física, por obsolescencia funcional y económica; VRN; VNR; Valor de rescate; VLO; VLF; factores de negociación, edad, obsolescencia y conservación.
- **.3 COMENTARIOS GENERALES, SUPUESTOS Y CONDICIONES LIMITANTES**: lista numerada de párrafos editables. Urbano 1‑12. El nº 11 tiene huecos: "se consultó ____ en su edición del mes de ____ del año ____". Rural 1‑10 aprox.; se quitan el 6 y el 7 urbanos. MEH 1‑6; el 6 fija la vigencia en 6 meses.
- Fuera del área de impresión (Q/R/S, fila ≈101) hay notas para: indicar si se valúa la unidad productiva completa o fracciones; diferencias entre documentos e inspección; otros supuestos. En rural, S125 habla de otros ingresos (procampo, esquilmos).

### b.10 CONCLUSIÓN: bloques de texto (los números van en c)

1. RESUMEN DE VALORES (3 renglones, ver c).
2. CONSIDERACIONES PREVIAS A LA CONCLUSIÓN: texto por defecto, "Se considera que el Valor que nos arroja es un indicador adecuado del valor comercial…". RA agrega la justificación de los enfoques no aplicados.
3. .1 LIMITACIONES O CONDICIONES HIPOTÉTICAS ("No existen…"). .2 SUPUESTOS ESPECIALES ("No hay…"). .3 OTRAS CONSIDERACIONES (fundamento: art. 143 fr. VII LGBN y Ley Agraria **en todos**, incluidos los urbanos). En RA las filas 23‑34 están ocultas.
4. .4 DECLARACIONES: 5 párrafos fijos (veracidad, análisis propio, sin interés, compensación no condicionada, inspección personal).
5. CONCLUSIÓN DE VALOR: etiqueta ("VALOR DE MERCADO:"; TR "VALOR DE MERCADO DEL BIEN:"; MEH "VALOR COMERCIAL DE LA MAQUINARIA:"), valor y cifra en letras.
6. TR agrega "NOTA.- El presente avalúo cuenta con un anexo de firmas electrónicas."
7. Firma: VALUADOR, nombre, "Especialidad / Maestría", "Ced. Profesional Federal". Todo por referencia a DATOS.

### b.11 Anexos

- **Anexo 1 · Fotografías del sujeto**: rejilla de 2 columnas (B y N) con pie de foto en texto. Ejemplos TCH: "FACHADA PRINCIPAL FRENTE A ACCESO", "TERRAZA", "SALA", "HABITACIÓN 01". MEH conserva placeholders "ZZZZ/YYYY". RA llega a unas 40 fotos con pies repetidos.
- **Anexo Planos arquitectónicos** (solo RA): título y área de imagen.
- **Anexo 2 · Croquis y fotos de comparables**: por grupo (terrenos en venta, inmuebles en venta, inmuebles en renta):
  - Croquis macro y micro (img).
  - Ficha de cada comparable (5), con UBICACIÓN y atributos tomados por referencia del cuadro de mercado: urbano N. FRENTES, USO DE SUELO, FORMA, ZONA, FRENTE, FONDO, SUPERFICIE (o SUP. RENTABLE), OFERTA, OBSERVACIONES; rural USO DE SUELO, CLASIF. ZONA, FORMA, FUENTE HÍDRICA, VÍAS DE ACCESO, UBICACIÓN, SUPERFICIE, OFERTA, OBSERVACIONES.
  - Patrón de la fórmula: `=IF(Mercado!$C22<>0, Mercado!AD22, "")`.
- **Anexo 3 · Factores de homologación**: pares "Etiqueta del factor" (ref a los encabezados del cuadro de mercado, p. ej. `=CONCATENATE('VII. ENF. MERCADO VENTA'!L$41,":")`) + "Justificación" (texto fijo en la plantilla) + "Notas". TCH agrega OTROS: FORMA, CALIDAD, EDO. CONSERVACIÓN.
- **Anexo 4 · Otros indirectos**: 5 conceptos (Proyecto ejecutivo, Costo financiero, Utilidad de inversión en el proyecto, Escrituración de terreno, Administración). Unidad %; Cantidad × "V.N.R. de las construcciones" (J16:J20) = Valor parcial; Subtotal R21 → Costos. **J16:J20 no está vinculado a nada**; hay que teclearlo.
- **Términos y Condiciones**: licencia de "© Hoja de Excel para Cálculo de Presupuestos de Obra ®" (herramientasexcel.com). Prohíbe la reproducción total o parcial. Trae instrucciones de uso de la plantilla. **No es contenido del avalúo**; ver pregunta legal en (i).

### b.12 ll. DATOS — MEH (hoja larga, 244 filas)

| Sección | Campos | Tipo / unidad / Cat. |
|---|---|---|
| I.1 ANTECEDENTES | Asunto; Solicitante; Lugar y fecha; Propietario del bien; Fecha de inspección técnica; **Fecha de cotizaciones**; Fecha de emisión; Vigencia; Perito; Cédula; Especialidad; Uso; Propósito; Finalidad | igual que b.3 |
| | **Tipo de Cambio (USD/MXN)** | num `"MXN/USD"` (17.65) |
| | Moneda | texto ("MXN. Pesos mexicanos.") |
| I.2 CATÁLOGO DE CUENTAS | Empresa (nº + nombre), Planta (nº + nombre), Cuenta (nº + nombre), Departamento (nº + nombre), Consecutivo (texto "001"), Fecha (texto MMAAAA) | num/texto |
| | **CLAVE** `=CONCATENATE(E34," ",P34," ",E35," ",P35," ",E36," ",P36)` → "1 4 6 005 001 072026" | ref, se usa como folio |
| I.3 IDENTIFICACIÓN DEL BIEN | Tipo, Marca, Modelo, País, Año, Potencia, Matrícula, Horómetro (ref Carátula) | ref |
| | Color; Submarca; No. Serie; Cabina; Tracción; Kilometraje (texto "2,145 km"); Tipo de motor; Combustible; Tipo de transmisión; Componentes principales; Ubicación del bien (dirección) | texto |
| | **Valor de Cotización Nuevo** (num) + moneda (USD); Proveedor; Correo / página web; Teléfono; Tipo de mercado para los activos | num / texto |
| | Descripción del bien | texto largo |
| I.4 INFORMACIÓN LEGAL | Factura No.; Importe de factura (num USD); Pedimento; INCOTERM (texto "FOB"); Estancia legal en el país | texto/num |
| II. PROCESO DE INSPECCIÓN | 3 párrafos numerados | texto |
| III.1 ENTORNO GENERAL | Entorno en el que opera; Giro; Capacidad utilizada (%, nota "exigencia operativa"); Impacto ambiental | texto/% |
| III.2 REPORTE DE INSPECCIÓN FÍSICA | Fecha de reporte; CLAVE (ref); Clasificación del bien (Cat. `clasif_bien`, se marca) | |
| | Datos generales: Solicitante, Propietario, Ubicación de la inspección, Inspector | |
| | Identificación: Tipo, Marca, Submarca, Modelo, País, Año, No. serie, No. serie motor, Placa, Tracción, Cabina (refs) | |
| | VIDA ÚTIL: **Edad cronológica** (num años), **Edad efectiva** (num años), **Vida útil total** (num años), Vida útil remanente (texto "16 años", tecleado), Odómetro/Horómetro (refs con **etiquetas cruzadas**, ver h) | num |
| | ESTADO FÍSICO: Estado operativo (Activo/Inactivo); Estado de conservación; Tipo de mantenimiento; Mantenimiento (Cat. `mantenimiento_meh`); Frecuencia; Bitácora (Sí/No); Manual (Sí/No); Problemas de operación; Reparaciones mayores; Disponibilidad de refacciones | texto |
| | ESTRUCTURA Y CHASIS: Integridad estructural, Bastidor, Brazo cargador, Soldaduras, Fisuras, Corrosión, Golpes, Deformaciones, Reparaciones visibles | texto (Cat. `estado_componente`) |
| | IMPLEMENTOS: Cucharón frontal, Cucharón trasero, Desgaste de cuchillas, Pasadores, Bujes, Martillo, Horquillas, Innovaciones tecnológicas, Piezas especiales, Adiciones, Llaves | texto |
| | SISTEMA HIDRÁULICO: Bomba, Cilindros, Mangueras, Conexiones, Fugas, Nivel de aceite | texto |
| | MOTOR: Marca, Modelo, Potencia, Ruidos, Vibraciones, Fugas, Humo, Color de humo, Temperatura, Sistema de enfriamiento, Bandas, Radiador, Nivel de refrigerante | texto |
| | TRANSMISIÓN: Tipo, Cambios, Convertidor, Caja, Diferenciales, Fugas, Ruidos | texto |
| | NEUMÁTICOS: Delantero izquierdo y derecho, Trasero izquierdo y derecho | texto |
| | SISTEMA ELÉCTRICO: Batería, Alternador, Marcha, Luces, Indicadores, Tablero, Claxon, Baliza | texto |
| | FRENOS Y SEGURIDAD: Freno de servicio, Pedales, Botón de paro, Alarma de reversa | texto |
| | CABINA: Estado, Cristales, Puertas, Espejos, Asiento, Cinturón, Tablero, Palancas, Joystick, A/C, Calefacción, Limpiaparabrisas | texto |
| | PRUEBAS DE OPERACIÓN: Arranque, Traslado, Avance, Reversa, Dirección, Excavación, Carga, Elevación, Estabilizadores, Sistema hidráulico, Funcionamiento general | texto |
| | Observaciones generales | texto largo |
| III.3 CALIFICACIÓN DEL ESTADO DE CONSERVACIÓN | Matriz de 16 componentes (Motor, Chasis, Carrocería, Estructura externa, Tren de rodaje, Sistema eléctrico, Sistema hidráulico, Pintura, Piezas especiales, Interiores, Cristales, Faros, Espejos, Otros, Personal de operación, Personal de mantenimiento) × escala 1‑10, marcando **X**, más Observaciones | ver c.3 |
| III.4 FOTOS | 4 fotos con pie | img |
| III.5 FUENTES DE INFORMACIÓN | 7 viñetas fijas (ficha técnica, fotos, inspección, cotizaciones, ofertas en línea, sitios web, libros de costos paramétricos) | texto |

---

## (c) Conclusión y conciliación de enfoques

### c.1 Qué hace el Excel, celda por celda

**No hay ponderación ni promedio de enfoques.** El "valor concluido" es una referencia directa, puesta a mano, a **uno** de los renglones del resumen. El renglón elegido depende de a qué celda apunta la fórmula; no hay selector. El redondeo se hace en el resumen o dentro del enfoque.

| Fmt | Hoja | Renglón 1 (Costos) | Renglón 2 (Mercado) | Renglón 3 (Ingresos / otro) | Valor concluido | Carátula | Letras |
|---|---|---|---|---|---|---|---|
| TU | VIII | R13 `='V. ENF. COSTOS'!U48` (sin ROUND aquí; U48 ya es `ROUND(V20+V44+V46,-4)`) = 1,050,000 | R15 `=ROUND('VI…'!T55,-4)` = 1,120,000 | R17 `=ROUND('VII…'!K92,-4)` = 110,000 (**K92** está en filas ocultas 84‑92) | L54 `=R15` | B54 `='VIII. CONCLUSION'!L54` | B56 `=CIFRAENLETRAS!I7` |
| TUO | VIII | igual que TU | igual | igual (**K92**, aunque CIFRA I46 imprime K82) | L54 `=R15` | igual | igual |
| TCH | X | R13 `=ROUND('VI…'!U69,-4)` = 3,740,000 | R15 `=ROUND('VII…'!T98,-4)` = 3,750,000 | R17 `=ROUND('IX…'!I65,-4)` = 700,000 | L54 `=R15` | B54 `='X. CONCLUSION'!L54` | B56 |
| TR | VIII | R13 `=ROUND('V…'!T64,-4)` = 2,770,000 | R15 `=ROUND('VI…'!T51,-4)` = 5,030,000 | R17 `=ROUND('VII…'!K93,**-2**)` = 5,091,000 | N57 `=R15` | B52 `=…!N57` | B54 → B59 |
| TRC | VIII | R13 `=ROUND('VI…'!U84,-4)` = 6,510,000 ("ENFOQUE FÍSICO") | R15 `=ROUND('VII…'!T95,-4)` = 5,750,000 | R17 texto **"NO APLICA"** | L55 `=R15` | B54 `=…!L55` | B56 → B57 |
| RA | VIII | R13 `=ROUND('VII…'!U65,-4)` = 8,580,000 | R15 **"NO APLICA"** | R17 **"NO APLICA"** | L60 **`=R13`** | B54 `=…!L60` | B56 → B62 |
| MEH | X | R13 `=ROUND('IV…'!V61,-4)` = 930,000 (V61 ya viene `ROUND(…,-3)` = 933,000) | R15 `='V…'!AI91` = 980,000 (AI91 = `ROUND(MEDIAN(…),-4)`) | R17 "VALOR ESTIMADO POR COSTO‑CAPACIDAD" `='METODOS ALTERNATIVOS'!AH55` = 855,000 (ROUND ‑3) | N54 `=R15` | B54 `=…!N54` | B56 |

Reglas de redondeo que hay que replicar:
- `ROUND(x,-4)` = decenas de miles, en **todos** los enfoques del resumen, salvo TR ingresos (‑2) y MEH métodos alternativos (‑3).
- MEH redondea dos veces el valor físico: V61 a ‑3 (933,000, que es lo que se imprime en letras en la hoja de costos) y luego R13 a ‑4 (930,000 en el resumen).
- Excel `ROUND` es *half away from zero* en decimal. Hay que implementarlo con aritmética decimal, no con `Math.round` de JS sobre binarios.
- CIFRAENLETRAS toma el **mismo** valor concluido (F7 = L54/N57/L55/L60/N54). La carátula muestra el valor concluido con formato `$ #,##0.00`.

Lo que se imprime en la carátula es el valor concluido, que es el enfoque de **mercado** en 6 de 7 libros y el de **costos** en RA. Una nota en Carátula B52 recuerda verificar que sea el valor que se solicita (p. ej. VRO en lugar de VC). **No existe cálculo de VRO ni de VLF**; solo aparecen como definiciones.

### c.2 Modelo propuesto para la app (trazable e idéntico al Excel)

```
EnfoqueResultado { id, etiqueta, valor_bruto, regla_redondeo (-2|-3|-4|null), valor_redondeado, estado: calculado|NO_APLICA, justificacion_texto }
Conclusion {
  enfoque_seleccionado: id            // Excel = referencia fija; la app lo guarda explícito
  modo: "seleccion" | "ponderacion"   // Excel solo usa "seleccion"; "ponderacion" = pesos por enfoque, apagado por defecto
  valor_concluido = redondeado(enfoque_seleccionado)
  etiqueta_valor ("VALOR DE MERCADO:", "VALOR COMERCIAL DE LA MAQUINARIA:"…)
  cifra_letras = CIFRAENLETRAS(valor_concluido)
}
```

Para cada tipo de avalúo, el constructor define: la lista de renglones del resumen (etiqueta, celda de origen y regla de redondeo), cuáles pueden quedar "NO APLICA" y el enfoque por defecto (mercado; RA, costos).

### c.3 Vigencia, fechas y folio

- **Fecha del avalúo** y **Vigencia** se capturan como **texto** en la Carátula ("12 de Febrero de 2024"). DATOS y el membrete las toman por referencia. No hay cálculo.
  - En los 4 pares observados la vigencia = fecha + **6 meses** en el mismo día: 12 Feb→12 Ago, 6 Jun→6 Dic, 8 May→8 Nov, 12 Feb→12 Ago.
  - Hay fundamento legal en el texto de la carátula (art. 148 LGBN) y en MEH, comentario 6.
  - Propuesta: guardar la fecha como tipo *date*, calcular `vigencia = fecha + 6 meses`, que el perito pueda editarla y formatear "d 'de' Mes 'de' aaaa" con el mes en mayúscula inicial. Los ejemplos mezclan "12 de Diciembre 2024" (sin "de").
- Fecha de inspección, fecha de reporte y fecha de solicitud son texto libre. No se validan contra la fecha del avalúo: TCH tiene solicitud en 2025 y avalúo en 2024.
- **Folio**: texto libre en la carátula (F7) con patrón `TIPO‑NNN‑MM‑AAAA`.
  - TR "TR‑001‑06‑2026"; TRC "TRC‑001‑04‑2026".
  - TU y TCH traen **"TRC‑001‑04‑2026"**: se copió de la plantilla TRC.
  - RA "TCH‑001‑05‑2026", donde MM = mes del avalúo.
  - MEH usa la CLAVE del catálogo de cuentas ("1 4 6 005 001 072026").
  - Propuesta: consecutivo por despacho y tipo, con prefijo configurable.

### c.4 MEH: calificación de conservación (DATOS III.3 → factores)

- `G194:P194 = COUNTIF(col,"x")`: cuántas X hay en cada calificación 1‑10.
- `G195 = INDEX(G177:P177, MATCH(MAX(G194:P194), G194:P194, 0))`. Es la **MODA** de las calificaciones, no el promedio aunque la etiqueta diga "CALIFICACIÓN PROMEDIO". Si hay empate gana la calificación **más baja**, porque es la primera columna.
- `H195` = etiqueta por concatenación: 10 Nuevo, 9 Excelente, 8 Muy bueno, 7 Bueno, 6 Regular, 5 Deficiente, 4 Malo, 3 Muy Malo, 2 Ruinoso, 1 Chatarra.
- Costos `B41` = factor por calificación: 10→1, 9→0.99, 8→0.975, 7→0.92, 6→0.82, 5→0.66, 4→0.47, 3→0.25, 2→0.10, 1→0.
  - Se construye como **texto** con espacios ("  0.975        ") que Excel convierte a número al multiplicar. Riesgo con configuración regional de coma decimal.
- `B38 = (1 − (Edad/VUT)^1.4) × B41` → FEd (J42), con curva de exponente 1.4.
- El FRe del bien es `FEd × FCo × FMt × FOt × FOe`, y FCo (L42 = 0.975) **también** se teclea, así que la conservación puede aplicarse dos veces (ver h e i).

### c.5 MEH: estructura completa y MÉTODOS ALTERNATIVOS

Hojas: Carátula → DATOS (identificación, legal, inspección, calificación) → III Consideraciones → IV Costos → V Mercado → MÉTODOS ALTERNATIVOS → X Conclusión → Anexo 1 fotos → Anexo 2 factores → CIFRAENLETRAS (9 bloques).

**IV. ENFOQUE FÍSICO O DE COSTOS** (resumen; el detalle metodológico es del agente de costos):

| Paso | Cálculo |
|---|---|
| V.1 | Identificación (refs a DATOS). |
| V.2 VRN unitario | Cotización ∈ {Nuevo igual, Usado igual, Similar nuevo, Similar usado}. `R28 = M28 (USD) × TC` → `W28 = R28 × U28` ("Otro", factor 1). |
| V.3 VRN instalado | % gastos aduanales, fletes y maniobras, seguros y fianzas, ingenierías, instalación y otros → `U34 = Σ%` → `W34 = W28 × (1+U34)`. |
| V.4 VNR | `J42 = FEd` (c.4) × FCo × FMt × FOt × FOe = `U42` → `W42 = U42 × W34`. |
| V.5 Aditamentos | `K = cotización × (1 + F:E:E:S + ing. + instal.)`; FEd **lineal** `=(VUT−E)/VUT`; FRe; VNR. |
| Valor físico | `V61 = ROUND(W42 + ΣVNR aditamentos, -3)`. |
| Porcentajes de participación | Chasis 25, Rodaje 20, Cabina 10, Motor 12, Mangueras 5, Aditamentos = V59/V61, Otros 8. **Suman 100.6 %**. Es informativo: no alimenta nada. Igual el factor de rodaje `1 − horas/horas nominales`. |

**V. ENFOQUE DE MERCADO**:
- Nivel de oferta, que se marca con X.
- 5 comparables: descripción, marca, modelo, año, horas, aditamentos, fecha, valor de oferta, contacto, fotos.
- Tabla de características técnicas (21 renglones).
- Homologación:
  - Puesto en sitio = `oferta × (1 + F:E:E:S + gastos de instalación)`.
  - `FEd = (1−(E/VUT)^1.4) × factor(calificación AS)`.
  - FCo, FMt, FOt y FOe se teclean.
  - VNR = FRe × puesto en sitio.
- Promedio (AI88) y **mediana** (AI89). **Valor = `ROUND(MEDIANA,-4)`** (AI91).
- Las etiquetas dicen "$/m²" por herencia de los formatos de inmuebles.

**MÉTODOS ALTERNATIVOS** (6). Cada uno termina en una celda redondeada y en su cifra en letras. **Solo el Método 1 llega a la conclusión** (R17).

| # | Método | Entradas | Fórmula (celdas) | Resultado |
|---|---|---|---|---|
| 1 | **Costo‑Capacidad** | 5 comparables (oferta, capacidad X26:X30); capacidad del sujeto J42 = 8400; exponente n = 0.6 (O37:O41); edades M37:M41 (se capturan, pero no se usan) | `Q = ROUND((J42/Jc)^n × oferta, -2)` (VRN equivalente); pesos `V = Jc/ΣJ`; VRN promedio M51; VRN ponderado Y51 = Σ Q·peso; `AH53 VRN = ROUND(AVERAGE(Y51,M51),-3)`; FRe del sujeto = factores de Costos J42·L42·N42·Q42·S42 (AG37); `AI = Q × FRe`; **`AH55 VNR = ROUND(AVERAGE(AI37:AI41),-3)`** | 855,000 → **Conclusión R17** |
| 2 | **Regresión lineal múltiple** | 20 observaciones (Y = costo; X1 edad, X2 horas, X3 odómetro, X4 HP, X5 tracción, X6 distancia) | La regresión se corre **a mano con la Herramienta de Análisis de Excel**; la salida estática se pega en BD78:BL100 y los coeficientes en AR109:AR115 (b0 = 1,891,271.80; b1 = −7,524.06; b2 = −25.06; b3 = −62.40; b4 = −34.11; b5 = 25,372.65; b6 = 1.434). `D109 = b0 + Σ bi·Xi(sujeto)`; `AH111 = ROUND(D109,-4)`. R² = 0.9335, R² ajustado = 0.9028 | 1,400,000 (nota: "si es ilógico, descartar") |
| 3 | **Método mexicano de valoración de MEyH** | Cr = 1,600,000; E = 14; T = 30; Fc (tabla por condición); Fo (tabla por vida consumida); A = 0.4, B = 0.4, C = 0.2 | `VAN = Cr × (1 − ((E/T)·A + Fc·B + Fo·C))` (AH160); `AH162 = ROUND(,-3)` | 805,000 |
| 4 | **Ross modificado** | Cr, Vr = 0.2, n = 14, T = 30, Dman (tabla), Dtec (tabla, capturada como `1−0.15`), Dmerc (tabla) | `Dn = (Cr − Cr·Vr)·n/T`; `VAN = (Cr − Dn)·Dman·Dtec·Dmerc`; `AH226 = ROUND(,-4)` | 720,000 |
| 5 | **Marston & Agg** (sic "Marstonn") | VR = 1,600,000; Vr = 10 %; Vu = 30; i = 8 %; e = 14 | `VA = VR·[(1−Vr)·((1+i)^Vu − (1+i)^e)/((1+i)^Vu − 1) + Vr]`; `AH264 = ROUND(,-4)` | 1,290,000 |
| 6 | **Helio de Caires** | μ (mantenimiento) = 10, τ (trabajo) = 10 → φ(μ,τ) = 0.9955 de tabla; t = φ·E; D(μ,τ) = 0.48041 **tecleado** de "Tablas de la función de desgaste"; r = 0.2; Cr | `J353 = φ·E` (13.937, no se usa después); `VA = ((1−r)·D + r)·Cr`; `AH356 = ROUND(,-4)` | 930,000 |

Tablas de los métodos 3, 4 y 6 (catálogos numéricos):
- **M3**
  - Fc por condición: Nuevo 0.05 · Muy bueno 0.15 · Bueno 0.35 · Regular 0.55 · Malo 0.90.
  - Fo por vida consumida: 1‑6 años 0.15 · 7‑12 0.30 · 13‑18 0.45 · 19‑24 0.60 · 25‑30 0.75.
- **M4**
  - Dman: Excelente E 1.00 · Bueno B 0.95 · Regular R 0.85 · Malo M 0.75 · Deplorable D 0.65.
  - Dtec (Fo): Misma tecnología 0.15 · Algunos cambios sensibles 0.30 · Cambios importantes, vigente en producción 0.45 · Cambios de tecnología, vigente 0.60 · Cambios de tecnología, no vigente 0.75. **Se aplica como 1 − valor**.
  - Dmerc: Excelente 1 · Bueno 0.95 · Más que regular 0.90 · Regular 0.85 · Menos que regular 0.80 · Malo 0.75 · Muy malo 0.70 · Pésimo 0.65.
- **M6**, φ(μ,τ) para τ = 0, 5, 10, 15, 20:

| μ | τ = 0 | 5 | 10 | 15 | 20 |
|---|---|---|---|---|---|
| Nulo (0) | 0.8531 | 1.1946 | 1.6729 | 2.3428 | 3.2808 |
| Suave (5) | 0.6926 | 0.9454 | 1.2905 | 1.7616 | 2.4046 |
| Regular (10) | 0.5623 | 0.7482 | 0.9955 | 1.3246 | 1.7625 |
| Intenso (15) | 0.4565 | 0.5921 | 0.7680 | 0.9960 | 1.2918 |
| Rudo (20) | 0.3707 | 0.4686 | 0.5924 | 0.7489 | 0.9468 |

Las fórmulas "1. FÓRMULA A UTILIZAR" de cada método son **imágenes** (no hay texto en celdas). Lo de arriba se reconstruyó a partir de las fórmulas vivas.

---

## (d) CIFRAENLETRAS: algoritmo exacto

La hoja es **idéntica en los 7 libros**: el hash de las filas 8‑13 coincide. TUO repite el bloque 4 veces y MEH 9. Cada bloque es: `F7` = valor; `I7 = TRIM(F13)` = resultado. Réplica en `tools/cifraenletras.py`.

### d.1 Pasos

1. `E = INT(X)`, es decir, piso. `T = FIXED(X,2,FALSE)`: texto con 2 decimales redondeados y comas de miles.
2. Dígitos de E, tomados con `RIGHT` sobre el texto del entero (fila 9):
   - billones F9;
   - miles de millones H9 (centena), I9 (decena), K9 (unidad);
   - millones M9, N9, P9;
   - miles R9, S9, U9;
   - unidades W9, X9, Z9.
   - Centavos: AB9 = penúltimo carácter de T y AD9 = último.
3. Cada grupo (c, d, u) se escribe así:
   - **Centenas**: c = 1 → "CIEN" si d = u = 0, si no "CIENTO". c = 2‑9 → DOSCIENTOS, TRESCIENTOS, CUATROCIENTOS, QUINIENTOS, SEISCIENTOS, SETECIENTOS, OCHOCIENTOS, NOVECIENTOS.
   - **Decenas**: d = 1 → DIEZ, ONCE, DOCE, TRECE, CATORCE, QUINCE, "DIECI"+unidad (DIECISÉIS, DIECISIETE, DIECIOCHO, DIECINUEVE). d = 2 → VEINTE si u = 0, si no "VEINTI"+unidad pegada. d = 3‑9 → TREINTA…NOVENTA, más " Y " + unidad si u > 0.
   - **Unidades**: DOS, TRES, CUATRO, CINCO, SEIS, SIETE, OCHO, NUEVE. SEIS lleva tilde **solo** después de DIECI o VEINTI (DIECISÉIS, VEINTISÉIS). El "UN" lo pone el sufijo del grupo (ver 4).
4. **Sufijos**:
   - Miles de millones (L10): "MIL".
   - Millones (Q10): "MILLÓN" si solo P = 1 y no hay nada arriba; si no, "MILLONES".
   - Miles (V10): "MIL". "UN MIL" cuando u = 1 y hay centenas o decenas en el grupo (VEINTIUN MIL, CIENTO UN MIL), o cuando E > 1999 y hay unidades > 0.
   - "DE " se inserta si hay millones y **todo** lo que está debajo del millón es 0 ("UN MILLÓN DE PESOS").
5. **Moneda** (AA10): "UN PESO" si E = 1; " DE PESOS " si las unidades son 11; "UN PESOS" si u = 1 y hay más dígitos; "CERO PESOS" si E = 0 y hay centavos; si no, " PESOS".
6. **Centavos**: si > 0 se agrega " CON " + palabras + " CENTAVOS" ("UN CENTAVO" si es 01, "UN CENTAVOS" si termina en 1 con decena ≥ 2).
7. Siempre se concatena **literal "00/100 M. N."**, aunque haya centavos.
8. Prefijo: "CERO" si X = 0, si no un espacio. Se envuelve en `"(" … ")"` y `TRIM`, que quita los extremos y deja un solo espacio entre palabras. Por el espacio inicial, el resultado arranca con "( ".

**Formato de salida**: `( <MAYÚSCULAS> PESOS 00/100 M. N.)`: con paréntesis, "M. N." con espacio y punto, sin la palabra "MONEDA NACIONAL" y sin "/100" variable.

### d.2 Verificación contra la caché: 18/18 idénticos

| Libro · celda | Valor | Texto en caché, igual al de la réplica |
|---|---|---|
| TCH F7 | 3,750,000 | ( TRES MILLONES SETECIENTOS CINCUENTA MIL PESOS 00/100 M. N.) |
| TR F7 | 5,030,000 | ( CINCO MILLONES TREINTA MIL PESOS 00/100 M. N.) |
| TRC F7 | 5,750,000 | ( CINCO MILLONES SETECIENTOS CINCUENTA MIL PESOS 00/100 M. N.) |
| TU / TUO F7 | 1,120,000 | ( UN MILLÓN CIENTO VEINTE MIL PESOS 00/100 M. N.) |
| TUO F20 | 1,050,000 | ( UN MILLÓN CINCUENTA MIL PESOS 00/100 M. N.) |
| TUO F33 | 1,120,000 | ( UN MILLÓN CIENTO VEINTE MIL PESOS 00/100 M. N.) |
| TUO F46 | 231,000 | ( DOSCIENTOS TREINTA Y UN MIL PESOS 00/100 M. N.) |
| RA F7 | 8,580,000 | ( OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M. N.) |
| MEH F7 / F32 | 980,000 | ( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.) |
| MEH F19 | 933,000 | ( NOVECIENTOS TREINTA Y **TRÉS** MIL PESOS 00/100 M. N.) ← defecto real en caché |
| MEH F45 | 855,000 | ( OCHOCIENTOS CINCUENTA Y CINCO MIL PESOS 00/100 M. N.) |
| MEH F58 | 1,400,000 | ( UN MILLÓN CUATROCIENTOS MIL PESOS 00/100 M. N.) |
| MEH F71 | 805,000 | ( OCHOCIENTOS CINCO MIL PESOS 00/100 M. N.) |
| MEH F84 | 720,000 | ( SETECIENTOS VEINTE MIL PESOS 00/100 M. N.) |
| MEH F97 | 1,290,000 | ( UN MILLÓN DOSCIENTOS NOVENTA MIL PESOS 00/100 M. N.) |
| MEH F110 | 930,000 | ( NOVECIENTOS TREINTA MIL PESOS 00/100 M. N.) |

### d.3 Casos límite (salen de la réplica fórmula por fórmula; no hay caché para ellos)

| Entrada | Salida del Excel | Correcto |
|---|---|---|
| 0 | `(CERO PESOS 00/100 M. N.)` (sin espacio tras "(") | ( CERO PESOS 00/100 M. N.) |
| 11 | ( ONCE **DE** PESOS 00/100 M. N.) | ONCE PESOS |
| 21 | ( VEINTIUN PESOS …) | VEINTIÚN PESOS |
| 33 | ( TREINTA Y **TRÉS** PESOS …) | TREINTA Y TRES |
| 20,002 | ( VEINTE MIL **DÓS** PESOS …) | VEINTE MIL DOS |
| 32,000 | ( TREINTA Y **DÓS** MIL …) | TREINTA Y DOS MIL |
| 33,003 | ( TREINTA Y TRÉS MIL TRES PESOS …) | TREINTA Y TRES MIL TRES |
| 21,000 / 121,000 | VEINTIUN MIL / CIENTO VEINTIUN MIL | VEINTIÚN MIL |
| 1,001,001 | ( UN MILLÓN **UN MIL** UN PESOS …) | UN MILLÓN MIL UN PESOS |
| 22,000,000 / 23,000,000 | VEINTIDOS / VEINTITRES MILLONES (sin tilde) | VEINTIDÓS / VEINTITRÉS |
| 31,000,000 | TREINTA Y **ÚN** MILLONES | TREINTA Y UN MILLONES |
| 1,000,000,000 | ( MIL MILLONES PESOS …) (falta "DE") | MIL MILLONES DE PESOS |
| 1,234.56 | ( MIL DOSCIENTOS TREINTA Y CUATRO PESOS CON CINCUENTA Y SEIS CENTAVOS **00/100** M. N.) | … PESOS 56/100 M. N. |
| 1,234.01 | … CON UN **CENTAVO00/100** M. N.) (sin espacio) | — |
| 1,234.21 | … CON VEINTIUN **CENTAVOS00/100** M. N.) | — |
| 999,999.995 | NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 00/100 (INT = 999,999, pero FIXED redondea a 1,000,000.00) | UN MILLÓN DE PESOS |

Casos correctos que conviene dejar en pruebas: 1 → "UN PESO"; 16 → DIECISÉIS; 22 → VEINTIDÓS; 23 → VEINTITRÉS; 26 → VEINTISÉIS; 100 → CIEN; 101 → CIENTO UN; 1,000 → MIL; 1,001 → MIL UN; 1,000,000 → UN MILLÓN DE PESOS; 1,001,000 → UN MILLÓN MIL; 2,000,001 → DOS MILLONES UN PESOS; 16,500,000 → DIECISÉIS MILLONES QUINIENTOS MIL.

En la práctica todos los valores concluidos se redondean a decenas de miles (o a miles en los parciales de MEH), así que **los defectos solo aparecen con dígitos 2 o 3 en la posición de miles cuando la decena de miles es ≥ 3**, como 933,000. Los centavos nunca aparecen.

**Recomendación**: implementar `cifraEnLetras(valor, {modo: "excel"|"correcto"})`. El modo "excel" sirve para la paridad y las pruebas de regresión con las 18 cachés. El perito decide cuál se imprime (pregunta i‑1). Formato correcto propuesto: `( … PESOS CC/100 M. N.)`.

---

## (e) Grafo de dependencias entre hojas (celda → celda)

Se omiten los membretes (filas 2‑7) y las fichas del Anexo 2 y el Anexo 3, que solo copian etiquetas y datos de los cuadros de mercado.

### e.1 Inmuebles urbanos (TCH; TU y RA indicados)

```
CARÁTULA (captura) ──► DATOS
  F30 Solicitante → G16 · F33 Lugar/fecha solicitud → G17 · F29 Propietario → G19
  F37 Fecha avalúo → G22 → (membrete todas) · F38 Vigencia → R22 → (membrete)
  C66 Perito → G25 → Conclusión B63 · B29:C34 dirección → B42:H47
DATOS ──► CARÁTULA:  G28 Uso → F39 · G29 Propósito → F40 · G26 Especialidad & R25 Cédula → B67 (firma)
DATOS ──► CONCLUSIÓN: G25 → B63 · G26 → H64 · R25 → O65
CARÁTULA C38 Sup. construcción ──► TERRENO T40 (TCH)          [RA: CONSTRUCCIONES Q29 → CARÁTULA C38 y TERRENO H42]
CARÁTULA C37 Sup. terreno ──► TERRENO H41 (solo RA)            [TCH/TU: TERRENO H40/H42 se teclea aparte]
TERRENO H40 Sup. terreno ──► DATOS T44 · COSTOS D18 · MERCADO F48 (sujeto terrenos) · MERCADO J91 (sujeto inmueble)
TERRENO T40 Sup. construcción ──► MERCADO J92 · RENTAS H45
TU: TERRENO H42 → MERCADO F48, INGRESOS I44 ; TERRENO S42 (sup. rentable) → COSTOS D18, INGRESOS N53
MERCADO I37/M37/M38 (lote tipo vs sujeto) ──► COSTOS D14 (Lote tipo)
MERCADO T50 ($/m² terreno concluido, tecleado) ──► COSTOS T14 = ROUND(T50,-1)
ANEXO 4 R21 Indirectos ──► COSTOS V67 (TU V46)
RENTAS T46 ──► INGRESOS Q15
COSTOS U69 / MERCADO T98 / INGRESOS I65 ──► CONCLUSIÓN R13/R15/R17 ──► L54 ──► CARÁTULA B54 y CIFRAENLETRAS F7 ──► I7 ──► CONCLUSIÓN B56 ──► CARÁTULA B56
IV. INF CONSTRUCCIONES ──► (NADA en TCH/TRC)
RA: IV. INF CONSTRUCCIONES ──► COSTOS (32 refs): C29 tipo → C26, Q29 sup → K26, tabla IE (E,N,O,P 125‑132) → D39:N46
```

**Hallazgo clave**: en TCH y TRC la hoja de construcciones es **solo descriptiva**. Edad, VUT, superficie y la tabla IE se vuelven a teclear en Costos. RA ya la vinculó (tipo, superficie, IE) y es el modelo a seguir. En la app, Construcciones debe ser la **fuente única** de edad, VUT, VUR, superficie, clasificación y conservación que usa Costos.

### e.2 Rurales

- **TR**:
  - Carátula C36 → Terreno T41 → H41 → Mercado F43 (sujeto) e Ingresos I44.
  - DATOS G14, G17 → Carátula F29, F28.
  - Mercado T45 → Costos J14.
  - Mercado C37:C41, F41, C50 → Ingresos H61:H65, B65, D65, B78: las ofertas de venta se usan para la tasa de capitalización.
  - Costos T64, Mercado T51, Ingresos K93 → Conclusión.
- **TRC**:
  - Carátula C38 → Terreno T40 → H40 → Mercado F44; Terreno T40 → Mercado J88; Terreno H41 (sup. construcción) → Mercado J89.
  - Mercado T46 → Costos K14.
  - DATOS G16, G19 → Carátula F30, F31 (cruzados, ver h).

### e.3 MEH

```
CARÁTULA (tipo, marca, modelo, serie chasis, serie motor, matrícula, año, país, potencia, horómetro, solicitante, propietario, fechas, perito) ──► DATOS
DATOS ──► COSTOS: G41‑G43,Q43‑Q45 identificación · Q48 horas · H106 estado operativo · H116 problemas · G55/Q55 proveedor · G44 país
          · G54 cotización USD · R20 fecha cotización · G30 TIPO DE CAMBIO → R28 · G195 CALIFICACIÓN → A41 → B41 → B38 → J42 (FEd)
          · H113 frecuencia mant. → C42 · H97 Edad → F42 · H99 VUT → H42
DATOS ──► MERCADO: G42,G43,G45,H106,H113,G44,Q48 (columna "Sujeto")
DATOS E37 CLAVE ──► CARÁTULA F7 (folio) ──► membretes
COSTOS J42,L42,N42,Q42,S42 (factores del sujeto) ──► MÉTODOS ALT. W37:AE37 (Costo‑Capacidad)
COSTOS V61 · MERCADO AI91 · MÉTODOS AH55 ──► CONCLUSIÓN R13 (ROUND ‑4) / R15 / R17 ──► N54 ──► CARÁTULA B54 · CIFRA F7
COSTOS V61, MERCADO AI91, MÉTODOS AH55/AH111/AH162/AH226/AH264/AH356 ──► CIFRA F19…F110 ──► "Cifra en letras" en cada hoja
```

Los métodos alternativos 2‑6 **no leen DATOS**: Cr = 1,600,000, E = 14, T = 30 y las X del sujeto de la regresión se teclean. En la regresión, además, el sujeto no coincide con DATOS: edad 17 contra 14, 11,250 h contra 8,498, 2,950 km contra 2,145, 111 HP contra 101.

### e.4 Datos capturados que alimentan enfoques (para el constructor)

| Dato | Se captura en | Lo consumen |
|---|---|---|
| Superficie de terreno (m²) | Terreno III.3 (RA: Carátula) | Costos (sujeto), Mercado (sujeto y factor de superficie), Ingresos (sup. rentable), Datos |
| Superficie construida / vendible / rentable | Carátula o Terreno (RA: Construcciones Q) | Mercado de inmuebles (J92), Rentas (H45), Costos (RA) |
| Frente × fondo | Carátula (TU) y Terreno | TU: la superficie de la carátula (no alimenta enfoques) |
| Edad, VUT y VUR por tipo de construcción | Construcciones IV.1 | solo RA → Costos. En los demás se retecla |
| Tabla IE/EA/OC (cant., edad, VUT) | Construcciones VI o Terreno IV | solo RA → Costos |
| Lote tipo vs sujeto ("marcar X") | Mercado I37/I38 | Costos D14 (lote tipo) |
| Valor unitario de terreno concluido ($/m²) | Mercado T50, tecleado ("puedes escribir el valor") | Costos T14 |
| MEH: edad, VUT, calificación, tipo de cambio, cotización | DATOS | Costos, Mercado (sujeto), Métodos (vía factores de Costos) |

---

## (f) Diferencias entre formatos

### f.1 Estructurales

| Tema | TU | TCH | TR | TRC | MEH | RA |
|---|---|---|---|---|---|---|
| Carátula · captura de solicitante y propietario | Carátula | Carátula | DATOS | DATOS (cruzado) | Carátula | Carátula |
| Carátula · superficie | = frente × fondo | tecleada (3857.5 ≠ terreno 160) | m² (ha opcional) | tecleada | n/a | tecleada → terreno |
| Fila de fecha en DATOS | G23 | G22 | G20 | G22 | G21 | G22 |
| Sección II | Zona urbana | Zona urbana | Región + sistema natural | Región + sistema natural (clima detallado) | Inspección física | Zona urbana |
| Construcciones | — | ✔ (sin vínculo) | — | ✔ (sin vínculo) | — | ✔ vinculada a costos |
| Redondeo de ingresos | ‑4 | ‑4 | **‑2** | n/a | n/a | n/a |
| Conclusión (enfoque) | Mercado | Mercado | Mercado | Mercado | Mercado | Costos |
| Numeración romana | V‑VIII | V‑X | IV‑VIII | V‑VIII | III‑X (salta VI‑IX) | duplica "VIII" (Rentas y Conclusión) |
| Criterio técnico | 724 AD‑BI‑TU "para Terrenos Urbanos" | 724 AD‑BI‑TU | IN‑BN‑TR | IN‑BN‑TR | 724 AD‑BI‑TU | 724 AD‑BI‑TU |

RA frente a TCH, que es su plantilla:
- Se agregaron: vínculos Construcciones → Costos y Carátula; VUR por fórmula en IE; columna Cant.; Anexo de planos.
- Se ocultaron las hojas de rentas, ingresos, anexos 2‑4 y CIFRA.
- Se ocultaron filas de consideraciones (criterio y fundamento) y de conclusión (limitaciones y supuestos).
- Se reordenó: Mercado VI antes que Costos VII.

### f.2 TU contra TU_OFICIAL: la lista completa

Comparación con openpyxl de fórmulas y valores, celda por celda y en todas las hojas comunes (`tools/diff_tu.py`). Resultado:
- **18 celdas distintas fuera de CIFRAENLETRAS**.
- **172 celdas nuevas en CIFRAENLETRAS**: 3 bloques completos de conversión más sus etiquetas.
- **2 hojas nuevas**.
- Estado *veryHidden* en todas las hojas salvo Términos.

La cifra "≈24" que se mencionaba corresponde a contar estos grupos lógicos. Aquí van todas las celdas:

| # | Hoja | Celda | TU | TU_OFICIAL | Impacto |
|---|---|---|---|---|---|
| 1 | Términos y Condiciones | B52 | "…reservarse para sí, así como también, será necesario que oculten pestañas que no aplican… en el formaot de impresión no aparecerán." | Texto recortado a "…reservarse para sí." | ninguno |
| 2 | ll. DATOS | H59 (Densidad de población) | "Fija y flotante." | "Media" | dato de ejemplo |
| 3 | V. ENF. COSTOS | Y18 (factor de superficie del terreno sujeto) | `=IFERROR((D18/$D$14)^(1/$Y$17),"")` | `=IFERROR((D14/$D$18)^(1/$Y$17),"")` (**invertido**) | = 1 en el ejemplo porque D14 = D18 = 160; cambia con lote tipo ≠ sujeto |
| 4 | V. ENF. COSTOS | W49 | vacío | "Cifra en letras:" | etiqueta |
| 5 | V. ENF. COSTOS | W50 | vacío | `=CIFRAENLETRAS!I20` | imprime el valor físico en letras |
| 6‑9 | VI. ENF. MERCADO VENTA | Z42, Z43, Z44, Z45 (factor de superficie de los comparables 1‑4, → N42:N45) | `(F4x/$M$37)^(1/$Z$41)` y en la otra rama `(F4x/$F$48)^(1/$Z$41)` → 1.1757, 1.1604, 1.1447, 1.1286 | `($M$37/F4x)^(…)` y `($F$48/F4x)^(…)` (**invertido**) → 0.8506, 0.8618, 0.8736, 0.8861 | cambia el homologado. **La conclusión no cambia** porque T50 = 7,000 $/m² se teclea |
| 10 | VI. ENF. MERCADO VENTA | W56 | vacío | "Cifra en letras:" | etiqueta |
| 11 | VI. ENF. MERCADO VENTA | W57 | vacío | `=CIFRAENLETRAS!I33` | letras del mercado |
| 12‑15 | VII. ENF. INGRESOS | Z38, Z39, Z40, Z41 (factor de superficie de rentas, → N38:N41) | `(F3x/$I$44)^(1/$Z$37)` → 1.0843, 1.0772, 1.0699, 1.0624 | `($I$44/F3x)^(1/$Z$37)` (**invertido**) → 0.9223, 0.9283, 0.9347, 0.9413 | cambia la renta homologada |
| 16 | VII. ENF. INGRESOS | K82 (valor por capitalización) | `=U72/I80` → 230,800.37 | `=ROUND(U72/I80,-3)` → 231,000 | la conclusión usa K92, no K82 |
| 17 | VII. ENF. INGRESOS | B93 | vacío | "Cifra en letras:" | etiqueta |
| 18 | VII. ENF. INGRESOS | B94 | vacío | `=CIFRAENLETRAS!I46` | letras de K82 |
| 19 | CIFRAENLETRAS | E4 | vacío | "VALOR DE PORTADA" | etiqueta |
| 20 | CIFRAENLETRAS | E17 + bloque filas 20‑26 (F20 `='V. ENF. COSTOS'!U48`, I20 `=TRIM(F26)`, más 55 celdas de la mecánica) | vacío | "VALOR FISICO" + bloque | 57 celdas |
| 21 | CIFRAENLETRAS | E30 + bloque filas 33‑39 (F33 `='VI. ENF. MERCADO VENTA'!T55`, I33) | vacío | "VALOR DE MERCADO" + bloque | 57 celdas |
| 22 | CIFRAENLETRAS | E43 + bloque filas 46‑52 (F46 `='VII. ENF. INGRESOS'!K82`, I46) | vacío | "VALOR POR INGRESOS" + bloque | 57 celdas |
| 23 | (hoja) | SystemConfig | — | Nº de registro, código de activación, DOFB = 2026‑09‑21, DOFE = 2027‑09‑21, DOLU = 46286, AVRG = 2 | licencia anual |
| 24 | (hoja) | SysAppInfo | — | Desarrollador "Herramientas Excel", herramientasexcel.com, App "Formato Avalúo PT‑TU." v1 r1, App ID "xl1014", "Licencia a nombre de Brandon Uriel Garcia Ramos", B11 lista "Sí,No" (la **única** validación de datos de los 7 libros) | — |

Otros detalles:
- Filas ocultas extra en TUO: Costos 46‑47 y Mercado 54.
- VBA (vbaProject.bin): solo licenciamiento (`Workbook_Open`, `Workbook_SheetActivate`, formulario de activación, caducidad, `xlSheetVeryHidden`). **No hay lógica de cálculo en VBA.**

**Conclusión f.2**: la única diferencia **metodológica** es la **dirección del factor de superficie** (costos Y18, mercado Z42:Z45, ingresos Z38:Z41) y el redondeo de K82. Todo lo demás es presentación o licencia. Hay que definir con el perito qué dirección es la vigente (pregunta i‑3).

---

## (g) Catálogos y "listas desplegables"

**No hay validaciones de datos en ningún libro.** Se revisó el XML crudo, incluido `x14:dataValidation`: 0 coincidencias. La única excepción es SysAppInfo!B11 = "Sí,No" en TUO.

Tampoco hay nombres definidos útiles: todos son `#REF!` heredados de otra plantilla. El formato condicional solo resalta la opción "x" de lote tipo o sujeto en Mercado I37/I38. En Costos D14 queda una regla rota `#REF!="x"`.

Los "catálogos" son **implícitos**. Salen de las notas de celda (406 notas, en `tools/notes_merged.json`) y de los valores observados. Estas son las opciones exactas para los selects de la app:

| Catálogo (id propuesto) | Opciones exactas | Fuente |
|---|---|---|
| `proximidad_SHF` | 1 Céntrica · 2 Intermedia · 3 Periférica · 4 De expansión · 5 Rural (con definición por nivel) | nota DATOS B54/B55/B50 |
| `clase_inmueble` | 1 Mínima · 2 Económica · 3 Interés social · 4 Medio · 5 Semilujo · 6 Residencial · 7 Residencial plus (con descripción) | nota Construcciones B17/N20 |
| `clase_edificio` | A+ · A · B · C | nota Construcciones B19/B22 |
| `alta_media_baja` (densidad de población) | Alta · Media · Baja | nota DATOS B58 |
| `tipo_operacion` (Uso del avalúo) | Adquisición · Venta · Permuta · etc.; observado "Para su posible compra - venta" | nota DATOS B28 |
| `tipo_valor` (Propósito) | Valor Comercial · Valor Potencial · etc.; observado "Estimar el Valor Comercial" | nota DATOS B29 |
| `finalidad_dictamen` | Valor Mínimo de Enajenación · Valor Máximo de Adquisición · Monto de Indemnización; base: Valor Comercial / Valor de Realización Ordenada | nota Carátula B51 |
| `tipo_ie` | I.E. (instalación especial) · E.A. (elemento accesorio) · O.C. (obra complementaria) | tablas IE |
| `privativa_comun` | P = Privativa · C = Común (celdas X "no borrar") | nota Costos |
| `homologar_segun` | Lote tipo (I37 = "x") · Sujeto (I38 = "x"; "cuando no hay lote tipo en la zona") | Mercado |
| `conservacion` (observado) | Bueno · Regular (IE: "bueno"/"regular"); MEH usa `estado_componente` | valores |
| `clasif_region` / `fuente_hidrica` | Agostadero · Agua rodada · Temporal · Riego por aspersión · Riego por goteo | notas DATOS B48/B52, Mercado AD19 |
| `clima` | Seco · Semi Seco · Árido · Semi Árido · Húmedo · Semi Húmedo · Templado · Lluvioso · Mediterráneo | nota DATOS B62/B64 |
| `precipitacion` | Débil (< 2 mm/hr) · Moderada (2 a 15) · Fuertes (15 a 30) · Muy fuertes (30 a 60) · Torrenciales (> 60) | nota B63/B65 |
| `temperatura` | Muy Seco · Seco · Desértico · Cálido Húmedo · Cálido Sub Húmedo · Templado Húmedo · Templado Subhúmedo (+ media, máxima y mínima + fuente) | nota B64/B66 |
| `siniestralidad` | Heladas · Granizadas · Sequías · Inundaciones · Otros | nota B65/B68 |
| `recursos_acuiferos` | Naturales: Mares, Lagunas, Lagos, Ríos, Av. hidráulicas, Aguas subterráneas · Artificiales: Presas, Vasos, Canales de riego | nota B69/B73 |
| `origen_geologico` | Ígneas · Sedimentarias · Metamórficas · Mixtas | nota O69/B74 |
| `salinidad` | Nula · Mínima · Media · Abundante | nota Terreno B60 |
| `erosion` | Tipo: Hídrica · Eólica / Forma: Laminar · Surcos · Cárcavas / Grado: Nula a incipiente · Moderada · Severa · Total | nota Terreno B61 |
| `pedregosidad` | Sin piedras · Ligeramente pedregoso · Pedregoso · Muy pedregoso · Extremadamente pedregoso | nota Terreno M60 |
| `productividad` | ALTA · MEDIA · BAJA (marcar X) | TRC Terreno |
| `tipo_cultivo` | Anuales · Perennes | nota Terreno B94 |
| `uso_suelo_rural` (observado) | Agrícola de temporal · Forestal · Cuerpo de agua · Apicultura · Construcción habitacional · Otro | TR/TRC III.9 |
| `mantenimiento_meh` | Preventivo · Correctivo · Predictivo | nota MEH DATOS B108 |
| `clasif_bien` (MEH) | Original · Restaurado · Modificado · Personalizado · Otro | MEH DATOS III.2 |
| `calificacion_meh` | 10 Nuevo (1.00) · 9 Excelente (0.99) · 8 Muy bueno (0.975) · 7 Bueno (0.92) · 6 Regular (0.82) · 5 Deficiente (0.66) · 4 Malo (0.47) · 3 Muy Malo (0.25) · 2 Ruinoso (0.10) · 1 Chatarra (0) | MEH DATOS H195 / Costos B41 |
| `componentes_calificacion` | Motor, Chasis, Carrocería, Estructura externa, Tren de rodaje (llantas), Sistema eléctrico, Sistema hidráulico, Pintura, Piezas especiales, Interiores, Cristales, Faros, Espejos, Otros, Personal de operación, Personal de mantenimiento | MEH III.3 |
| `nivel_oferta` (MEH) | Muy alta · Alta · Media · Media baja · Baja · Nula | MEH Mercado VI.1 |
| `tipo_cotizacion` (MEH) | Nuevo igual · Usado igual · Similar nuevo · Similar usado | MEH Costos V.2 |
| `estado_operativo` | Activo · Inactivo | MEH |
| `si_no` | Sí · No | MEH (bitácora, manual, aditamentos) |
| `mm3_condicion`, `mm3_vida`, `ross_dman`, `ross_dtec`, `ross_dmerc`, `caires_phi` | ver c.5 (tablas numéricas) | METODOS ALTERNATIVOS |

Notas de ayuda que hay que llevar a la app como *tooltip*:
- Mercado: "ordenar comparables de mayor a menor superficie"; "factor de superficie recomendable < 1.25"; "potencia n = el cociente calculado o el criterio del perito"; "$/m² concluido: puedes escribir el valor según tu mejor criterio".
- Ingresos: "para terrenos no habitacionales pequeños y medianos calcular hasta I.B.E.; para los grandes, hasta I.N.O."; "no aplicar dos veces el factor de negociación".
- MEH: "comparables ±5 años de edad"; "si la edad consumió la vida útil, VUT = Edad + 1".

---

## (h) Errores y riesgos detectados en el Excel

**Datos y vínculos**
1. **TRC Carátula, Propietario y Solicitante cruzados**: F30 "Propietario" `='ll. DATOS'!G16` apunta a *Solicitante* y F31 "Solicitante" `=G19` apunta a *Propietario*.
2. **MEH DATOS P44/Q44**: la etiqueta "No. de Serie Motor" muestra `C33`, que es la serie del **chasis**. Además H101/H102 están cruzados: "Odómetro (HRS)" = horas, "Horómetro (KMS)" = km.
3. **RA Costos ← tabla IE, filas desfasadas**: M41 `=O129` (debería ser O127), M42 `=O130` (O128), M43 `=O131` (O129). Hoy no afecta porque todas las edades son 2. Tampoco hay M45/M46 vinculadas (edad de calentador y tinacos).
4. **Superficie de terreno con varias fuentes**: TCH Carátula C37 = 3,857.5 contra Terreno H40 = 160 (DATOS muestra 160 y la carátula 3,857.5). TU calcula la carátula como frente × fondo y el terreno se teclea aparte. DATOS "Descripción" dice 110 m². No hay una fuente única.
5. **TCH, TRC y TU: Construcciones no alimenta Costos.** Edad, VUT, superficie e IE se teclean dos veces. En IE (TU, TCH, TR, TRC) la VUR se teclea en vez de `VUT−Edad`.
6. **TR/TRC III.9**: la SUMA de usos de suelo (3,160 y 3,360 "ha", en realidad m² en formato ha‑a‑ca) no cuadra con la superficie total (7,295.15 y 3,857.5) y nada lo valida.
7. **Anexo 4 Indirectos**: la base "V.N.R. de las construcciones" (J16:J20) no está vinculada a Costos, así que el subtotal siempre es 0 salvo que se teclee.
8. **Folio** de TU y TCH con prefijo "TRC". Cédula federal vacía en TU, TCH y TUO: la firma queda "Ced. Fed. ". "Fecha de reporte" no se actualiza (2 de julio de 2025 en todos).

**Conclusión y fundamentos**
9. La conclusión es una referencia fija (`=R15` o `=R13`). Si se captura "NO APLICA" en el enfoque referenciado, la carátula muestra texto y CIFRA falla. No hay justificación estructurada del enfoque elegido.
10. TU y TUO: el resumen de ingresos toma **K92** (valor presente de anualidad, filas **ocultas** 84‑92), no K82 (capitalización directa), que es el que TUO imprime en letras.
11. Doble redondeo en MEH: 933,000 en la hoja de costos contra 930,000 en el resumen. TR redondea ingresos a ‑2 y los demás a ‑4.
12. "Otras consideraciones" de la conclusión cita la **Ley Agraria art. 93 fr. II** y el art. 143 fr. VII LGBN **también en formatos urbanos y MEH**, lo que contradice el fundamento de Consideraciones (143 fr. I, 145, 148).
13. Fundamento legal y supuestos de la carátula en **filas ocultas** (43‑45, 57‑61): no se imprimen aunque el texto exista.

**CIFRAENLETRAS** (d.3)
14. Tildes erróneas "TRÉS"/"DÓS" tras TREINTA…NOVENTA (hay un caso real en caché: 933,000); faltan tildes en VEINTIÚN, VEINTIDÓS y VEINTITRÉS de millones; "ONCE DE PESOS"; "UN MILLÓN UN MIL UN"; "MIL MILLONES PESOS"; centavos en letras **y** "00/100"; espacios faltantes ("CENTAVO00/100"); "(CERO…" sin espacio; `INT` contra `FIXED` en fracciones ≥ .995.

**MEH**
15. "CALIFICACIÓN PROMEDIO" es en realidad la **moda**; en empate gana la calificación más baja.
16. El factor por calificación se arma como **texto** concatenado con espacios y Excel lo convierte a número. Puede dar `#VALUE!` con separador decimal coma.
17. La conservación se aplica dos veces: FEd ya incluye el factor por calificación (0.975) y FCo = 0.975 se vuelve a multiplicar (Costos L42 y Métodos Y37). Hay que confirmarlo (pregunta i‑7).
18. Los porcentajes de participación suman 100.6 %.
19. Regresión: salida **estática** pegada a mano; el sujeto no coincide con DATOS (edad 17 contra 14; horas 11,250 contra 8,498; km 2,950 contra 2,145; HP 111 contra 101); comparables C9‑C14 **duplicados** (filas 99‑104 repiten 93‑98 con otro odómetro), lo que infla n = 20; X7 lee AR117, saltando AR116; Xn lee AR169, fuera de la tabla.
20. Métodos 3‑6: Cr, E y T tecleados (1,600,000 contra el VRN de costos, que es 1,250,502), sin vínculo con DATOS ni con Costos. Helio de Caires: D(μ,τ) tecleado; t = φ·E se calcula pero no se usa.
21. Anexo 2 de MEH (factores): las etiquetas (FEd, FCo, FMt, FOt, FOe) llevan justificaciones de otro contexto (negociación, agrología, vías) y la sección 2 está en `#REF!`.

**Presentación y otros**
22. Anexo 3 de inmuebles: los textos de justificación están fijos por posición y no casan con la etiqueta. TCH: "Serv.:" se explica como agrología, "Clasif.:" como topografía, "Top.:" como servicios.
23. Etiquetas "$/m²" en el mercado de MEH; faltas ortográficas en etiquetas ("Fabración", "VALORAIÓN", "Marstonn", "IDENTIFACIÓN", "homologoados", "Telefóno", "suceptibles").
24. Nombres definidos rotos (`#REF!`) y formato condicional roto en Costos D14. Hay texto basura "niniij" en la carátula de RA (fila oculta).
25. **Propiedad intelectual**: las hojas "Términos y Condiciones" declaran que la estructura, fórmulas y textos son propiedad de "Hoja de Excel para Cálculo de Presupuestos de Obra / herramientasexcel.com" y prohíben su reproducción. TUO tiene licencia anual (vence 2027‑09‑21).

---

## (i) Preguntas concretas para el perito (Ing. Álvaro Gutiérrez)

1. **Cifra en letras**: ¿replicamos el Excel tal cual ("TREINTA Y TRÉS MIL", "ONCE DE PESOS", siempre "00/100") o usamos la versión gramaticalmente correcta con centavos reales "CC/100 M. N."? ¿El formato con paréntesis "( … PESOS 00/100 M. N.)" es obligatorio?
2. **Conciliación**: ¿siempre se concluye con **un solo** enfoque (mercado por defecto; costos cuando no hay mercado, como en Arandas) o quiere poder **ponderar** (p. ej. 70/30)? ¿El redondeo del valor concluido es siempre a decenas de miles? ¿Por qué TR redondea ingresos a centenas y MEH métodos alternativos a miles?
3. **Factor de superficie**: TU usa (Comparable / Sujeto)^(1/n) y TU OFICIAL lo invierte (Sujeto / Comparable)^(1/n), en costos, mercado e ingresos. ¿Cuál es el correcto y vigente? ¿Aplica igual a TCH, TR y TRC?
4. **Ingresos TU**: el resumen usa K92 (valor presente de rentas, filas ocultas) y TU OFICIAL imprime en letras K82 (capitalización directa). ¿Cuál debe ir a la conclusión?
5. **Vigencia**: ¿siempre fecha del avalúo + 6 meses, o hay casos distintos (p. ej. INDAABIN, expropiación)? ¿Qué patrón de **folio** quiere, TIPO‑consecutivo‑MM‑AAAA? ¿Consecutivo por despacho o por tipo?
6. **Fuente única de superficies**: ¿la superficie de terreno se captura en la carátula o en III.3? ¿La de construcción sale de la suma de la tabla IV.1? ¿Sup. vendible y sup. rentable son campos distintos?
7. **MEH conservación**: FEd ya multiplica por el factor de calificación (8 → 0.975) y además se aplica FCo = 0.975. ¿Es intencional (doble castigo) o FCo debe ser 1 cuando se usa la calificación? ¿La calificación "promedio" debe ser la moda (como hoy), el promedio o la mediana de las X?
8. **MEH métodos alternativos**: ¿cuál(es) deben llegar a la conclusión? Hoy solo Costo‑Capacidad. ¿Cr, E y T de los métodos 3‑6 deben tomarse de Costos y DATOS en lugar de teclearse? ¿La regresión la seguirá corriendo fuera (y pegando coeficientes) o quiere que la app calcule la regresión con las X que elija? ¿Los comparables C9‑C14 duplicados son intencionales?
9. **Construcciones → Costos**: ¿confirmamos que edad, VUT, superficie, clasificación y la tabla IE se capturan **una vez** en Construcciones (como en Arandas) y Costos las lee? ¿La VUR es siempre VUT − Edad o a veces se ajusta a mano (p. ej. "VUT = Edad + 1 si ya consumió la vida útil")?
10. **Fundamento legal**: el bloque "Otras consideraciones" de la conclusión cita la Ley Agraria también en urbanos y MEH. ¿Qué texto corresponde a cada tipo? ¿El fundamento y los supuestos de la carátula deben imprimirse (hoy están ocultos)?
11. **Catálogos**: ¿aprueba convertir en listas cerradas los catálogos de (g) (proximidad SHF, clase de inmueble, clase de edificio, clima, salinidad, etc.) o prefiere texto libre con sugerencias? ¿"Nivel socioeconómico" usa la escala AMAI (A/B, C+, C, C‑, D+, D, E)?
12. **VRO / VLF**: aparecen definidos pero nunca se calculan. ¿Se requiere calcularlos (p. ej. % sobre el valor comercial) para ciertos dictámenes?
13. **Anexo 4 Indirectos**: ¿la base debe ser automáticamente el VNR de construcciones de Costos?
14. **Plantilla de terceros**: los libros declaran ser propiedad de herramientasexcel.com y prohíben su reproducción. ¿El despacho tiene derecho a trasladar estructura y textos (definiciones, supuestos, declaraciones) a la app, o redactamos textos propios?
15. **Membrete y firma**: ¿el membrete es del despacho (Valuadores de los Altos) o del perito firmante (como en Arandas y TR "VALUAXIS")? ¿Varios peritos firman con su cédula y especialidad (Mario Ortiz, Jorge I. Gutiérrez, Álvaro Gutiérrez)?

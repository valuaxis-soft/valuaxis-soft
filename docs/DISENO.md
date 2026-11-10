# Sistema visual

Valuaxis es una herramienta de trabajo para valuadores: se usa horas seguidas, con cifras que se firman. El diseño busca **confianza** (tinta azul marino), **calma** (papel cálido, no gris frío), **precisión** (cifras tabulares, alineadas) y un poco de **vida** (el verde de "aprobado", líneas topográficas, movimiento discreto). Todo vive en `src/app/globals.css`; ninguna pantalla debería escribir colores sueltos.

## Marca

El logo no cambia: la casa con palomita sobre azul marino `#014069` y verde `#40a47e` (`src/app/icon.svg`, `src/components/brand/valuaxis-logo.tsx`). Alrededor de él:

- **Curvas de nivel** (`src/components/brand/contour-lines.tsx`): el motivo de fondo. Remite a terreno, levantamiento y croquis. Se usa con opacidad de 6 a 8 % sobre las bandas de tinta, nunca detrás de texto largo.
- **Imagen para redes** (`src/app/opengraph-image.tsx`): 1200 × 630, tinta a azul marino, precio en verde.

## Paleta

Tokens de shadcn en oklch, claro en `:root` y `.light`, oscuro en `.dark`. El documento del avalúo (vista previa, dictamen, PDF) va dentro de `.light` y siempre se ve claro.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `background` | `oklch(0.982 0.006 85)` `#fbf9f5` papel | `oklch(0.215 0.022 250)` | Fondo de página |
| `foreground` | `oklch(0.215 0.035 250)` `#0c1a29` tinta | `oklch(0.96 0.008 85)` | Texto |
| `card` / `popover` | `oklch(0.995 0.003 85)` | `oklch(0.255 0.024 250)` | Superficies |
| `primary` | `oklch(0.36 0.091 245.5)` = `#014069` | `oklch(0.78 0.08 232)` | Acción principal, enlaces, marca |
| `secondary` / `muted` | `oklch(0.945 0.012 80)` arena | `oklch(0.31 0.022 250)` | Bandas alternas, rellenos |
| `muted-foreground` | `oklch(0.5 0.017 75)` | `oklch(0.78 0.014 80)` | Texto secundario |
| `accent` | `oklch(0.945 0.03 165)` menta | `oklch(0.34 0.05 165)` | Hover de menús, estado "calculado" |
| `success` | `oklch(0.649 0.11 165)` = `#40a47e` | `oklch(0.74 0.12 165)` | Valor, aprobado, CTA sobre tinta. Solo rellenos e íconos |
| `success-strong` | `oklch(0.47 0.1 165)` | `oklch(0.8 0.11 165)` | Verde para **texto** (6:1 sobre papel) |
| `highlight` | `oklch(0.7 0.12 68)` ocre cantera | `oklch(0.79 0.11 72)` | Acento secundario sobrio: un dato a observar, una marca. Nunca para errores |
| `highlight-strong` | `oklch(0.5 0.1 58)` | `oklch(0.83 0.1 72)` | Ocre para texto |
| `ink` / `ink-foreground` | `oklch(0.24 0.06 248)` / papel | más profundo | Bandas oscuras de marca (hero, CTA, panel de acceso) |
| `destructive` | `oklch(0.58 0.22 25)` | `oklch(0.7 0.18 25)` | Errores y borrar |
| `border` / `input` | `oklch(0.895 0.012 80)` / `0.875` | blanco 14 % / `oklch(0.6 0.015 250)` | Bordes; `input` tiene más contraste para los campos |

Contraste medido (WCAG 2): tinta sobre papel 16.6:1; `muted-foreground` sobre papel 5.7:1 y sobre `muted` 5.2:1 (en oscuro, 8.7:1); `success-strong` sobre papel 6.1:1; tinta sobre `success` 5.3:1 (botón verde); papel sobre `primary` 10.4:1. El verde de marca **no** pasa AA como texto sobre papel (2.9:1): para texto se usa `success-strong`.

Las gráficas usan `chart-1` (azul), `chart-2` (verde de marca), `chart-3` (ocre), `chart-4` (violeta) y `chart-5` (terracota).

### Estados del avalúo

Una sola fuente: `STATUS_TONE_CLASSES` en `src/features/dashboard/valuation-status.ts`. La etiqueta es un punto de color más el nombre del estado sobre un tinte del mismo color; el texto siempre va en `foreground`, así que el contraste no depende del tono (14:1 o más en claro, 10:1 o más en oscuro).

| Estado | Token | Por qué |
|---|---|---|
| Nuevo | `muted` / `muted-foreground` | Aún no pasa nada |
| En edición | `highlight` (punto en `highlight-strong`, 5.3:1) | Un dato a observar, sin alarma |
| En revisión | `primary` | El paso formal del despacho |
| Terminado | `success` | Aprobado |
| Reabierto | `chart-4` (violeta) | No hay token semántico; se distingue del ocre, del verde y del rojo |
| Cancelado | `destructive` | Ya no sigue |

No se agregaron tokens `warning` ni `info`: con estos alcanza. "Requiere tu atención" usa `primary` para "Por concluir" y `highlight` para "Sin comparables".

## Tipografía

Las tres familias se sirven desde nuestro dominio con `next/font` (se descargan al compilar; la CSP no permite orígenes de fuentes externos).

| Familia | Token | Para qué |
|---|---|---|
| **Fraunces** (variable, eje de tamaño óptico) | `font-display` | Títulos de la página pública, del acceso y de tarjetas destacadas. Serifa cálida con carácter editorial: recuerda al dictamen impreso sin verse anticuada. No lleva cifras tabulares: no se usa en tablas |
| **IBM Plex Sans** (variable) | `font-sans`, `font-heading` | Toda la interfaz. Diseñada para pantallas técnicas, muy legible en tamaños chicos y con **cifras tabulares por omisión** (todos los dígitos miden lo mismo): las columnas de importes quedan alineadas. Aun así, en tablas y totales se pone `tabular-nums` |
| **Geist** | `font-document` | Solo el documento del avalúo. Se conserva para que un cambio en la interfaz nunca mueva la paginación del dictamen (`[data-print-document]`, `article[data-document-page]`) |

Escala: cuerpo 16 px (`text-base`), secundario 14 px, etiquetas 12 px con `tracking-[0.14em]` en mayúsculas. Títulos de sección de la página pública 30 → 44 px; H1 42 → 60 px, `leading-[1.04]`, `text-balance`. Interlineado de párrafo 1.5–1.65. Línea de lectura de 60 a 75 caracteres (`max-w-xl` / `max-w-2xl`).

## Forma, espacio y elevación

- **Radio base** `--radius: 0.625rem` (10 px). Tarjetas `rounded-2xl`, bandas y paneles destacados `rounded-3xl`, controles `rounded-lg`.
- **Espaciado** en múltiplos de 4 px. Secciones de la página pública: `py-20` en móvil, `lg:py-28`. Contenedor `max-w-6xl` con 16 px de margen lateral en móvil (`px-4`), 24 px desde `sm`.
- **Sombras** teñidas con la tinta, no negras: `shadow-soft` (en reposo), `shadow-lift` (hover, paneles flotantes), `shadow-float` (solo la maqueta del hero y el precio). Junto con `ring-1 ring-border`.
- **Áreas táctiles** de 44 px mínimo en la página pública y en el acceso (`h-11`/`h-12`). El panel de acceso sube los campos a 44 px solo dentro de `AuthShell`.

## Movimiento

El movimiento cuenta la historia del producto: un cálculo que se arma, un comparable que cae en el mapa, una cifra que llega al dictamen. No decora. Vive en `src/app/motion.css`; la única pieza de JavaScript es `LandingMotion` (`src/features/marketing/landing-motion.ts`, una isla de cliente que no pinta nada).

### Reglas

1. **Movimiento reducido manda.** Todo está dentro de `@media (prefers-reduced-motion: no-preference)`; con movimiento reducido se ve el estado final, quieto. `LandingMotion` tampoco arranca el ciclo del hero.
2. **Sin JavaScript se ve el estado final.** Los estados de partida («apagado») solo existen cuando `LandingMotion` pone `.vx-motion` en `<html>`, y solo bajo un disparador que aún no se enciende: `[data-vx]:not([data-on])`. `data-vx="in"` se enciende al entrar en pantalla (IntersectionObserver); `data-vx="step"` lo enciende el ciclo del hero en su paso `data-vx-step`. Lo que ya estaba en pantalla al hidratar se queda como está, sin repetir.
3. **Solo `transform` y `opacity`** (y `stroke-dashoffset` en SVG). Dos excepciones de solo pintura, sin layout: el tachado de «Con Excel y Word» (`text-decoration-color`) y el marcatextos del anuncio (`background-size`). La altura de las preguntas frecuentes se anima con `interpolate-size` porque la abre el usuario (no cuenta para CLS).
4. **Nada que retrase el LCP.** El H1 entra palabra por palabra desde una opacidad ya pintada (0.14), sin JavaScript; el texto cuenta para el LCP desde el primer cuadro. El hero no usa `vx-reveal`.
5. **Ciclos acotados (WCAG 2.2.2).** Lo que se repite se detiene antes de 5 s (pulso del pin y del radio: dos vueltas; brillo del botón: dos pasadas) o tiene pausa: el ciclo del hero da dos vueltas y para en el estado final, se pausa fuera de pantalla o con la pestaña oculta, y tiene un botón de pausa / reanudar / repetir. La flotación de las tarjetas y la deriva de las curvas se pausan con él. Nada parpadea.
6. **Cifras que cuentan sin moverse de lugar.** `Odometer` (`src/features/marketing/components/odometer.tsx`) gira una tira 0–9 por dígito con `transform`; el ancho lo da el dígito final invisible, así que no hay CLS. El valor accesible va una vez en `sr-only`; lo animado es `aria-hidden`.

### Duraciones y curvas

| Uso | Duración | Curva |
|---|---|---|
| Hover, presión de botones (`vx-press`, `vx-nudge`) | 0.08–0.3 s | `--ease-out-quint` |
| Aparecer (`vx-seq-fade`, `vx-seq-slide`, `vx-reveal`) | 0.55–0.7 s | `--ease-out-quint` |
| Aparecer con rebote corto (`vx-seq-pop`: palomitas, insignias) | 0.7 s | `--ease-out-back` |
| Cifras (`Odometer`) | 1.2 s + 70 ms por dígito | `--ease-out-quint` |
| Mover piezas grandes (`vx-seq-move`: abanico del dictamen, marcador del rango) | 1 s | `--ease-out-quint` |
| Línea de pasos (`vx-steps-fill`) | 2.2 s | `--ease-in-out-soft` |
| Ciclos lentos (`vx-float`, `vx-drift`) | 6–46 s | `--ease-in-out-soft` |
| Escalonado entre elementos hermanos | 55–260 ms (`--vx-stagger`) | — |

Retrasos: `--vx-base` (en el contenedor o el elemento) + `--vx-i` × `--vx-stagger`. Al apagarse (reinicio del hero) todo regresa en 0.3 s sin retraso.

### Clases

| Clase | Qué hace |
|---|---|
| `vx-reveal` | Entra desde 24 px abajo. Con `animation-timeline: view()` va ligada al scroll (Chrome, Edge); en Safari y Firefox la dispara `LandingMotion` con una transición |
| `vx-seq-fade` / `-slide` / `-pop` / `-move` | Pieza de una secuencia: aparece, se desliza, «brota» o viaja desde `--vx-from` |
| `vx-seq-grow-x` / `-grow-y` | Barras y líneas SVG que crecen desde su base |
| `vx-seq-draw` | Trazo que se dibuja (íconos Lucide; en otros trazos, `pathLength="1"` y `--vx-len: 1`) |
| `vx-seq-strike`, `vx-seq-mark` | Tachado y marcatextos (excepciones de pintura) |
| `vx-seq-drop` | Pin que cae con rebote |
| `vx-draw` | Línea de regresión que se traza con el scroll |
| `vx-float`, `vx-float-delayed`, `vx-drift`, `vx-parallax` | Flotación de 6 px de dos tarjetas del hero, deriva lenta y parallax de las curvas de nivel |
| `vx-pulse`, `vx-breathe` | Pulso del pin sujeto y del radio de búsqueda (dos vueltas) |
| `vx-press`, `vx-nudge`, `vx-shine` | Botones: se elevan 1 px, se hunden al presionar, la flecha avanza; brillo del botón del precio |
| `vx-faq` | Apertura y cierre de `<details>` (`::details-content` + `interpolate-size`; sin soporte, solo se desvanece el contenido) |
| `vx-auth-*` | Acceso: la foto se asienta (zoom de 1.12 a 1.02), las curvas entran a la deriva y el texto del panel y la tarjeta suben a su lugar. Solo CSS, una vez, menos de 5 s |

### Qué se mueve en cada sección

- **Encabezado:** al bajar se compacta (fondo a escala 0.81, fila 6 px arriba, logo al 94 %) y toma sombra; todo con `transform`, así que nada debajo se recorre. El enlace de la sección visible queda marcado (`aria-current="location"`, subrayado verde).
- **Hero:** titular palabra por palabra y subrayado que se dibuja; la maqueta trabaja sola (`src/features/marketing/hero-cycle.ts`): se limpia, entran las cuatro filas con sus factores y el homologado contando, se llenan promedio, mediana y adoptado, el marcador se desliza al rango, aparece «Calculado», el valor concluido cuenta hasta $3,482,000.00 y la cifra en letras se escribe.
- **Cifras, precio:** conteo al entrar.
- **Excel vs Valuaxis:** las ✕ se dibujan y tachan cada línea; luego las ✓ se palomean.
- **Cuatro pasos:** la línea se llena y cada paso se enciende al llegar.
- **Tres enfoques:** barras que crecen, curva de depreciación que se traza, rentas que alimentan el valor capitalizado; al pasar el cursor la tarjeta se eleva y la gráfica se acerca.
- **Dictamen:** las páginas se abren en abanico; al pasar el cursor se separan más.
- **Mapa:** los pines caen con rebote, el radio respira, la ficha del comparable se desliza.
- **IA:** cada fragmento del anuncio se resalta y su campo se llena y se palomea en el mismo orden.

No hay transiciones entre páginas: la View Transitions API de React (`<ViewTransition>`) sigue en canary y la navegación entre la página pública y el acceso es del lado del cliente, donde `@view-transition` no aplica.

## Tono de voz

- Español de México, de tú, como un colega que también valúa. Frases cortas.
- Concreto: "Homologación, factores y estadísticos se recalculan solos", no "Potencia tu productividad".
- **Nunca prometer lo que el sistema no hace** ni cifras inventadas de ahorro. Cada afirmación de la página pública sale de `docs/` (`src/features/marketing/content.ts`).
- El criterio es del valuador: "el sistema calcula y avisa", "tú eliges", nunca "Valuaxis recomienda".
- Precios con IVA dicho explícitamente: "$170 MXN por avalúo, IVA incluido".

## Sí y no

| Sí | No |
|---|---|
| Tokens (`bg-primary`, `text-success-strong`) | Hex sueltos en componentes (salvo el documento impreso y las maquetas que imitan papel) |
| Verde para valor, aprobado, "dentro del rango" | Verde como color de texto sobre papel (usa `success-strong`) |
| Ocre para resaltar un dato | Ocre o verde para errores; para eso está `destructive` |
| `font-display` en títulos | `font-display` en tablas, formularios o cifras alineadas |
| Maquetas con datos inventados y verosímiles | Capturas con datos de clientes reales |
| Movimiento que explica (una línea que se traza, un pin que late, un cálculo que se arma) | Animación de adorno; ocultar el H1 al cargar; carruseles automáticos o ciclos sin pausa |
| Ícono + texto en estados | Comunicar un estado solo con color |

## Imágenes

Las fotos de la página pública y del acceso son de stock con licencia que permite uso comercial sin atribución obligatoria. Aun así se registran aquí. Viven en `public/marketing/`, recortadas al tamaño máximo en que se muestran (2x) y sin metadatos. Se muestran con `next/image` con `sizes` y dimensiones fijas; solo la del panel de acceso se carga de inmediato (`preload`). Se dibujan con `Photo` (`src/components/brand/photo.tsx`, `getImageProps`): mismo optimizador y `srcset` que `next/image`, pero sin JavaScript de cliente. Al agregar una foto: solo de unsplash.com o pexels.com, sin caras reconocibles, placas ni números de casa legibles, y registrarla en esta tabla.

| Archivo | Dónde se ve | Foto original | Autor | Licencia |
|---|---|---|---|---|
| `dictamen-portada.webp` (640 × 373) y `og-fachada.jpg` (520 × 630) | Portada del dictamen de muestra; imagen para redes | https://unsplash.com/photos/a-white-house-with-a-black-door-and-windows-JehgZCrPyuQ (Culiacán, Sin.) | Fotografías inmobiliarias (@fotosinmobiliarias) | Unsplash License |
| `anuncio-casas.webp` (880 × 495) | Anuncio de la sección de IA | https://unsplash.com/photos/a-white-house-with-a-tree-in-front-of-it-sbIdDNixBog (Culiacán, Sin.) | Fotografías inmobiliarias (@fotosinmobiliarias) | Unsplash License |
| `comparable-c2.webp` (400 × 200) | Ficha del comparable en el mapa | https://unsplash.com/photos/a-house-with-a-cactus-in-the-front-yard-wM4g_dRAlN0 (Tulum, Q.R.) | Fito García (@fitogarciaa) | Unsplash License |
| `acceso-fachada.webp` (720 × 1080) | Panel de marca de iniciar sesión, registro y recuperación | https://unsplash.com/photos/a-brick-building-with-potted-plants-and-a-gate-Rf8_KrUfovc (Guadalajara, Jal.) | Jaime García (@arq_jgarcia) | Unsplash License |

Las maquetas siguen usando datos inventados; las fotos solo reemplazan los dibujos.

## Página pública

`src/app/page.tsx` arma las secciones; los textos están en `src/features/marketing/content.ts` y las maquetas en `src/features/marketing/components/`. Son componentes de servidor; el único JavaScript propio es la isla `LandingMotion` (encabezado, disparadores de movimiento y ciclo del hero: 3.4 KB, 1.3 KB con gzip). Las preguntas frecuentes usan `<details>`. El precio vive en `PRICE_PER_VALUATION_MXN` y debe coincidir con el paquete `AVALUO_1` ([COBRO.md](COBRO.md)). El JSON-LD (`SoftwareApplication` con la oferta en MXN, `Organization` y `FAQPage`) sale de `structured-data.ts` y lleva el nonce de la CSP.

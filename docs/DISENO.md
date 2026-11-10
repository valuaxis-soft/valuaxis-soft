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

Solo CSS, sin librerías. Todo está dentro de `@media (prefers-reduced-motion: no-preference)`: con movimiento reducido, nada se mueve y todo se ve.

| Clase | Qué hace |
|---|---|
| `vx-reveal` | Entra desde 24 px abajo al aparecer en pantalla (animación ligada al scroll, `animation-timeline: view()`). Navegadores sin soporte muestran el contenido sin animar. No se usa en el hero (afectaría el LCP) |
| `vx-float`, `vx-float-delayed` | Flotación de 6 px, 6–7 s, para dos tarjetas del hero como máximo |
| `vx-draw` | Una línea SVG que se dibuja al entrar (regresión) |
| `vx-pulse` | Pulso suave del pin del inmueble sujeto |

Hover: `transition-[box-shadow,transform] duration-300 ease-(--ease-out-quint)` y como mucho `-translate-y-1`. Curvas: `--ease-out-quint` para llegar, `--ease-in-out-soft` para ciclos.

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
| Movimiento que explica (una línea que se traza, un pin que late) | Animar todo; animar el H1; carruseles automáticos |
| Ícono + texto en estados | Comunicar un estado solo con color |

## Página pública

`src/app/page.tsx` arma las secciones; los textos están en `src/features/marketing/content.ts` y las maquetas en `src/features/marketing/components/`. Son componentes de servidor: la página no agrega JavaScript propio (las preguntas frecuentes usan `<details>`). El precio vive en `PRICE_PER_VALUATION_MXN` y debe coincidir con el paquete `AVALUO_1` ([COBRO.md](COBRO.md)). El JSON-LD (`SoftwareApplication` con la oferta en MXN, `Organization` y `FAQPage`) sale de `structured-data.ts` y lleva el nonce de la CSP.

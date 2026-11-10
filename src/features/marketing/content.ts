/**
 * Copy for the public page. Every claim here describes something the product
 * already does (see docs/); the figures in the mockups are invented.
 */

/**
 * Price per valuation in MXN, IVA included. The real price lives in the
 * `AVALUO_1` credit package (docs/COBRO.md); change both together.
 */
export const PRICE_PER_VALUATION_MXN = 170;

export const NAV_LINKS = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#enfoques", label: "Enfoques" },
  { href: "#dictamen", label: "Dictamen" },
  { href: "#precio", label: "Precio" },
  { href: "#preguntas", label: "Preguntas" },
] as const;

export const PROOF_POINTS = [
  { value: "3", label: "enfoques de valor: mercado, costos e ingresos" },
  { value: "12", label: "variables por regresión lineal múltiple" },
  { value: "1", label: "PDF con numeración, anexos y croquis" },
  { value: "0", label: "instalaciones: todo en el navegador" },
] as const;

export const BEFORE_AFTER = {
  before: [
    "Copiar cifras entre libros de Excel y pegarlas en Word.",
    "Fórmulas que se rompen al agregar un comparable.",
    "Renumerar secciones y anexos a mano en cada cambio.",
    "Croquis y fotos en carpetas aparte.",
    "«Avalúo_final_v3_ahora_sí.docx» por correo.",
  ],
  after: [
    "Capturas una vez y la cifra viaja al dictamen.",
    "Homologación, factores y estadísticos se recalculan solos.",
    "Secciones, anexos e índice se numeran sin tocarlos.",
    "Croquis de ubicación y fotos dentro del avalúo.",
    "Una versión de trabajo; concluyes y reabres sin perder nada.",
  ],
} as const;

export const STEPS = [
  {
    title: "Captura o extrae",
    description:
      "Llena el avalúo por secciones, como tu formato de siempre. Pega un anuncio y la IA te propone los datos del comparable para que los revises.",
  },
  {
    title: "Elige comparables",
    description:
      "Busca en la base de tu despacho, impórtalos desde Excel o captúralos nuevos. Ubícalos en el mapa junto al inmueble sujeto.",
  },
  {
    title: "Calcula los enfoques",
    description:
      "Homologación, costos de reposición e ingresos con las fórmulas de tus libros. El sistema calcula y avisa; el criterio es tuyo.",
  },
  {
    title: "Emite el dictamen",
    description:
      "Revisa la vista previa tamaño carta y descarga el PDF con portada, numeración, anexos, croquis y cifra en letras.",
  },
] as const;

export const APPROACHES = [
  {
    id: "mercado",
    title: "Enfoque de mercado",
    description:
      "Homologación directa o con lote tipo para terrenos, inmuebles y rentas. Factores por comparable, promedio, mediana y valor adoptado con su rango de ±30 %.",
    points: ["Factores de superficie, ubicación, negociación y más", "Estadísticos y valor unitario adoptado", "Fotos y fichas de cada comparable"],
  },
  {
    id: "costos",
    title: "Enfoque de costos",
    description:
      "Terreno urbano o rural, construcciones, instalaciones especiales e indirectos. Depreciación por edad y conservación como en tus libros.",
    points: ["Factor de edad y vida útil remanente", "Valor físico o neto de reposición", "Maquinaria y equipo con tipo de cambio"],
  },
  {
    id: "ingresos",
    title: "Enfoque de ingresos",
    description:
      "Capitalización de rentas por tabla, anualidad o mercado, con deducciones, vacíos y tasa de capitalización calculada a la vista.",
    points: ["Rentas homologadas del mercado", "Tasa por criterios o capturada", "Ingreso neto y valor capitalizado"],
  },
] as const;

export const DICTAMEN_POINTS = [
  { title: "Numeración automática", description: "Capítulos en romanos, anexos e índice siempre cuadran con el editor." },
  { title: "Croquis de ubicación", description: "Macro y microlocalización con norte y comparables, guardados como imagen del avalúo." },
  { title: "Anexos y fotografías", description: "Reporte fotográfico, fotos y mapa de comparables, y documentos de soporte." },
  { title: "Cifra en letras y firmas", description: "«(TRES MILLONES … PESOS 00/100 M.N.)» y el bloque de firmas de tu formato." },
  { title: "Memoria de cálculo", description: "Cada cifra con su fórmula y sus entradas, para revisar o defender el valor." },
  { title: "Tu identidad", description: "Portada, colores y textos fijos de tu despacho en cada documento." },
] as const;

export const TEAM_FEATURES = [
  {
    title: "Equipo con roles",
    description: "Administrador, valuador, revisor o consulta: cada quien ve y hace lo que le toca dentro de tu despacho.",
  },
  {
    title: "Versiones sin miedo",
    description: "Concluye el avalúo cuando esté listo. Si hay que corregir, reábrelo: se crea una versión de trabajo nueva.",
  },
  {
    title: "Datos de tu despacho, solo tuyos",
    description: "Cada organización ve únicamente sus avalúos y comparables. Bloqueo de intentos, sesiones seguras y conexión cifrada.",
  },
  {
    title: "Bitácora de cada acción",
    description: "Inicios de sesión, cambios de permisos y cada avalúo creado, concluido, reabierto o exportado quedan registrados.",
  },
] as const;

export const PRICE_INCLUDES = [
  "Los tres enfoques, métodos alternativos y memoria de cálculo",
  "Dictamen en PDF con anexos, croquis y fotografías",
  "Base de comparables de tu despacho con mapa",
  "Equipo con roles y versiones del avalúo",
  "Lectura de anuncios de comparables con IA",
] as const;

export const FAQS = [
  {
    question: "¿Cuánto cuesta Valuaxis?",
    answer:
      `Crear tu cuenta no tiene costo. Pagas $${PRICE_PER_VALUATION_MXN} MXN, IVA incluido, por cada avalúo que concluyes. El pago se hace con tarjeta en la página segura de Stripe; Valuaxis no ve ni guarda tus tarjetas.`,
  },
  {
    question: "¿Cuándo se descuenta un avalúo?",
    answer:
      "Al concluirlo por primera vez. Si después lo reabres para corregir algo y lo vuelves a concluir, no se cobra de nuevo.",
  },
  {
    question: "¿Necesito instalar algo?",
    answer:
      "No. Valuaxis funciona en el navegador de tu computadora, tableta o teléfono. El PDF del dictamen se genera en el servidor, igual desde cualquier equipo.",
  },
  {
    question: "¿Los cálculos son los mismos que en mis libros de Excel?",
    answer:
      "El motor de cálculo se validó al centavo contra los libros de Excel de un despacho de valuación: homologación, costos, ingresos, regresión lineal múltiple y programación por metas. Donde un libro tenía un error, se aplica la regla correcta.",
  },
  {
    question: "¿La inteligencia artificial decide el valor?",
    answer:
      "No. La IA solo copia los datos que están escritos en el anuncio que pegas, con el fragmento de donde los leyó, para que tú los revises. Nunca estima valores, factores ni conclusiones.",
  },
  {
    question: "¿Qué pasa si aún no acredito mi cédula profesional?",
    answer:
      "Puedes trabajar normalmente. Mientras no acredites tu Constancia de Situación Profesional de la SEP, tus documentos imprimen el aviso «Documento sin validez oficial». Al acreditarla, los documentos que generes ya salen sin el aviso.",
  },
  {
    question: "¿Puedo usar mis comparables actuales?",
    answer:
      "Sí. Descarga la plantilla, llénala con tus comparables e impórtala desde Excel o CSV. Valuaxis revisa duplicados y vigencia, y puedes exportar tu base cuando quieras.",
  },
  {
    question: "¿Sirve para avalúos de maquinaria y equipo?",
    answer:
      "Sí. Además de inmuebles urbanos y rurales, Valuaxis calcula maquinaria y equipo con cotización, tipo de cambio, edad, conservación y obsolescencias.",
  },
] as const;

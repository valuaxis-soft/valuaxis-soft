/**
 * The on-screen notices of the lawyer's implementation matrix (We Law, 15 Nov
 * 2026) for capturing a valuation, its comparables and its images, and the
 * optional legend of the report. They inform; none blocks or asks to accept.
 *
 * Texts quoted by the matrix are copied word for word. The ones the matrix
 * only describes are drafts marked «texto propuesto, pendiente de redacción
 * de We Law»: replace them here, in one place, when the lawyer sends them.
 */

/** Matrix 1.4: where the appraiser captures the solicitante, the propietario and the comparables. Literal. */
export const THIRD_PARTY_DATA_NOTICE =
  "Usted es responsable de los datos de terceros que captura. Infórmeles con su propio aviso de privacidad y, cuando la ley lo exija, obtenga su consentimiento, incluido el consentimiento expreso para sus datos patrimoniales.";

/**
 * Matrix 1.5, «Recordatorio antes de enviar», before the box of «Pegar
 * anuncio» (AI annex 2.2 and 5.3.4).
 * Texto propuesto, pendiente de redacción de We Law.
 */
export const PASTE_LISTING_REMINDER =
  "Pegue solo el texto del anuncio, sin datos del solicitante, del propietario ni de otras personas.";

/** Matrix 1.5, «Aviso de revisión de "Pegar anuncio"», next to every result. Literal. */
export const AI_RESULT_REVIEW_NOTICE =
  "Los datos que propone esta función pueden contener errores. Revíselos y corríjalos antes de guardarlos; usted responde de los datos que usa en su avalúo.";

/**
 * Matrix 1.5, «Fotografías y textos», when an image is uploaded or pasted
 * (AI annex 3.2).
 * Texto propuesto, pendiente de redacción de We Law.
 */
export const IMAGE_RIGHTS_NOTICE =
  "Al subir una imagen, usted declara que tiene derecho a usarla en su avalúo y en su reporte, y responde de ello. Prefiera fotografías propias y evite personas identificables.";

/** Matrix 1.7, «Leyenda de herramientas e IA»: off by default, the appraiser adds it (AI annex 6). Literal. */
export const AI_TOOLS_LEGEND =
  "En la elaboración de este avalúo se usaron herramientas de software, incluida inteligencia artificial, bajo la revisión y responsabilidad del valuador que lo firma.";

/** The notices whose wording the lawyer still has to write: listed in the PR and the docs. */
export const NOTICES_PENDING_WE_LAW = [PASTE_LISTING_REMINDER, IMAGE_RIGHTS_NOTICE] as const;

/**
 * The fixed wordings that name what is being appraised, by the valuation's
 * property type, as the firm's books print them: «DEL INMUEBLE» in the real
 * estate books, «DEL BIEN» and «DE LA MAQUINARIA» in the machinery and
 * equipment one (MEH). A machinery valuation that says what it values
 * («Retroexcavadora») names it: «VALOR COMERCIAL DE LA RETROEXCAVADORA» (24
 * Nov 2026: «valor concluido de la retroexcavadora, especificando»).
 * Wordings the appraiser types are never touched.
 */
import { isMachineryPropertyKind } from "../calculation/machinery-types";
import { ofTheEssence } from "./appraisal-subject";

export type AppraisedGoodWording = {
  /** The band under the letterhead of every page (cell B9 of every sheet). */
  documentTitle: string;
  /** The box of the carátula's conclusion (sheet «l. CARATULA», B52). */
  commercialValueTitle: string;
  /** The cover's title while the appraiser has not written one. */
  pendingTitle: string;
  coverImageAlt: string;
  /** The concluded value in the conclusion section's template (sheet «X. CONCLUSION», C54). */
  concludedValueLabel: string;
};

const REAL_ESTATE: AppraisedGoodWording = {
  documentTitle: "DICTAMEN VALUATORIO",
  commercialValueTitle: "VALOR COMERCIAL DEL INMUEBLE",
  pendingTitle: "Título del inmueble pendiente",
  coverImageAlt: "Imagen principal del inmueble",
  concludedValueLabel: "Valor concluido",
};

const MACHINERY: AppraisedGoodWording = {
  documentTitle: "DICTAMEN VALUATORIO DE MAQUINARIA Y EQUIPO",
  commercialValueTitle: "VALOR COMERCIAL DEL BIEN",
  pendingTitle: "Título del bien pendiente",
  coverImageAlt: "Imagen principal del bien",
  concludedValueLabel: "Valor comercial de la maquinaria",
};

/** `essence`: «¿Qué se está valuando?» of the valuation; real estate keeps its wordings whatever it is. */
export function appraisedGoodWording(propertyKind: string | null | undefined, essence?: string | null): AppraisedGoodWording {
  if (!isMachineryPropertyKind(propertyKind)) return REAL_ESTATE;
  if (!essence?.trim()) return MACHINERY;
  const of = ofTheEssence(essence);
  return {
    ...MACHINERY,
    commercialValueTitle: `VALOR COMERCIAL ${of.toLocaleUpperCase("es-MX")}`,
    concludedValueLabel: `Valor comercial ${of}`,
  };
}

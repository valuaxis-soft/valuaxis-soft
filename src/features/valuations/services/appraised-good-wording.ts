/**
 * The fixed wordings that name what is being appraised, by the valuation's
 * property type, as the firm's books print them: «DEL INMUEBLE» in the real
 * estate books, «DEL BIEN» and «DE LA MAQUINARIA» in the machinery and
 * equipment one (MEH). Wordings the appraiser types are never touched.
 */
import { isMachineryPropertyKind } from "../calculation/machinery-types";

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

export function appraisedGoodWording(propertyKind: string | null | undefined): AppraisedGoodWording {
  return isMachineryPropertyKind(propertyKind) ? MACHINERY : REAL_ESTATE;
}

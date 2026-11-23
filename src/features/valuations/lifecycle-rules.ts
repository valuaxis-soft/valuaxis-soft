/**
 * Rules of the life of a valuation the client set (Álvaro, 23 nov 2026, with
 * his lawyer). They are business rules, not technical limits: each one is
 * named here so it is changed in one place.
 */

/**
 * A concluded valuation stays as it was concluded: it is not reopened, and
 * nothing recalculates it when the software changes. Reopening may come back
 * for the valuations made under an agreement with a government; the service
 * that does it (`reopenValuation`) is kept and tested for that day.
 */
export const CONCLUDED_VALUATIONS_CAN_BE_REOPENED = false;
export const REOPEN_NOT_AVAILABLE = "Un avalúo concluido no se puede reabrir: queda tal como se concluyó.";

/**
 * The printable documents (the dictamen's PDF, the calculation memory and the
 * .zip with both, by download, print or email) are obtained once the
 * valuation is concluded. Before, the appraiser reads the preview on screen.
 * Otherwise one paid valuation would print any number of dictámenes without
 * ever being concluded.
 */
export const DELIVERABLES_NEED_CONCLUSION = "El PDF, la memoria de cálculo y el .zip se obtienen al concluir el avalúo. Antes puedes revisar la vista previa en pantalla.";

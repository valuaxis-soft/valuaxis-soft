/**
 * What each notice says. Pure: the events (notification-events.ts) pick the
 * recipients and use these texts.
 */

/**
 * What happened to a valuation. «enviado_revision», «aprobado» and
 * «regresado» come from the «Revisión» state (`POST /api/avaluos/[id]/revision`),
 * with the note as the reason.
 */
export type ValuationEvent = "asignado" | "concluido" | "reabierto" | "enviado_revision" | "aprobado" | "regresado";

/** Title and text of a valuation's notice. Pure. */
export function valuationEventText(event: ValuationEvent, input: { folio: string; title: string; actorName: string; reason?: string | null }) {
  const subject = input.title.trim() ? `«${input.title.trim()}»` : "el avalúo";
  const reason = input.reason?.trim() ? `: ${input.reason.trim()}` : ".";
  switch (event) {
    case "asignado":
      return { title: `Te asignaron el avalúo ${input.folio}`, body: `${input.actorName} te dejó como responsable de ${subject}.` };
    case "concluido":
      return { title: `Se concluyó el avalúo ${input.folio}`, body: `${input.actorName} concluyó ${subject}.` };
    case "reabierto":
      return { title: `Se reabrió el avalúo ${input.folio}`, body: `${input.actorName} reabrió ${subject}${reason}` };
    case "enviado_revision":
      return { title: `El avalúo ${input.folio} espera tu revisión`, body: `${input.actorName} envió a revisión ${subject}.` };
    case "aprobado":
      return { title: `Se aprobó el avalúo ${input.folio}`, body: `${input.actorName} aprobó la revisión de ${subject}.` };
    case "regresado":
      return { title: `El avalúo ${input.folio} regresó a edición`, body: `${input.actorName} regresó ${subject}${reason}` };
  }
}

/** Title and text of the low balance notice. Pure. */
export function lowCreditsText(balance: number) {
  if (balance <= 0) {
    return { title: "Se agotaron los avalúos disponibles", body: "Para concluir otro avalúo, compra un paquete en Plan y facturación." };
  }
  return {
    title: balance === 1 ? "Queda 1 avalúo disponible" : `Quedan ${balance} avalúos disponibles`,
    body: "Compra un paquete en Plan y facturación antes de que se agoten para seguir concluyendo.",
  };
}

import type { CaratulaFormData, ValuationMeta } from "@/features/valuations/model";

export function initializeCaratulaState(
  existingCaratula: Pick<CaratulaFormData, "objeto"> | null | undefined,
): Pick<CaratulaFormData, "objeto"> {
  return { objeto: existingCaratula?.objeto ?? "" };
}

export function applyMetaPatchToCaratula(
  current: CaratulaFormData,
  patch: Partial<ValuationMeta>,
): CaratulaFormData {
  return {
    ...current,
    numeroAvaluo: patch.folio ?? current.numeroAvaluo,
    folio: patch.folio ?? current.folio,
    solicitante: patch.client ?? current.solicitante,
    propietario: patch.client ?? current.propietario,
    proposito: patch.valuationKind ?? current.proposito,
  };
}

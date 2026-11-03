"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import type { ComparableCardDto } from "@/features/valuations/calculation/comparable-card.service";
import { MARKET_LABELS, defaultCharacteristicFields, type ComparableDto, type ComparableType } from "@/features/valuations/calculation/market-types";
import { ComparableDialog, type PendingImages } from "@/features/valuations/components/calculation/comparable-dialog";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar.";

/**
 * The comparable form of the valuations, used from the Comparables page: a
 * new comparable goes to the firm's base without a valuation; an existing one
 * ("Editar ficha") is updated there. The type of comparable is chosen in the
 * form, since there is no market to take it from.
 */
export function BaseComparableDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card being edited; null for a new comparable. */
  card: ComparableCardDto | null;
  /** The months a new comparable is valid for: the firm's. */
  defaultValidityMonths: number;
  attributeNames: string[];
  /** Called with the id of the capture that shows the data after saving (new, the same, or a newer capture of the same number). */
  onSaved?: (comparableId: string) => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<ComparableType>(props.card?.type ?? "INMUEBLE_VENTA");
  // The card as the dialog last saved it, so photos added while editing show at once.
  const [card, setCard] = useState<ComparableCardDto | null>(props.card);
  const comparable: ComparableDto | null = card?.comparable ?? null;

  const run = async <T,>(action: () => Promise<T>, success?: string): Promise<T | null> => {
    try {
      const result = await action();
      if (success) toast.success(success);
      return result;
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    }
  };

  const submit = async (values: ComparableFormValues, pending: PendingImages, mergeInto?: string) => {
    if (comparable) {
      const saved = await run(() => api.comparableBase.update(comparable.id, type, values));
      if (!saved) return false;
      toast.success(saved.created ? "Ficha guardada como una captura más reciente del comparable." : "Ficha guardada.");
      props.onSaved?.(saved.id);
      router.refresh();
      return true;
    }
    const created = await run(() => api.comparableBase.create(type, values, mergeInto));
    if (!created) return false;
    if (pending.screenshot) await run(() => api.comparableBase.uploadScreenshot(created.id, pending.screenshot as File));
    const folio = await api.market.card(created.id).then((loaded) => formatComparableId(loaded.comparable.folio)).catch(() => null);
    toast.success(created.outcome === "CREATED" ? `Comparable ${folio ?? "nuevo"} guardado en la base.`
      : created.outcome === "UPDATED" ? "El comparable de la base quedó con los datos capturados." : "La base ya tenía ese comparable con datos más recientes.");
    props.onSaved?.(created.id);
    router.refresh();
    return true;
  };

  const refreshCard = async (action: () => Promise<ComparableCardDto>, success?: string) => {
    const next = await run(action, success);
    if (next) setCard(next);
  };

  return (
    <ComparableDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      comparable={comparable}
      characteristicFields={defaultCharacteristicFields(type)}
      comparableType={type}
      onTypeChange={setType}
      unitLabel={MARKET_LABELS[type].price}
      readOnly={false}
      onSubmit={submit}
      onUploadPhoto={async (file) => { if (comparable) await refreshCard(() => api.comparableBase.uploadPhoto(comparable.id, file), "Fotografía agregada"); }}
      onRemovePhoto={async (photoId) => { if (comparable) await refreshCard(() => api.comparableBase.deletePhoto(comparable.id, photoId)); }}
      onUploadScreenshot={async (file) => { if (comparable) await refreshCard(() => api.comparableBase.uploadScreenshot(comparable.id, file), "Pantalla de referencia guardada"); }}
      onRemoveScreenshot={async () => { if (comparable) await refreshCard(() => api.comparableBase.deleteScreenshot(comparable.id)); }}
      onCheckDuplicates={(probe) => api.comparableBase.duplicates(probe)}
      // "Usar el existente": in the base there is nothing to add it to; its card opens instead.
      onReuse={async (comparableId) => { router.push(`/comparables/${comparableId}`); return true; }}
      defaultValidityMonths={props.defaultValidityMonths}
      attributeNames={props.attributeNames}
    />
  );
}

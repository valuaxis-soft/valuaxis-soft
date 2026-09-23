import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { api } from "@/lib/api-client";
import type { AppSection, PrincipalCoverImage } from "@/features/valuations/model";
import { mergeDatosImages, mergeDocumentHeaderImage } from "../model/initial-hydration";

/**
 * Loads the images stored per valuation (principal cover, document header and
 * Datos generales) with fresh temporary URLs, merging the last two into the
 * sections. Used by the editor and by the printable dictamen.
 */
export function useStoredValuationImages({
  setSections,
  valuationId,
}: {
  setSections: Dispatch<SetStateAction<AppSection[]>>;
  valuationId: string | null;
}) {
  const [principalCoverImage, setPrincipalCoverImage] = useState<PrincipalCoverImage | null>(null);

  useEffect(() => {
    let active = true;
    if (!valuationId) {
      return;
    }
    api.valuations.coverImage
      .get(valuationId)
      .then((image) => {
        if (active) setPrincipalCoverImage(image);
      })
      .catch(() => {
        if (active) setPrincipalCoverImage(null);
      });
    return () => {
      active = false;
    };
  }, [valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.documentHeaderImage
      .get(valuationId)
      .then((image) => {
        if (active) setSections((current) => mergeDocumentHeaderImage(current, image));
      })
      .catch(() => {
        // La estructura editable permanece aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [setSections, valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.datosImages
      .list(valuationId)
      .then((images) => {
        if (active) setSections((current) => mergeDatosImages(current, images));
      })
      .catch(() => {
        // Los nodos existentes siguen disponibles aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [setSections, valuationId]);

  return { principalCoverImage, setPrincipalCoverImage };
}

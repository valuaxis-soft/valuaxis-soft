"use client";

/**
 * The firm's own «¿Qué se está valuando?» and «Tipo de avalúo» (firm-lists.ts),
 * served with the editor and offered in the carátula. Keeping a new one saves
 * it for the whole organization and adds it to the lists at once.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { FirmListItem, FirmLists } from "@/features/firm/firm-lists";
import { api } from "@/lib/api-client";

const EMPTY: FirmLists = { essences: { INMUEBLE: [], MAQUINARIA: [], AGROPECUARIO: [] }, appraisalKinds: [] };

type FirmListsValue = {
  lists: FirmLists;
  /** Saves the item for the organization; resolves to whether it was kept. */
  keep: (item: FirmListItem) => Promise<boolean>;
};

const FirmListsContext = createContext<FirmListsValue>({ lists: EMPTY, keep: async () => false });

export const useFirmLists = () => useContext(FirmListsContext);

export function FirmListsProvider({ initialLists, children }: { initialLists?: FirmLists; children: ReactNode }) {
  const [lists, setLists] = useState(initialLists ?? EMPTY);
  const keep = useCallback<FirmListsValue["keep"]>(async (item) => {
    try {
      const saved = await api.firm.addFirmListItem(item);
      setLists(saved.lists);
      toast.success(`«${item.name}» quedó en la lista del despacho.`);
      return true;
    } catch {
      toast.error("No se pudo guardar en la lista del despacho. Intenta de nuevo.");
      return false;
    }
  }, []);
  const value = useMemo(() => ({ lists, keep }), [lists, keep]);
  return <FirmListsContext.Provider value={value}>{children}</FirmListsContext.Provider>;
}

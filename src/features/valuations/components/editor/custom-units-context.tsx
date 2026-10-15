"use client";

/**
 * The firm's own units ("Formato del valor" → Otra unidad), served with the
 * editor and offered in every concept's list. Confirming a new one saves it
 * for the whole organization and adds it to the list at once.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { addCustomUnitTo } from "@/features/firm/custom-units";
import { api } from "@/lib/api-client";

type CustomUnits = {
  units: string[];
  /** Saves the unit for the organization; resolves to the unit as kept, or null when it could not be saved. */
  add: (unit: string) => Promise<string | null>;
};

const CustomUnitsContext = createContext<CustomUnits>({ units: [], add: async () => null });

export const useCustomUnits = () => useContext(CustomUnitsContext);

export function CustomUnitsProvider({ initialUnits, children }: { initialUnits: string[]; children: ReactNode }) {
  const [units, setUnits] = useState(initialUnits);
  const add = useCallback<CustomUnits["add"]>(async (unit) => {
    const local = addCustomUnitTo(units, unit);
    if (!local.added) return local.units.find((item) => item.toLowerCase() === unit.trim().toLowerCase()) ?? null;
    try {
      const saved = await api.firm.addCustomUnit(unit);
      setUnits(saved.units);
      toast.success(`La unidad «${local.units.at(-1)}» quedó guardada para el despacho.`);
      return local.units.at(-1) ?? null;
    } catch {
      toast.error("No se pudo guardar la unidad. Intenta de nuevo.");
      return null;
    }
  }, [units]);
  const value = useMemo(() => ({ units, add }), [units, add]);
  return <CustomUnitsContext.Provider value={value}>{children}</CustomUnitsContext.Provider>;
}

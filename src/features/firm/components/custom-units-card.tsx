"use client";

import { Check, Loader2, PencilLine, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import { MAX_CUSTOM_UNIT_LENGTH, normalizeCustomUnit } from "../custom-units";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/**
 * The units the firm confirmed in "Formato del valor" (piezas, lotes…): each
 * one renamed or taken out of the list here. A concept already printed with a
 * unit keeps it as written.
 */
export function CustomUnitsCard() {
  const [units, setUnits] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{ unit: string; draft: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.firm.customUnits()
      .then((result) => { if (active) setUnits(result.units); })
      .catch(() => { if (active) setUnits([]); });
    return () => { active = false; };
  }, []);

  const rename = async () => {
    if (!editing) return;
    const nextUnit = normalizeCustomUnit(editing.draft);
    if (!nextUnit || nextUnit === editing.unit) {
      setEditing(null);
      return;
    }
    setBusy(editing.unit);
    try {
      const result = await api.firm.renameCustomUnit(editing.unit, nextUnit);
      setUnits(result.units);
      setEditing(null);
      toast.success(`La unidad «${editing.unit}» ahora se llama «${nextUnit}».`);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo renombrar la unidad."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (unit: string) => {
    setBusy(unit);
    try {
      const result = await api.firm.removeCustomUnit(unit);
      setUnits(result.units);
      toast.success(`La unidad «${unit}» ya no se ofrece en la lista.`);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo quitar la unidad."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-custom-units>
      <CardHeader>
        <CardTitle>Unidades del despacho</CardTitle>
        <CardDescription>
          Las unidades que el despacho escribió y confirmó en «Formato del valor» de un concepto (piezas, lotes, cabezas…). Se ofrecen en la
          lista de unidades de todos los avalúos. Un dato ya escrito con una unidad la conserva aunque aquí se renombre o se quite.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {units === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando las unidades…</p>
        ) : units.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay unidades propias. Se agregan desde el editor: «Formato del valor» → «Otra unidad» → confirmar.</p>
        ) : (
          <ul className="grid gap-1">
            {units.map((unit) => (
              <li key={unit} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm" data-custom-unit={unit}>
                {editing?.unit === unit ? (
                  <>
                    <Input
                      autoFocus
                      aria-label={`Nuevo nombre de la unidad ${unit}`}
                      className="h-8 max-w-48"
                      maxLength={MAX_CUSTOM_UNIT_LENGTH}
                      value={editing.draft}
                      onChange={(event) => setEditing({ unit, draft: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") { event.preventDefault(); void rename(); }
                        if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
                      }}
                    />
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Guardar el nombre" disabled={busy !== null} onClick={() => void rename()}>
                      <Check />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancelar" disabled={busy !== null} onClick={() => setEditing(null)}>
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{unit}</span>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Renombrar la unidad ${unit}`} title="Renombrar" disabled={busy !== null} onClick={() => setEditing({ unit, draft: unit })}>
                      <PencilLine />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la unidad ${unit}`} title="Quitar de la lista" disabled={busy !== null} onClick={() => void remove(unit)}>
                      {busy === unit ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import { AUTOSAVE_INTERVAL_OPTIONS, describeAutosave, type AutosaveSeconds } from "../user-preferences";

/** «Autoguardado» in the user's account: how long after the last edit the editor saves on its own, or never (NP-01). */
export function AutosavePreferenceSection({ initialSeconds }: { initialSeconds: AutosaveSeconds }) {
  const [seconds, setSeconds] = useState<AutosaveSeconds>(initialSeconds);
  const [busy, setBusy] = useState(false);

  const change = async (next: AutosaveSeconds) => {
    const previous = seconds;
    setSeconds(next);
    setBusy(true);
    try {
      const saved = await api.preferences.update({ autosaveSeconds: next });
      setSeconds(saved.autosaveSeconds);
      toast.success(saved.autosaveSeconds === 0
        ? "Guardado automático desactivado: guarda con «Guardar cambios» o Ctrl+S."
        : `Guardado automático: ${describeAutosave(saved.autosaveSeconds)}.`);
    } catch (error) {
      setSeconds(previous);
      toast.error(
        error instanceof SessionExpiredError
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : error instanceof Error ? error.message : "No se pudo guardar la preferencia.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="autoguardado" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="size-5" />
          Autoguardado
        </CardTitle>
        <CardDescription>
          Cuánto espera el editor del avalúo, después de tu último cambio, para guardar solo. Aplica a los avalúos que abras
          desde ahora; los que ya tienes abiertos lo toman al recargarlos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        <Label htmlFor="autosave-interval">Guardar automáticamente</Label>
        <NativeSelect
          id="autosave-interval"
          value={String(seconds)}
          disabled={busy}
          onChange={(event) => void change(Number(event.target.value) as AutosaveSeconds)}
        >
          {AUTOSAVE_INTERVAL_OPTIONS.map((option) => (
            <NativeSelectOption key={option.seconds} value={String(option.seconds)}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {seconds === 0 ? (
          <p className="basis-full text-xs text-muted-foreground" data-autosave-off>
            Sin guardado automático, el editor te pregunta antes de salir si quedaron cambios sin guardar.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

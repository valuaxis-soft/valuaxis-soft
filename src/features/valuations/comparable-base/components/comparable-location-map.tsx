"use client";

import { Loader2, MapPin, MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { LatLng } from "./comparable-location-leaflet";

const Leaflet = dynamic(() => import("./comparable-location-leaflet"), {
  ssr: false,
  loading: () => <div className="flex h-56 items-center justify-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>,
});

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar la ubicación.";

const DEGREES = 6;
const round = (value: number) => Number(value.toFixed(DEGREES));

/**
 * "Ubicación" of the card: a small map with the pin when the comparable has
 * coordinates; "Sin coordenadas" and "Ubicar" when it does not. "Ubicar" (or
 * "Reubicar") opens a map where a click or a drag places the pin, and saves
 * the latitude and longitude on the comparable.
 */
export function ComparableLocationMap({ comparableId, coordinates, canEdit }: {
  comparableId: string;
  coordinates: LatLng | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LatLng | null>(coordinates);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.comparableBase.locate(comparableId, { latitude: round(draft.latitude), longitude: round(draft.longitude) });
      toast.success("Ubicación guardada.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const typed = (key: keyof LatLng, text: string) => {
    const value = Number(text.replace(",", "."));
    if (!text.trim() || !Number.isFinite(value)) return;
    setDraft((current) => ({ latitude: current?.latitude ?? 0, longitude: current?.longitude ?? 0, [key]: value }));
  };

  return (
    <section className="grid gap-2 rounded-md border" aria-label="Mapa" data-comparable-map={coordinates ? "con-coordenadas" : "sin-coordenadas"}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span>Mapa</span>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => { setDraft(coordinates); setOpen(true); }}>
            <MapPin data-icon="inline-start" /> {coordinates ? "Reubicar" : "Ubicar"}
          </Button>
        ) : null}
      </header>
      {coordinates ? (
        <div className="grid gap-1 p-1.5">
          <Leaflet value={coordinates} className="h-56 w-full rounded-sm" />
          <p className="text-xs text-muted-foreground">{coordinates.latitude}, {coordinates.longitude} · OpenStreetMap</p>
        </div>
      ) : (
        <p className="flex items-center gap-1 p-2 text-xs text-muted-foreground"><MapPinOff className="size-4" /> Sin coordenadas.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ubicar el comparable</DialogTitle>
            <DialogDescription>Haz clic en el mapa para poner el pin, o arrástralo; también puedes escribir las coordenadas.</DialogDescription>
          </DialogHeader>
          {open ? <Leaflet value={draft} onChange={setDraft} className="h-80 w-full rounded-md" /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Latitud
              <Input inputMode="decimal" value={draft ? String(draft.latitude) : ""} onChange={(event) => typed("latitude", event.target.value)} placeholder="20.7092" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Longitud
              <Input inputMode="decimal" value={draft ? String(draft.longitude) : ""} onChange={(event) => typed("longitude", event.target.value)} placeholder="-102.3467" />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={!draft || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Guardar ubicación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

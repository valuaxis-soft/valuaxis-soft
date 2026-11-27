"use client";

import { Loader2, MapPin, MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ComparableLocationDto } from "@/features/valuations/comparable-base/comparable-location.service";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { LatLng } from "./comparable-location-leaflet";
import { ComparableMapExpand } from "./comparable-map-expand";

const Leaflet = dynamic(() => import("./comparable-location-leaflet"), {
  ssr: false,
  loading: () => <div className="flex h-80 items-center justify-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>,
});

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar la ubicación.";

const DEGREES = 6;
const round = (value: number) => Number(value.toFixed(DEGREES));

/**
 * "Mapa" of the card, the same wherever the card opens (V8.13: the market's
 * «Ver ficha», the search, /comparables): the pin when the comparable has
 * one (or another capture of its number has it); else its approximate
 * location, a dashed circle where its address falls, looked up once through
 * the server; "Sin coordenadas" only when neither is known. The map spans
 * the card and «Ver mapa grande» opens it over the screen. "Ubicar" (or
 * "Reubicar") opens a map where a click or a drag places the pin, and saves
 * it on every capture of the comparable.
 */
export function ComparableLocationMap({ comparableId, location, canEdit, canLocate = true }: {
  comparableId: string;
  location: ComparableLocationDto | null;
  canEdit: boolean;
  /** Looks up the approximate location when there is none (it is kept, so once per address). */
  canLocate?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ComparableLocationDto | null>(location);
  const [looking, setLooking] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const pin = current && !current.approximate ? { latitude: current.latitude, longitude: current.longitude } : null;
  const approximate = current?.approximate ? { latitude: current.latitude, longitude: current.longitude } : null;

  // Once per card: without a location, the server looks for the pin of its number or where its address falls.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || location || !canLocate) return;
    asked.current = true;
    setLooking(true);
    api.maps.locateComparable(comparableId)
      .then((found) => setCurrent(found.location))
      .catch(() => {
        // Without maps or the permission, the card simply says it has no coordinates.
      })
      .finally(() => setLooking(false));
  }, [comparableId, location, canLocate]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = { latitude: round(draft.latitude), longitude: round(draft.longitude) };
      await api.comparableBase.locate(comparableId, saved);
      setCurrent({ ...saved, approximate: false, address: null });
      toast.success("Ubicación guardada en todas las fichas de este comparable.");
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
    setDraft((before) => ({ latitude: before?.latitude ?? 0, longitude: before?.longitude ?? 0, [key]: value }));
  };

  const state = pin ? "con-coordenadas" : approximate ? "aproximada" : "sin-coordenadas";
  return (
    <section className="grid gap-2 rounded-md border" aria-label="Mapa" data-comparable-map={state}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide">
        <span>Mapa{approximate ? <span className="ml-1.5 font-normal normal-case tracking-normal text-highlight-strong">· ubicación aproximada</span> : null}</span>
        <span className="flex flex-wrap gap-1.5 normal-case tracking-normal">
          {pin || approximate ? <ComparableMapExpand value={pin} approximate={approximate} /> : null}
          {canEdit ? (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => { setDraft(pin); setOpen(true); }}>
              <MapPin data-icon="inline-start" /> {pin ? "Reubicar" : "Ubicar"}
            </Button>
          ) : null}
        </span>
      </header>
      {pin || approximate ? (
        <div className="grid gap-1 p-1.5">
          <Leaflet value={pin} approximate={approximate} className="h-80 w-full rounded-sm sm:h-96" />
          <p className="text-xs text-muted-foreground">
            {pin
              ? `${pin.latitude}, ${pin.longitude} · OpenStreetMap`
              : `Ubicación aproximada por la dirección${current?.address ? `: ${current.address}` : ""}. El círculo marca dónde cae; ${canEdit ? "«Ubicar» pone el pin exacto." : "el pin exacto se pone al editar la ficha."}`}
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-1 p-2 text-xs text-muted-foreground">
          {looking ? <><Loader2 className="size-4 animate-spin" /> Buscando la dirección en el mapa…</> : <><MapPinOff className="size-4" /> Sin coordenadas.</>}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Ubicar el comparable</DialogTitle>
            <DialogDescription>Haz clic en el mapa para poner el pin, o arrástralo; también puedes escribir las coordenadas.</DialogDescription>
          </DialogHeader>
          {open ? <Leaflet value={draft} approximate={draft ? null : approximate} onChange={setDraft} className="h-[60dvh] min-h-80 w-full rounded-md" /> : null}
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

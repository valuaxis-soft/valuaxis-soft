"use client";

import { Expand, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LatLng } from "./comparable-location-leaflet";

const Leaflet = dynamic(() => import("./comparable-location-leaflet"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>,
});

/**
 * «Ver mapa grande» (V8.13, 11:27: «ni siquiera puedo hacer grande el mapa…
 * que me dijera ábrelo grande»): the same map of the comparable over almost
 * the whole screen, with its pin or its approximate location; editable when
 * the small one is (a click places the pin, a drag moves it).
 */
export function ComparableMapExpand({ value, approximate, onChange, title = "Mapa del comparable", description }: {
  value: LatLng | null;
  approximate?: LatLng | null;
  onChange?: (next: LatLng) => void;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)} data-map-expand="">
        <Expand data-icon="inline-start" /> Ver mapa grande
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] sm:max-w-[calc(100vw-1rem)]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? (onChange
                ? "Haz clic en el mapa para poner el pin o arrástralo; el pin queda en la ficha al guardarla."
                : "Acerca o aleja con los botones + y −, o con Ctrl/⌘ y la rueda del mouse.")}
            </DialogDescription>
          </DialogHeader>
          {open ? <Leaflet value={value} approximate={value ? null : approximate ?? null} onChange={onChange} className="size-full min-h-80 rounded-md" /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

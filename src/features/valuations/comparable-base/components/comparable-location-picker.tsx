"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ComparableAddress } from "@/features/valuations/calculation/comparable-card";
import { bestGeocodingResult } from "@/features/valuations/calculation/comparable-geocoding";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { LatLng } from "./comparable-location-leaflet";

const Leaflet = dynamic(() => import("./comparable-location-leaflet"), {
  ssr: false,
  loading: () => <div className="flex h-56 items-center justify-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>,
});

/** Six decimals: about 10 cm, what the latitude and longitude fields keep. */
export const roundCoordinate = (value: number) => Number(value.toFixed(6));

/** The point as the fields write it, or null when either is missing. */
export function pickerPoint(latitude: number | null, longitude: number | null): LatLng | null {
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo buscar la dirección.";

/**
 * V7.2-06: the small map of the comparable's capture, inside the valuation.
 * A click on the map places the pin and a drag moves it; either fills the
 * latitude and longitude. Without coordinates, the address captured is
 * looked up once (through the server, /api/mapas/geocodificar) and the map
 * shows roughly where it is, without filling anything until the appraiser
 * places the pin or takes that point. OpenStreetMap tiles, as the card's
 * map: no Google key in the browser.
 */
export function ComparableLocationPicker({ latitude, longitude, address, query, parts, onChange, disabled = false, className }: {
  latitude: number | null;
  longitude: number | null;
  /** The address as the dictamen prints it; looked up when there are no coordinates. */
  address: string;
  /** What the geocoder is asked for, in a map's words (`geocodingQueryOf`); the printed line without it. */
  query?: string;
  /** The parts captured: among the geocoder's answers, the one in their postal code and municipality is shown (V8.2). */
  parts?: ComparableAddress | null;
  onChange: (next: LatLng) => void;
  disabled?: boolean;
  className?: string;
}) {
  const value = pickerPoint(latitude, longitude);
  const [found, setFound] = useState<{ point: LatLng; address: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const lookUp = async (text: string) => {
    if (!text.trim()) return;
    setLooking(true);
    setProblem(null);
    try {
      const first = bestGeocodingResult(await api.maps.geocode(text.trim()), parts);
      if (first) setFound({ point: { latitude: first.point[0], longitude: first.point[1] }, address: first.address });
      else setProblem("No se encontró esa dirección; haz clic en el mapa para poner el pin.");
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setLooking(false);
    }
  };

  // Once per opening: a comparable without coordinates shows roughly where its address is.
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current || value || !address.trim() || disabled) return;
    looked.current = true;
    void lookUp(query || address);
    // Only the first render decides; afterwards the appraiser asks with the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const place = (next: LatLng) => {
    setFound(null);
    onChange({ latitude: roundCoordinate(next.latitude), longitude: roundCoordinate(next.longitude) });
  };
  // A search asked for with the pin already placed shows where the address falls, to move the pin there or keep it.
  const offered = found && !(value && value.latitude === roundCoordinate(found.point.latitude) && value.longitude === roundCoordinate(found.point.longitude)) ? found : null;

  return (
    <section className={className} aria-label="Ubicación en el mapa" data-comparable-location-picker="">
      <div className="grid gap-1.5 rounded-md border p-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <span className="text-xs font-medium text-muted-foreground">
            {value ? "Arrastra el pin o haz clic en el mapa para corregir la ubicación." : "Haz clic en el mapa para poner el pin: llena la latitud y la longitud."}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {offered && !disabled ? (
              <Button type="button" size="sm" variant="secondary" className="h-7" onClick={() => place(offered.point)}>
                <MapPin data-icon="inline-start" /> Poner el pin aquí
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-7" disabled={disabled || looking || !(query || address).trim()} onClick={() => void lookUp(query || address)}>
              {looking ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Search data-icon="inline-start" />} Buscar la dirección
            </Button>
          </span>
        </div>
        <Leaflet value={value} onChange={disabled ? undefined : place} approximate={offered?.point ?? null} className="h-56 w-full rounded-sm" />
        <p className="px-0.5 text-xs text-muted-foreground" role={problem ? "alert" : undefined}>
          {problem
            ?? (offered
              ? `La dirección cae en: ${offered.address}. ${value ? "«Poner el pin aquí» lo mueve ahí; o arrástralo." : "Pon el pin para guardarla."}`
              : value
                ? `${value.latitude}, ${value.longitude} · OpenStreetMap`
                : "OpenStreetMap")}
        </p>
      </div>
    </section>
  );
}

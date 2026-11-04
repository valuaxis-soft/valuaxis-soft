"use client";

/// <reference types="google.maps" />

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorConfigPanel } from "@/features/valuations/components/editor/editor-config-panel";
import { COMPARABLE_TYPE_LABELS } from "@/features/valuations/calculation/market-types";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { SubjectLocationDto } from "@/features/maps/server/subject-location.service";
import type { GeocodingResult } from "@/features/maps/server/geocoding.service";

import { COMPARABLE_PIN_COLORS, DEFAULT_CROQUIS_SETTINGS, croquisKind, type ComparablePin, type CroquisKind, type CroquisSettings } from "../croquis";
import { loadGoogleMaps } from "../google-maps-loader";
import { MAP_CORNERS, NORTH_ARROW_STYLES, frameCenter, frameFromView, type MapCorner, type NorthArrowStyle } from "../map-styles";
import type { LatLon } from "../types";
import { NorthArrow } from "./north-arrow";
import type { MapView } from "./subject-map";

const mapLoading = () => <Skeleton className="h-[380px] w-full rounded-none sm:h-[460px]" />;
const SubjectMap = dynamic(() => import("./subject-map").then((module) => module.SubjectMap), { ssr: false, loading: mapLoading });

/** Where the map opens before the subject is placed: Mexico as a whole. */
const MEXICO_VIEW: MapView = { center: [23.6, -102.5], zoom: 5 };
const PLACED_ZOOM = 17;

type MapMode = "loading" | "google" | "failed";

export interface GoogleMapsPageConfig {
  /** The browser key; null when maps are not configured on this server. */
  apiKey: string | null;
  /** The request's CSP nonce, which the loader script carries. */
  nonce?: string;
}

export interface LocationPanelProps {
  valuationId: string;
  readOnly: boolean;
  googleMaps: GoogleMapsPageConfig;
  /** The carátula's address, the default search. */
  address: string;
  /** The croquis this section produces: macro and micro in Croquis, the map of comparables in its annex. */
  captures: readonly CroquisKind[];
  /** Puts the stored image in the document; false when the section is not in it. */
  onCroquisImage: (kind: CroquisKind, src: string) => boolean;
}

/**
 * "Ubicación y croquis del inmueble": the map to place the subject (address
 * search or dragging the pin), the clean map, the north arrow, whether the
 * comparables show, the frame of each croquis and "Aplicar al croquis",
 * which stores each croquis as an image of the valuation and puts it in the
 * section. The pin and the settings save on every change; the images go
 * into the document and are saved with it.
 */
export function LocationPanel({ valuationId, readOnly, googleMaps, address, captures, onCroquisImage }: LocationPanelProps) {
  const [data, setData] = useState<SubjectLocationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("loading");
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<MapView & { key: number }>({ ...MEXICO_VIEW, key: 0 });
  const liveView = useRef<MapView>(MEXICO_VIEW);
  const canEdit = !readOnly && !(data?.locked ?? false);

  useEffect(() => {
    let cancelled = false;
    api.valuations.location
      .get(valuationId)
      .then((dto) => {
        if (cancelled) return;
        setData(dto);
        setSearch((current) => current || address || dto.address);
        if (dto.location) setView((v) => ({ center: dto.location!.point, zoom: PLACED_ZOOM, key: v.key + 1 }));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudo cargar la ubicación.");
      });
    return () => {
      cancelled = true;
    };
    // The address only seeds the search box the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuationId]);

  useEffect(() => {
    if (!googleMaps.apiKey) return;
    const fail = (problem: string) => {
      setMapProblem(problem);
      setMode("failed");
    };
    loadGoogleMaps(googleMaps.apiKey, googleMaps.nonce, () => fail("Google rechazó la llave del navegador")).then(
      () => setMode((current) => (current === "loading" ? "google" : current)),
      () => fail("no se pudo cargar Google Maps"),
    );
  }, [googleMaps.apiKey, googleMaps.nonce]);

  const subject = data?.location?.point ?? null;
  const settings = data?.croquis ?? DEFAULT_CROQUIS_SETTINGS;
  const comparables = useMemo<readonly ComparablePin[]>(() => data?.comparables ?? [], [data]);
  const shownPins = useMemo(() => (settings.includeComparables || captures.includes("comparables") ? comparables : []), [settings.includeComparables, captures, comparables]);

  const report = (error: unknown, fallback: string) => {
    if (error instanceof SessionExpiredError) toast.error("Tu sesión expiró. Inicia sesión en otra pestaña y vuelve a intentarlo.");
    else toast.error(error instanceof Error && error.message ? error.message : fallback);
  };

  const save = useCallback(
    async (input: Parameters<typeof api.valuations.location.save>[1]) => {
      try {
        setData(await api.valuations.location.save(valuationId, input));
      } catch (error) {
        report(error, "No se pudo guardar la ubicación.");
      }
    },
    [valuationId],
  );

  const placeSubject = (point: LatLon, source: "busqueda" | "pin", foundAddress: string | null, recenter: boolean) => {
    setData((current) => (current ? { ...current, location: { point, address: foundAddress, source, updatedAt: new Date().toISOString() } } : current));
    if (recenter) setView((v) => ({ center: point, zoom: PLACED_ZOOM, key: v.key + 1 }));
    void save({ location: { point: [point[0], point[1]], address: foundAddress, source } });
  };

  const updateSettings = (patch: Partial<CroquisSettings>) => {
    const next = { ...settings, ...patch };
    setData((current) => (current ? { ...current, croquis: next } : current));
    void save({ croquis: next });
  };

  const onSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query || searching) return;
    setSearching(true);
    setResults([]);
    try {
      const found = await api.maps.geocode(query);
      if (!found.length) toast("No se encontró esa dirección. Prueba con la colonia y el municipio, o arrastra el pin.");
      else if (found.length === 1) {
        placeSubject(found[0].point, "busqueda", found[0].address, true);
        toast.success(`Pin colocado en ${found[0].address}`);
      } else setResults(found);
    } catch (error) {
      report(error, "No se pudo buscar la dirección.");
    } finally {
      setSearching(false);
    }
  };

  const showFrame = (kind: CroquisKind) => {
    if (!subject) return;
    const frame = settings[kind];
    setView((v) => ({ center: frameCenter(frame, subject), zoom: frame.zoom, key: v.key + 1 }));
  };

  const takeFrame = (kind: CroquisKind) => {
    if (!subject) return;
    updateSettings({ [kind]: frameFromView(liveView.current, subject) });
    toast(`Encuadre de ${croquisKind(kind).title.toLowerCase()} tomado del mapa`);
  };

  const applyToCroquis = async () => {
    if (!subject || applying) return;
    setApplying(true);
    try {
      const placed: string[] = [];
      const missing: string[] = [];
      for (const kind of captures) {
        const frame = settings[kind];
        const image = await api.valuations.croquis(valuationId, {
          kind,
          center: [...frameCenter(frame, subject)] as [number, number],
          zoom: frame.zoom,
          clean: settings.clean,
          northArrow: settings.northArrow,
          includeComparables: settings.includeComparables,
        });
        (onCroquisImage(kind, image.url) ? placed : missing).push(croquisKind(kind).title);
      }
      if (placed.length) toast.success(`Croquis actualizado: ${placed.join(" y ")}`, { description: "Guarda el avalúo para conservarlo en el documento." });
      if (missing.length) toast.warning(`${missing.join(" y ")}: la sección no está en el documento, así que la imagen no se colocó.`);
    } catch (error) {
      report(error, "No se pudo generar el croquis.");
    } finally {
      setApplying(false);
    }
  };

  const title = captures.includes("comparables") ? "Mapa de comparables" : "Ubicación y croquis del inmueble";

  if (!googleMaps.apiKey) {
    return (
      <EditorConfigPanel title={title}>
        <p className="text-sm text-muted-foreground">
          Los mapas no están configurados en este servidor (falta la llave de Google Maps). Mientras tanto, los croquis se agregan como imágenes, como
          cualquier otra.
        </p>
      </EditorConfigPanel>
    );
  }

  return (
    <EditorConfigPanel
      title={title}
      description={
        captures.includes("comparables")
          ? "El mapa de comparables toma el pin del inmueble sujeto y los comparables del avalúo que tienen coordenadas."
          : "Busca la dirección o arrastra el pin rojo; las coordenadas se guardan solas. Encuadra el mapa como quieras que salga cada croquis y pulsa «Aplicar al croquis»."
      }
    >
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {mode === "failed" ? (
        <p className="text-sm text-muted-foreground" role="status">
          El mapa no se pudo mostrar ({mapProblem}). Revisa la llave y sus restricciones en Google Cloud (docs/OPERACION.md, sección 7).
        </p>
      ) : null}

      <form className="grid gap-1" onSubmit={onSearch}>
        <Label htmlFor={`${valuationId}-address-search`} className="text-xs text-muted-foreground">
          Buscar dirección
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${valuationId}-address-search`}
            placeholder="Calle y número, colonia, municipio"
            value={search}
            disabled={!canEdit}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!canEdit || searching || !search.trim()}>
            {searching ? "Buscando…" : "Buscar"}
          </Button>
        </div>
        {results.length ? (
          <ul className="grid gap-1 rounded-md border bg-background p-1 text-sm" aria-label="Direcciones encontradas">
            {results.map((result) => (
              <li key={`${result.point[0]},${result.point[1]}`}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                  onClick={() => {
                    setResults([]);
                    placeSubject(result.point, "busqueda", result.address, true);
                    toast.success(`Pin colocado en ${result.address}`);
                  }}
                >
                  {result.address}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="relative isolate overflow-hidden rounded-lg border bg-background">
        {mode === "google" ? (
          <SubjectMap
            subject={subject}
            onSubjectMove={canEdit ? (point) => placeSubject(point, "pin", null, false) : undefined}
            clean={settings.clean}
            pins={shownPins}
            view={view}
            onViewChange={(next) => {
              liveView.current = next;
            }}
          />
        ) : mode === "loading" ? (
          mapLoading()
        ) : null}
        {mode === "google" ? <NorthArrow {...settings.northArrow} size={56} /> : null}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
        <dt className="text-muted-foreground">Coordenadas</dt>
        <dd className="font-mono text-xs">{subject ? `${subject[0].toFixed(6)}, ${subject[1].toFixed(6)}` : "Sin ubicar"}</dd>
        {data?.location?.address ? (
          <>
            <dt className="text-muted-foreground">Encontrado en</dt>
            <dd className="text-xs [overflow-wrap:anywhere]">{data.location.address}</dd>
          </>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <Label className="font-normal">
          <Checkbox checked={settings.clean} disabled={!canEdit} onCheckedChange={(on) => updateSettings({ clean: on === true })} /> Mapa limpio
        </Label>
        {captures.includes("comparables") ? null : (
          <Label className="font-normal">
            <Checkbox checked={settings.includeComparables} disabled={!canEdit} onCheckedChange={(on) => updateSettings({ includeComparables: on === true })} />{" "}
            Incluir comparables
          </Label>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor={`${valuationId}-north-style`} className="text-xs text-muted-foreground">
            Norte
          </Label>
          <NativeSelect
            id={`${valuationId}-north-style`}
            size="sm"
            value={settings.northArrow.style}
            disabled={!canEdit}
            onChange={(event) => updateSettings({ northArrow: { ...settings.northArrow, style: event.target.value as NorthArrowStyle } })}
          >
            {NORTH_ARROW_STYLES.map((style) => (
              <NativeSelectOption key={style.key} value={style.key}>
                {style.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Esquina del norte"
            size="sm"
            value={settings.northArrow.corner}
            disabled={!canEdit}
            onChange={(event) => updateSettings({ northArrow: { ...settings.northArrow, corner: event.target.value as MapCorner } })}
          >
            {MAP_CORNERS.map((corner) => (
              <NativeSelectOption key={corner.key} value={corner.key}>
                {corner.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </span>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Encuadres</span>
        {captures.map((kind) => (
          <div key={kind} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="min-w-36 font-medium">{croquisKind(kind).title}</span>
            <span className="text-xs text-muted-foreground">zoom {settings[kind].zoom}</span>
            <Button type="button" size="sm" variant="outline" disabled={!subject || mode !== "google"} onClick={() => showFrame(kind)}>
              Ver encuadre
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!canEdit || !subject || mode !== "google"} onClick={() => takeFrame(kind)}>
              Tomar del mapa
            </Button>
          </div>
        ))}
      </div>

      {shownPins.length ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground" aria-label="Comparables en el mapa">
          {shownPins.map((pin) => (
            <li key={pin.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: COMPARABLE_PIN_COLORS[pin.type] }} />
              <span className="font-semibold text-foreground">{pin.label}</span> {COMPARABLE_TYPE_LABELS[pin.type]} · {pin.location}
            </li>
          ))}
        </ul>
      ) : comparables.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ningún comparable del avalúo tiene coordenadas todavía; captúralas en su ficha para verlos en el mapa.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {subject
            ? "«Aplicar al croquis» guarda cada croquis como imagen del avalúo y la coloca en la sección; después edítala como cualquier imagen."
            : "Ubica el inmueble para poder generar los croquis."}
        </p>
        <Button type="button" disabled={!canEdit || !subject || applying} onClick={applyToCroquis}>
          {applying ? "Generando…" : captures.includes("comparables") ? "Generar mapa de comparables" : "Aplicar al croquis"}
        </Button>
      </div>
    </EditorConfigPanel>
  );
}

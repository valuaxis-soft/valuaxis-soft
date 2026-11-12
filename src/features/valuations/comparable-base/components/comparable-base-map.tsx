"use client";

/// <reference types="google.maps" />

import { Crosshair, ExternalLink, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clusterPoints, zoomIntoCluster } from "@/features/maps/base-map/clustering";
import {
  BASE_MAP_LAYERS, RADIUS_COLOR, VALUATION_PIN_COLOR, baseMapLayer, countByLayer, layerVisibility, pinStyle, visiblePins, type LayerVisibility,
} from "@/features/maps/base-map/layers";
import { comparablePinCardHtml, formatMoney, pinFeatures, pinPriceLine, valuationPinCardHtml } from "@/features/maps/base-map/pin-card";
import { RADIUS_METERS, RADIUS_MAX_HITS, clampRadius, formatDistance } from "@/features/maps/base-map/radius";
import type { ComparablePinDto, ComparablePinsDto, RadiusHitDto, ValuationPinDto } from "@/features/maps/base-map/types";
import type { GoogleMapsPageConfig } from "@/features/maps/components/location-panel";
import { loadGoogleMaps } from "@/features/maps/google-maps-loader";
import { CLEAN_MAP_STYLES } from "@/features/maps/map-styles";
import type { LatLon } from "@/features/maps/types";
import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { COMPARABLE_TYPE_LABELS, type ComparableType, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { ValidityBadge } from "@/features/valuations/components/calculation/comparable-validity-badge";
import type { ValuationListItem } from "@/features/valuations/repositories/valuation.repository";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type MapMode = "loading" | "google" | "failed";
type MapTab = "comparables" | "avaluos";

const MEXICO: { center: LatLon; zoom: number } = { center: [23.6, -102.5], zoom: 5 };
/** The zoom of a point the appraiser searched or chose: the colonia around it. */
const SEARCH_ZOOM = 15;
const PIN_ZOOM = 17;

const toLatLng = (p: LatLon): google.maps.LatLngLiteral => ({ lat: p[0], lng: p[1] });
const firstValue = (value: number | readonly number[]) => (Array.isArray(value) ? value[0] : (value as number));
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;
/** `styles` is mutable in the API's types; the rules themselves never change. */
const cleanStyles = () => CLEAN_MAP_STYLES.map((rule) => ({ ...rule, stylers: [...rule.stylers] }));

const CENTER_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 38C15 38 3 23 3 14a12 12 0 0 1 24 0c0 9-12 24-12 24z" fill="${RADIUS_COLOR}" stroke="#fff" stroke-width="3"/><circle cx="15" cy="14" r="4" fill="#fff"/></svg>`,
)}`;

interface GoogleParts {
  map: google.maps.Map;
  /** Hover card of the pins. */
  hover: google.maps.InfoWindow;
  /** The card with the links and "Agregar como comparable". */
  popup: google.maps.InfoWindow;
}

export interface ComparableBaseMapProps {
  googleMaps: GoogleMapsPageConfig;
  /** The query string of /comparables (its filters, without the page); empty for the whole base. */
  query: string;
  /** The list filtered to the comparables without coordinates, for "N sin ubicar". */
  unlocatedHref?: string;
  /** The layers on at the start; every one when not given. */
  initialLayers?: readonly ComparableType[];
  /** Inside a valuation: a pin can be added to one of its markets with "Usar el existente". */
  valuation?: { id: string; type: ComparableType; readOnly: boolean; onAdded?: (calculation: MarketCalculationDto) => void };
  /** In /comparables, for who may edit valuations: the card of a pin offers to add it to a valuation the appraiser picks (MAP-09). */
  canAddToValuations?: boolean;
}

/**
 * The firm's base of comparables on Google Maps (etapa 3 of the maps quote):
 * one pin per comparable with coordinates, in layers per type like folders,
 * filled while valid and hollow once expired, clustered when they crowd;
 * the same filters as the list; "Buscar alrededor de" with a radius; and the
 * subject of each valuation of the firm under "Avalúos".
 */
export function ComparableBaseMap({ googleMaps, query, unlocatedHref, initialLayers, valuation, canAddToValuations = false }: ComparableBaseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<GoogleParts | null>(null);
  const [mode, setMode] = useState<MapMode>("loading");
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [data, setData] = useState<ComparablePinsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(() => layerVisibility(initialLayers));
  const [tab, setTab] = useState<MapTab>("comparables");
  const [valuations, setValuations] = useState<ValuationPinDto[] | null>(null);
  const [zoom, setZoom] = useState(MEXICO.zoom);
  const [selected, setSelected] = useState<ComparablePinDto | null>(null);
  const [selectedValuation, setSelectedValuation] = useState<ValuationPinDto | null>(null);
  const [popupHost] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  // "Buscar alrededor de".
  const [address, setAddress] = useState("");
  const [foundAddress, setFoundAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [center, setCenter] = useState<LatLon | null>(null);
  const [radius, setRadius] = useState<number>(RADIUS_METERS.default);
  const [hits, setHits] = useState<RadiusHitDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<ComparableType>(valuation?.type ?? "INMUEBLE_VENTA");
  const [adding, setAdding] = useState(false);
  /** /comparables: the valuations a pin can go to, loaded the first time a card offers it; and the one picked. */
  const [targets, setTargets] = useState<ValuationListItem[] | null>(null);
  const [target, setTarget] = useState("");
  /** Inside a valuation: its subject's pin, the first center of "Buscar alrededor de" (WA-02). */
  const [subjectPoint, setSubjectPoint] = useState<LatLon | null>(null);
  const offerTargets = !valuation && canAddToValuations;
  // The map's listeners read the latest state without being recreated.
  const latest = useRef({ picking, zoom });
  useEffect(() => {
    latest.current = { picking, zoom };
  });
  const fitted = useRef(false);

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

  useEffect(() => {
    let cancelled = false;
    api.maps.comparables(query).then(
      (dto) => {
        if (cancelled) return;
        setData(dto);
        setLoadError(null);
      },
      (error: unknown) => { if (!cancelled) setLoadError(errorMessage(error, "No se pudo cargar el mapa de comparables.")); },
    );
    return () => { cancelled = true; };
  }, [query]);

  useEffect(() => {
    if (tab !== "avaluos" || valuations) return;
    let cancelled = false;
    api.maps.valuations().then(
      (pins) => { if (!cancelled) setValuations(pins); },
      (error: unknown) => { if (!cancelled) toast.error(errorMessage(error, "No se pudo cargar el mapa de avalúos.")); },
    );
    return () => { cancelled = true; };
  }, [tab, valuations]);

  // Created once the API is ready; the effects below draw on it.
  useEffect(() => {
    const container = containerRef.current;
    if (mode !== "google" || !container) return;
    const map = new google.maps.Map(container, {
      center: toLatLng(MEXICO.center),
      zoom: MEXICO.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      clickableIcons: false,
      styles: cleanStyles(),
    });
    map.addListener("idle", () => {
      const current = map.getZoom();
      if (current !== undefined) setZoom(current);
    });
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!latest.current.picking || !event.latLng) return;
      setCenter([event.latLng.lat(), event.latLng.lng()]);
      setFoundAddress(null);
      setPicking(false);
    });
    partsRef.current = { map, hover: new google.maps.InfoWindow({ disableAutoPan: true }), popup: new google.maps.InfoWindow() };
    return () => {
      google.maps.event.clearInstanceListeners(map);
      partsRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    partsRef.current?.map.setOptions({ draggableCursor: picking ? "crosshair" : undefined });
  }, [picking, mode]);

  const shown = useMemo(() => visiblePins(data?.pins ?? [], layers), [data, layers]);
  const counts = useMemo(() => countByLayer(data?.pins ?? []), [data]);

  // The first pins frame the map; afterwards the appraiser keeps the view.
  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map || !data || fitted.current) return;
    fitted.current = true;
    if (!data.pins.length) return;
    const bounds = new google.maps.LatLngBounds();
    for (const pin of data.pins) bounds.extend({ lat: pin.lat, lng: pin.lon });
    map.fitBounds(bounds, 40);
    if (data.pins.length === 1) map.setZoom(PIN_ZOOM);
  }, [data, mode]);

  const select = (pin: ComparablePinDto, pan: boolean) => {
    const map = partsRef.current?.map;
    if (pan && map) {
      map.panTo({ lat: pin.lat, lng: pin.lon });
      if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
    }
    setSelectedValuation(null);
    setSelected(pin);
  };

  // The pins of the layers on, clustered at the zoom the map is at.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || tab !== "comparables") return;
    const markers: google.maps.Marker[] = [];
    for (const cluster of clusterPoints(shown, zoom)) {
      if (cluster.items.length === 1) {
        const pin = cluster.items[0];
        const style = pinStyle(pin.type, pin.expired);
        const marker = new google.maps.Marker({
          map: parts.map,
          position: { lat: pin.lat, lng: pin.lon },
          title: `${formatComparableId(pin.folio) ?? "Comparable"} · ${pin.location}`,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: style.fill, fillOpacity: 1, strokeColor: style.stroke, strokeWeight: 3 },
        });
        marker.addListener("mouseover", () => {
          parts.hover.setContent(comparablePinCardHtml(pin));
          parts.hover.open({ map: parts.map, anchor: marker, shouldFocus: false });
        });
        marker.addListener("mouseout", () => parts.hover.close());
        marker.addListener("click", () => {
          parts.hover.close();
          select(pin, false);
        });
        markers.push(marker);
      } else {
        const marker = new google.maps.Marker({
          map: parts.map,
          position: { lat: cluster.lat, lng: cluster.lon },
          title: `${cluster.items.length} comparables; acércate para verlos`,
          zIndex: 10,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: "#12212f", fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 },
          label: { text: String(cluster.items.length), color: "#ffffff", fontSize: "12px", fontWeight: "700" },
        });
        marker.addListener("click", () => {
          parts.map.panTo({ lat: cluster.lat, lng: cluster.lon });
          parts.map.setZoom(zoomIntoCluster(latest.current.zoom));
        });
        markers.push(marker);
      }
    }
    return () => {
      parts.hover.close();
      for (const marker of markers) {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
    };
  }, [shown, zoom, tab, mode]);

  // "Avalúos": the subject of each valuation, as a dark square.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || tab !== "avaluos" || !valuations) return;
    const markers = valuations.map((pin) => {
      const marker = new google.maps.Marker({
        map: parts.map,
        position: { lat: pin.lat, lng: pin.lon },
        title: `${pin.folio} · ${pin.title}`,
        icon: { path: "M -7 -7 L 7 -7 L 7 7 L -7 7 Z", fillColor: VALUATION_PIN_COLOR, fillOpacity: pin.archived ? 0.5 : 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 1 },
      });
      marker.addListener("mouseover", () => {
        parts.hover.setContent(valuationPinCardHtml(pin));
        parts.hover.open({ map: parts.map, anchor: marker, shouldFocus: false });
      });
      marker.addListener("mouseout", () => parts.hover.close());
      marker.addListener("click", () => {
        parts.hover.close();
        setSelected(null);
        setSelectedValuation(pin);
      });
      return marker;
    });
    if (!fitted.current && valuations.length) {
      fitted.current = true;
      const bounds = new google.maps.LatLngBounds();
      for (const pin of valuations) bounds.extend({ lat: pin.lat, lng: pin.lon });
      parts.map.fitBounds(bounds, 40);
    }
    return () => {
      parts.hover.close();
      for (const marker of markers) {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
    };
  }, [valuations, tab, mode]);

  // The center of the radius search and its circle; the center can be dragged.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || !center) return;
    const circle = new google.maps.Circle({
      map: parts.map, center: toLatLng(center), radius, strokeColor: RADIUS_COLOR, strokeWeight: 1.5, fillColor: RADIUS_COLOR, fillOpacity: 0.06, clickable: false,
    });
    const marker = new google.maps.Marker({
      map: parts.map,
      position: toLatLng(center),
      draggable: true,
      title: "Centro de la búsqueda; arrástralo para moverlo",
      zIndex: 1000,
      icon: { url: CENTER_ICON, scaledSize: new google.maps.Size(30, 40), anchor: new google.maps.Point(15, 38) },
    });
    marker.addListener("dragend", () => {
      const position = marker.getPosition();
      if (!position) return;
      setCenter([position.lat(), position.lng()]);
      setFoundAddress(null);
    });
    return () => {
      circle.setMap(null);
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
    };
  }, [center, radius, mode]);

  // The hits within the radius, from the server; a short wait absorbs the slider.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      api.maps.comparablesAround(query, [center[0], center[1]], radius).then(
        (found) => { if (!cancelled) setHits(found); },
        (error: unknown) => { if (!cancelled) toast.error(errorMessage(error, "No se pudo buscar alrededor del punto.")); },
      ).finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [center, radius, query]);

  // The card of the selected pin: the page renders it into the popup's element.
  useEffect(() => {
    const parts = partsRef.current;
    const pin = selected ?? selectedValuation;
    if (!parts || !pin || !popupHost) return;
    parts.popup.setContent(popupHost);
    parts.popup.setPosition({ lat: pin.lat, lng: pin.lon });
    parts.popup.open({ map: parts.map });
    const listener = parts.popup.addListener("closeclick", () => {
      setSelected(null);
      setSelectedValuation(null);
    });
    return () => {
      listener.remove();
      parts.popup.close();
    };
  }, [selected, selectedValuation, popupHost, mode]);

  // Inside a valuation the search starts around its subject, when it is located.
  const valuationId = valuation?.id;
  useEffect(() => {
    if (!valuationId) return;
    let cancelled = false;
    api.valuations.location.get(valuationId).then(
      (dto) => {
        if (cancelled || !dto.location) return;
        setSubjectPoint(dto.location.point);
        setCenter((current) => current ?? dto.location!.point);
        setFoundAddress((current) => current ?? "Alrededor del inmueble del avalúo");
      },
      () => {
        // Without the subject the search simply starts empty.
      },
    );
    return () => { cancelled = true; };
  }, [valuationId]);

  // The first center (the subject's pin) also frames the map, once it is ready.
  const centered = useRef(false);
  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map || !center || centered.current || !subjectPoint || center !== subjectPoint) return;
    centered.current = true;
    fitted.current = true;
    map.panTo(toLatLng(center));
    map.setZoom(SEARCH_ZOOM);
  }, [center, subjectPoint, mode]);

  useEffect(() => {
    if (!offerTargets || !selected || targets) return;
    let cancelled = false;
    api.templates.valuations().then(
      (list) => {
        if (cancelled) return;
        const open = list.filter((item) => !/conclu/i.test(item.status));
        setTargets(open);
        setTarget((current) => current || open[0]?.id || "");
      },
      (error: unknown) => { if (!cancelled) toast.error(errorMessage(error, "No se pudieron cargar los avalúos.")); },
    );
    return () => { cancelled = true; };
  }, [offerTargets, selected, targets]);

  const geocode = async () => {
    const text = address.trim();
    if (!text) return;
    setGeocoding(true);
    try {
      const [first] = await api.maps.geocode(text);
      if (!first) {
        toast.error("No se encontró esa dirección.");
        return;
      }
      setCenter(first.point);
      setFoundAddress(first.address);
      setPicking(false);
      const map = partsRef.current?.map;
      if (map) {
        map.panTo(toLatLng(first.point));
        map.setZoom(SEARCH_ZOOM);
      }
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo buscar la dirección."));
    } finally {
      setGeocoding(false);
    }
  };

  const addToValuation = async (pin: ComparablePinDto) => {
    const targetId = valuation?.id ?? target;
    if (!targetId) return;
    setAdding(true);
    try {
      const calculation = await api.market.reuseComparable(targetId, destination, pin.id);
      valuation?.onAdded?.(calculation);
      const name = formatComparableId(pin.folio) ?? "El comparable";
      if (valuation) toast.success(`${name} se agregó a ${COMPARABLE_TYPE_LABELS[destination].toLowerCase()}. Califica sus factores.`);
      else {
        const folio = targets?.find((item) => item.id === targetId)?.folio ?? "el avalúo";
        toast.success(`${name} se agregó a ${folio}, en ${COMPARABLE_TYPE_LABELS[destination].toLowerCase()}. Califica sus factores en el avalúo.`, {
          action: { label: "Abrir avalúo", onClick: () => window.open(`/workspace?id=${targetId}`, "_blank", "noopener") },
        });
      }
      setSelected(null);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo agregar el comparable."));
    } finally {
      setAdding(false);
    }
  };

  if (!googleMaps.apiKey) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Los mapas no están configurados en este servidor (falta la llave de Google Maps).
      </p>
    );
  }

  const hidden = Math.max(0, (data?.located ?? 0) - (data?.pins.length ?? 0));

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-2">
        {mode === "failed" ? (
          <p className="text-sm text-destructive" role="alert">El mapa no se pudo mostrar: {mapProblem}.</p>
        ) : null}
        {loadError ? <p className="text-sm text-destructive" role="alert">{loadError}</p> : null}
        <div className="relative overflow-hidden rounded-lg border">
          <div ref={containerRef} role="application" aria-label="Mapa de la base de comparables" className="h-[420px] w-full sm:h-[560px]" />
          {mode === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Cargando el mapa…
            </div>
          ) : null}
          {picking ? (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
              <span className="rounded-md bg-background/95 px-3 py-1 text-xs font-medium shadow">Toca el mapa para elegir el centro de la búsqueda</span>
            </div>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pin lleno: comparable vigente; pin hueco: vencido. Los números agrupan comparables cercanos; tócalos para acercarte.
          {hidden ? ` Se muestran los ${data?.pins.length.toLocaleString("es-MX")} más recientes de ${data?.located.toLocaleString("es-MX")} con ubicación; afina los filtros para ver el resto.` : ""}
        </p>
      </div>

      <aside className="grid content-start gap-3.5 rounded-lg border p-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as MapTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="comparables" className="flex-1">Comparables</TabsTrigger>
            <TabsTrigger value="avaluos" className="flex-1">Avalúos</TabsTrigger>
          </TabsList>

          <TabsContent value="comparables" className="grid gap-3.5 pt-3">
            <div className="grid gap-1">
              <span className="text-xs font-semibold text-muted-foreground">Capas</span>
              <div className="overflow-hidden rounded-lg border">
                {BASE_MAP_LAYERS.map((layer) => (
                  <label key={layer.type} className="grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-2 border-t px-2.5 py-1.5 text-[13px] first:border-t-0">
                    <Checkbox checked={layers[layer.type]} onCheckedChange={(on) => setLayers((current) => ({ ...current, [layer.type]: on === true }))} />
                    <Dot color={layer.color} />
                    <span>{layer.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{counts[layer.type].toLocaleString("es-MX")}</span>
                  </label>
                ))}
              </div>
              {data ? (
                <p className="text-xs text-muted-foreground">
                  {data.located.toLocaleString("es-MX")} con ubicación
                  {data.unlocated ? (
                    <>
                      {" · "}
                      {unlocatedHref ? <Link href={unlocatedHref} className="underline underline-offset-2">{data.unlocated.toLocaleString("es-MX")} sin ubicar</Link> : `${data.unlocated.toLocaleString("es-MX")} sin ubicar`}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Cargando comparables…</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mapa-direccion" className="text-xs font-semibold text-muted-foreground">Buscar alrededor de</Label>
              <form
                className="flex gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void geocode();
                }}
              >
                <Input id="mapa-direccion" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Dirección o colonia" maxLength={300} className="h-9" />
                <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={geocoding || !address.trim()} aria-label="Buscar la dirección">
                  {geocoding ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </form>
              <Button type="button" size="sm" variant={picking ? "default" : "outline"} aria-pressed={picking} onClick={() => setPicking((current) => !current)} disabled={mode !== "google"}>
                <Crosshair data-icon="inline-start" /> {picking ? "Elige un punto en el mapa…" : "Elegir un punto en el mapa"}
              </Button>
              {subjectPoint && center !== subjectPoint ? (
                <Button type="button" size="sm" variant="outline" onClick={() => { setCenter(subjectPoint); setFoundAddress("Alrededor del inmueble del avalúo"); partsRef.current?.map.panTo(toLatLng(subjectPoint)); }}>
                  <Crosshair data-icon="inline-start" /> Alrededor del inmueble del avalúo
                </Button>
              ) : null}
              {foundAddress ? <p className="text-xs text-muted-foreground">{foundAddress}</p> : null}
              {/* WA-02: the radius shows from the start, so it can be set before choosing the center. */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="mapa-radio" className="text-xs font-semibold text-muted-foreground">Radio</Label>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Input
                      id="mapa-radio"
                      type="number"
                      inputMode="numeric"
                      min={RADIUS_METERS.min / 1000}
                      max={RADIUS_METERS.max / 1000}
                      step={0.05}
                      value={radius / 1000}
                      onChange={(event) => {
                        const km = Number(event.target.value);
                        if (event.target.value && Number.isFinite(km)) setRadius(clampRadius(km * 1000));
                      }}
                      className="h-7 w-20 px-1.5 text-right text-xs tabular-nums"
                    />
                    km
                  </span>
                </div>
                <Slider
                  min={RADIUS_METERS.min}
                  max={RADIUS_METERS.max}
                  step={RADIUS_METERS.step}
                  value={[radius]}
                  onValueChange={(value) => setRadius(clampRadius(firstValue(value)))}
                  aria-label="Radio de la búsqueda"
                />
                <span className="flex justify-between text-[11px] text-muted-foreground tabular-nums"><span>{formatDistance(RADIUS_METERS.min)}</span><span>{formatDistance(RADIUS_METERS.max)}</span></span>
                {center ? (
                  <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => { setCenter(null); setFoundAddress(null); setHits(null); }}>
                    Quitar el radio
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Busca una dirección o elige un punto en el mapa para ver los comparables dentro del radio.</p>
                )}
              </div>
            </div>

            {center ? (
              <div className="grid gap-1" aria-live="polite" aria-busy={searching}>
                <span className="text-xs font-semibold text-muted-foreground">
                  {hits === null ? "Buscando…" : `${hits.length}${hits.length >= RADIUS_MAX_HITS ? "+" : ""} comparables dentro de ${formatDistance(radius)}`}
                </span>
                <div className="grid max-h-[260px] gap-1.5 overflow-auto">
                  {hits?.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Ninguno con estos filtros. Amplía el radio, enciende una capa o quita un filtro.</p>
                  ) : null}
                  {(hits ?? []).map((hit) => (
                    <Button
                      key={hit.id}
                      type="button"
                      variant="outline"
                      className="h-auto justify-start gap-2 py-1.5 text-left font-normal whitespace-normal"
                      onClick={() => select(hit, true)}
                    >
                      <ComparableDot color={baseMapLayer(hit.type).color} expired={hit.expired} />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-medium">{formatComparableId(hit.folio) ?? "Sin número"}</span> · {formatDistance(hit.distance)}
                        <small className="block text-muted-foreground">
                          {baseMapLayer(hit.type).title} · {hit.expired ? "vencido" : "vigente"}
                        </small>
                      </span>
                      <span className="font-mono text-xs tabular-nums">{hit.price === null ? "—" : formatMoney(hit.price)}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="avaluos" className="grid gap-2 pt-3">
            <p className="text-[13px] text-muted-foreground">
              El inmueble sujeto de cada avalúo del despacho que ya se ubicó en el mapa (sección Ubicación del avalúo).
            </p>
            {valuations === null ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Cargando avalúos…</p>
            ) : valuations.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Ningún avalúo tiene su sujeto ubicado todavía.</p>
            ) : (
              <>
                <span className="text-xs font-semibold text-muted-foreground">{valuations.length.toLocaleString("es-MX")} avalúos ubicados</span>
                <div className="grid max-h-[420px] gap-1.5 overflow-auto">
                  {valuations.map((pin) => (
                    <Button
                      key={pin.id}
                      type="button"
                      variant="outline"
                      className="h-auto justify-start gap-2 py-1.5 text-left font-normal whitespace-normal"
                      onClick={() => {
                        const map = partsRef.current?.map;
                        if (map) {
                          map.panTo({ lat: pin.lat, lng: pin.lon });
                          if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
                        }
                        setSelected(null);
                        setSelectedValuation(pin);
                      }}
                    >
                      <span className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ background: VALUATION_PIN_COLOR, opacity: pin.archived ? 0.5 : 1 }} />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-medium">{pin.folio}</span>
                        {pin.client ? ` · ${pin.client}` : ""}
                        <small className="block text-muted-foreground">{pin.statusName}{pin.archived ? " · archivado" : ""} · {new Date(pin.updatedAt).toLocaleDateString("es-MX")}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </aside>

      {popupHost && selected
        ? createPortal(
          <div className="grid min-w-[220px] max-w-[280px] gap-1.5 text-sm text-[#12212f]">
            {/* MAP-08: the photo also in the card that opens on click, not only on hover. */}
            {selected.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed URL of the firm's own storage, inside Google's info window
              <img src={selected.thumbnailUrl} alt={`Foto de ${formatComparableId(selected.folio) ?? "el comparable"}`} className="h-28 w-full rounded-md object-cover" />
            ) : null}
            <strong className="text-[11px] tracking-wide uppercase" style={{ color: baseMapLayer(selected.type).color }}>
              {formatComparableId(selected.folio) ?? "Sin número"} · {baseMapLayer(selected.type).title}
            </strong>
            <span className="font-semibold tabular-nums">{pinPriceLine(selected)}</span>
            {pinFeatures(selected) ? <span className="text-xs text-[#5a6b7b]">{pinFeatures(selected)}</span> : null}
            <span className="text-xs text-[#5a6b7b]">{selected.location}</span>
            <span className="flex items-center gap-2 text-xs text-[#5a6b7b]">
              <ValidityBadge validity={selected} /> hasta {formatDay(selected.validUntil)}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <Link href={`/comparables/${selected.id}`} target={valuation ? "_blank" : undefined} className="text-primary underline-offset-2 hover:underline">Ver ficha</Link>
              {selected.url ? (
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                  <ExternalLink className="size-3" /> Anuncio
                </a>
              ) : null}
            </span>
            {offerTargets ? (
              <div className="mt-1 grid gap-1.5 border-t pt-2">
                <Label htmlFor="mapa-avaluo" className="text-xs text-[#5a6b7b]">Agregar como comparable al avalúo</Label>
                {targets === null ? (
                  <span className="flex items-center gap-1 text-xs text-[#5a6b7b]"><Loader2 className="size-3 animate-spin" /> Cargando avalúos…</span>
                ) : targets.length === 0 ? (
                  <span className="text-xs text-[#5a6b7b]">No hay avalúos abiertos a los que agregarlo.</span>
                ) : (
                  <>
                    <NativeSelect id="mapa-avaluo" className="w-full" value={target} onChange={(event) => setTarget(event.target.value)}>
                      {targets.map((item) => (
                        <NativeSelectOption key={item.id} value={item.id}>{[item.folio, item.client].filter(Boolean).join(" · ")}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Label htmlFor="mapa-destino" className="text-xs text-[#5a6b7b]">En el mercado</Label>
                    <NativeSelect id="mapa-destino" className="w-full" value={destination} onChange={(event) => setDestination(event.target.value as ComparableType)}>
                      {BASE_MAP_LAYERS.map((layer) => (
                        <NativeSelectOption key={layer.type} value={layer.type}>{layer.title}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Button type="button" size="sm" disabled={adding || !target} onClick={() => void addToValuation(selected)}>
                      {adding ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null} Agregar como comparable
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {valuation && !valuation.readOnly ? (
              <div className="mt-1 grid gap-1.5 border-t pt-2">
                <Label htmlFor="mapa-destino" className="text-xs text-[#5a6b7b]">Agregar al avalúo en</Label>
                <NativeSelect id="mapa-destino" className="w-full" value={destination} onChange={(event) => setDestination(event.target.value as ComparableType)}>
                  {BASE_MAP_LAYERS.map((layer) => (
                    <NativeSelectOption key={layer.type} value={layer.type}>{layer.title}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button type="button" size="sm" disabled={adding} onClick={() => void addToValuation(selected)}>
                  {adding ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null} Agregar como comparable
                </Button>
              </div>
            ) : null}
          </div>,
          popupHost,
        )
        : null}
      {popupHost && selectedValuation
        ? createPortal(
          <div className="grid min-w-[200px] max-w-[260px] gap-1 text-sm text-[#12212f]">
            <strong>{selectedValuation.folio}</strong>
            <span className="text-xs text-[#5a6b7b]">{selectedValuation.title}</span>
            {selectedValuation.client ? <span className="text-xs text-[#5a6b7b]">Cliente: {selectedValuation.client}</span> : null}
            <span className="text-xs text-[#5a6b7b]">
              {selectedValuation.statusName}{selectedValuation.archived ? " · archivado" : ""} · {new Date(selectedValuation.updatedAt).toLocaleDateString("es-MX")}
            </span>
            {selectedValuation.address ? <span className="text-xs text-[#5a6b7b]">{selectedValuation.address}</span> : null}
            <Link href={`/workspace?id=${selectedValuation.id}`} target={valuation ? "_blank" : undefined} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 justify-self-start")}>
              Abrir avalúo
            </Link>
          </div>,
          popupHost,
        )
        : null}
    </div>
  );
}

function Dot({ color, border = "#ffffff" }: { color: string; border?: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,.25)]" style={{ background: color, border: `2px solid ${border}` }} />;
}

/** Same look as the map pin: filled while valid, hollow once expired. */
function ComparableDot({ color, expired }: { color: string; expired: boolean }) {
  return expired ? <Dot color="#ffffff" border={color} /> : <Dot color={color} />;
}

"use client";

import { Copy, ExternalLink, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentProps, type FormEvent, type ReactNode,
} from "react";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, type ComparableFormValues } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ComparablePrefill } from "@/features/ai/listing-prefill";
import type { PendingImages } from "@/features/valuations/comparable-search/listing-images";
import { PasteImageButton } from "@/features/files/components/paste-image-button";
import {
  ADDRESS_LABELS,
  ADDRESS_PARTS,
  CONSERVATION_OPTIONS,
  OPERATION_TYPES,
  OPERATION_TYPE_LABELS,
  URBAN_PROXIMITIES,
  URBAN_PROXIMITY_LABELS,
  CONSTRUCTION_TYPE_SUGGESTIONS,
  QUALITY_OPTIONS,
  coordinatesError,
  customLocationText,
  formatAddress,
  formatComparableId,
  formatCoordinateDms,
  formatDay,
  hasAddress,
  normalizeCrossing,
  parseCoordinate,
  parseCoordinatePair,
  todayInMexico,
  type AddressPart,
  type ComparableAddress,
  type ComparablePropertyDetails,
  type OperationType,
  type UrbanProximity,
  type StreetType,
  STREET_TYPES,
  STREET_TYPE_LABEL,
  STREET_TYPE_LABELS,
  streetTypeOf,
  streetTypeOfName,
  ageFromYear,
  CURRENCIES,
} from "@/features/valuations/calculation/comparable-card";
import type { ComparableCardDto, DuplicateMatchDto } from "@/features/valuations/calculation/comparable-card.service";
import { geocodingQueryOf } from "@/features/valuations/calculation/comparable-geocoding";
import { DUPLICATE_REASON_LABELS, duplicateProbeOf, type DuplicateProbe } from "@/features/valuations/calculation/comparable-duplicates";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { comparableClassOf, type ComparableClass } from "@/features/valuations/calculation/comparable-classes";
import { defaultExchangeRateSource, exchangeNote, pesosOf } from "@/features/valuations/calculation/comparable-currency";
import { defaultKindOfType, isVehicleKind, kindOfComparable } from "@/features/valuations/calculation/comparable-kinds";
import { ComparableKindField, kindFieldLabel } from "./comparable-kind-field";
import { ComparableLocationPicker } from "@/features/valuations/comparable-base/components/comparable-location-picker";
import { ComparableCardButton } from "./comparable-card-dialog";
import { ComparableCardHeader, ComparableCardReview, ComparableCardUses, ComparableCardWarnings, listingDetailItems } from "./comparable-card-view";
import { ComparableValidityLine } from "./comparable-validity-badge";
import { COMPARABLE_VALIDITY_MONTHS, addMonths, validityMonthsOf } from "@/features/valuations/calculation/comparable-validity";
import { FormulaInput } from "./formula-input";
import { useExpandableDialog } from "./expandable-dialog";
import { ScreenshotSlot } from "./screenshot-slot";
import { previewUrl } from "./listing-images-picker";
import { ComparablePhotoFraming } from "./comparable-photo-framing";
import type { ImageFraming } from "@/features/valuations/services/image-framing";
import { SheetFieldTable, SheetFormSection, SheetSection, SheetTable, type SheetField } from "./comparable-sheet";
import { SuggestInput, type SuggestFieldProps } from "./suggest-input";
import { isMachineryComparable } from "@/features/valuations/calculation/comparable-machinery";
import { MachineryDetailsFields, machineryDetailsFromDraft, machineryDraftOf } from "./comparable-machinery-fields";
import {
  SUGGESTED_CHARACTERISTICS,
  emptySuggestions,
  mergeOptions,
  type ComparableSuggestions,
  type SuggestedAddressPart,
  type SuggestedCharacteristic,
} from "@/features/valuations/comparable-base/comparable-suggestions";
import {
  COMPARABLE_TYPES,
  COMPARABLE_TYPE_LABELS,
  MAX_COMPARABLE_ATTRIBUTES,
  MAX_COMPARABLE_PHOTOS,
  NUMERIC_CHARACTERISTICS,
  cleanAttributes,
  characteristicText,
  isBuiltComparableType,
  isBuiltinCharacteristic,
  isRentComparableType,
  withCharacteristic,
  type CharacteristicField,
  type ComparableDto,
  type ComparableType,
} from "@/features/valuations/calculation/market-types";

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));

type DraftKey =
  | "location" | "area" | "price" | "sourceName" | "contactName" | "contactPhone" | "url" | "offerDate" | "landUse"
  | "consultedOn" | "validUntil" | "validityMonths" | "urbanProximity" | "operationType" | "latitude" | "longitude" | "listingText"
  | "landArea" | "bedrooms" | "bathrooms" | "constructionType"
  // The facts of the card the form did not ask for before (V8.2: «una sola ventana»).
  | "age" | "levels" | "parking" | "paving" | "blockPosition" | "publicationId"
  // «Tipo de inmueble / de bien», «Año», and an offer in dollars with its rate (24 Nov 2026).
  | "kindKey" | "kindLabel" | "year" | "currency" | "exchangeRate" | "exchangeRateDate" | "exchangeRateSource";
type Draft = Record<DraftKey, string> & { address: Record<AddressPart, string>; streetType: StreetType; streetTypeOther: string };

/**
 * The value of `autocomplete` of every field of the form. Chrome ignores
 * «off» in fields it takes for an address (by their label, id or name: it
 * read «Superficie de terreno» as the country and wrote «México», videos 7.1
 * and 7.2), but a value it does not know turns its autofill off for the field
 * (chrome://autofill-internals: «HTML_TYPE_UNRECOGNIZED (disabling autofill)»).
 */
export const NO_BROWSER_AUTOFILL = "valuaxis-ficha";

/**
 * Ids of the fields: neutral, without «state», «postal», «street», «land»…,
 * the words Chrome reads as an address.
 */
const FIELD_IDS = {
  state: "cmp-ubic-1", municipality: "cmp-ubic-2", postalCode: "cmp-ubic-3", neighborhood: "cmp-ubic-4", subdivision: "cmp-ubic-5",
  street: "cmp-ubic-6", number: "cmp-ubic-7", crossStreet: "cmp-ubic-8", streetType: "cmp-ubic-9", streetTypeOther: "cmp-ubic-10",
  location: "cmp-ubic-linea", latitude: "cmp-coord-1", longitude: "cmp-coord-2", proximity: "cmp-ubic-prox",
  area: "cmp-sup-1", landArea: "cmp-sup-2", price: "cmp-oferta", annualRent: "cmp-oferta-anual", source: "cmp-fuente", contact: "cmp-contacto-1",
  phone: "cmp-contacto-2", url: "cmp-anuncio", publicationId: "cmp-anuncio-id", listingText: "cmp-anuncio-texto",
  type: "cmp-tipo", operation: "cmp-operacion", constructionType: "cmp-construccion", offerDate: "cmp-fecha-oferta",
  consultedOn: "cmp-fecha-consulta", validity: "cmp-vigencia", landUse: "cmp-uso", paving: "cmp-pavimento", blockPosition: "cmp-pos-manzana",
  bedrooms: "cmp-recamaras", bathrooms: "cmp-banos", age: "cmp-edad", levels: "cmp-niveles", parking: "cmp-estac",
  kind: "cmp-tipo-bien", year: "cmp-anio", currency: "cmp-moneda", exchangeRate: "cmp-tc", exchangeRateDate: "cmp-tc-fecha", exchangeRateSource: "cmp-tc-fuente",
  characteristicsText: "cmp-texto-libre",
} satisfies Record<string, string>;

/** Area and price are captured at the top of the form; the list of characteristics shows the rest. */
const TOP_FIELDS = new Set(["area", "price"]);
/** Characteristics of the market's list that describe the land: under «Terreno», as the card shows them. */
const LAND_FIELDS = new Set(["landUseKey", "frontCount", "shape", "zone", "frontage", "depth", "topography", "services"]);
/** Those that describe the construction: under «Construcción». */
const CONSTRUCTION_FIELDS = new Set(["quality", "conservation"]);

/** Fixed lists offered while typing these characteristics, after the firm's own values; any other wording is kept as written. */
const OPEN_LISTS: Partial<Record<SuggestedCharacteristic, string[]>> = {
  quality: QUALITY_OPTIONS,
  conservation: CONSERVATION_OPTIONS,
};

/** «Superficie construida (m²)» of a building, «rentable» of a rent, «de terreno» of a land (video 7.2, 14:11). */
const AREA_FIELD_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Superficie de terreno (m²)",
  TERRENO_RENTA: "Superficie de terreno (m²)",
  INMUEBLE_VENTA: "Superficie construida (m²)",
  INMUEBLE_RENTA: "Superficie rentable (m²)",
};

/** «FORMA» of the market's list reads «Forma» in the card; the zoning key, «Clave de uso de suelo». */
const characteristicLabel = (field: CharacteristicField) => {
  if (field.key === "landUseKey") return "Clave de uso de suelo";
  if (!isBuiltinCharacteristic(field.key)) return field.label;
  return field.label.charAt(0) + field.label.slice(1).toLowerCase();
};

const isSuggestedCharacteristic = (key: string): key is SuggestedCharacteristic =>
  (SUGGESTED_CHARACTERISTICS as readonly string[]).includes(key);

/** The annual rent of a monthly one, as typed in the form; empty when the month is not a number. */
const annualOf = (monthly: string) => {
  const value = parseDecimal(monthly);
  return value === null ? "" : String(Number((value * 12).toFixed(2)));
};

const emptyAddress = (): Record<AddressPart, string> =>
  Object.fromEntries(ADDRESS_PARTS.map((part) => [part, ""])) as Record<AddressPart, string>;

function initialDraft(
  comparable: ComparableDto | null, type: ComparableType, prefill: ComparablePrefill = {}, listingText?: string, defaultMonths?: number,
): Draft {
  const address = emptyAddress();
  for (const part of ADDRESS_PARTS) address[part] = comparable?.address?.[part] ?? (comparable ? "" : prefill[part as keyof ComparablePrefill] ?? "");
  // A road read from a listing that already says its type («Av. Hidalgo») takes it, so it is not printed «Calle Av. Hidalgo».
  const prefilledStreetType = !comparable && prefill.street ? streetTypeOfName(prefill.street) : null;
  const details = comparable?.propertyDetails;
  const listing = comparable?.listingDetails;
  // Its kind as the card reads it: the one captured; one of before, by its market or its type of construction.
  const kind = comparable ? kindOfComparable({ type, constructionType: comparable.constructionType, propertyDetails: details }) : defaultKindOfType(type);
  const dollars = listing?.currency === "USD";
  return {
    // The line stored as the parts assemble it is not a text of the appraiser's: it keeps following the fields.
    location: customLocationText(comparable?.location, comparable?.address),
    // A number typed as a formula reads back as typed; an offer in dollars shows its dollars.
    area: comparable?.formulas?.area ?? text(comparable?.area),
    price: dollars ? text(listing?.priceInCurrency ?? comparable?.price) : comparable?.formulas?.price ?? text(comparable?.price),
    sourceName: comparable?.sourceName ?? "",
    contactName: comparable?.contactName ?? "",
    contactPhone: comparable?.contactPhone ?? "",
    url: comparable?.url ?? "",
    offerDate: comparable?.offerDate ?? "",
    landUse: comparable?.landUse ?? "",
    // A new comparable is consulted today; one of before keeps what it had.
    consultedOn: comparable ? comparable.consultedOn ?? "" : todayInMexico(),
    validUntil: comparable?.validUntil ?? "",
    // A new comparable is valid the firm's months; one of before keeps its months, or its day typed.
    validityMonths: comparable ? text(comparable.validityMonths) : String(validityMonthsOf(defaultMonths)),
    urbanProximity: comparable?.urbanProximity ?? "",
    operationType: comparable?.operationType ?? (isRentComparableType(type) ? "RENTA" : "VENTA"),
    latitude: text(comparable?.latitude),
    longitude: text(comparable?.longitude),
    listingText: comparable?.listingText ?? listingText ?? "",
    landArea: text(comparable?.landArea),
    bedrooms: text(comparable?.bedrooms),
    bathrooms: text(comparable?.bathrooms),
    constructionType: comparable?.constructionType ?? "",
    age: text(details?.age),
    levels: text(details?.levels),
    parking: text(details?.parking),
    paving: details?.paving ?? "",
    blockPosition: details?.blockPosition ?? "",
    publicationId: comparable?.listingDetails?.publicationId ?? "",
    kindKey: kind?.key ?? "",
    kindLabel: kind?.label ?? "",
    year: text(details?.year),
    currency: dollars ? "USD" : "MXN",
    exchangeRate: text(listing?.exchangeRate),
    exchangeRateDate: listing?.exchangeRateDate ?? "",
    exchangeRateSource: listing?.exchangeRateSource ?? "",
    address,
    // A comparable of before has no type of road: it reads as «Calle».
    streetType: prefilledStreetType ?? streetTypeOf(comparable?.address),
    streetTypeOther: comparable?.address?.streetTypeOther ?? "",
    // A new comparable may start from the data read from a pasted listing.
    ...(comparable ? {} : pick(prefill, [
      "area", "price", "sourceName", "contactName", "contactPhone", "url", "offerDate", "landUse", "landArea", "bedrooms", "bathrooms", "constructionType",
      "age", "levels", "parking", "publicationId",
    ])),
  };
}

function pick(prefill: ComparablePrefill, keys: DraftKey[]): Partial<Draft> {
  return Object.fromEntries(keys.flatMap((key) => (key in prefill ? [[key, prefill[key as keyof ComparablePrefill] ?? ""]] : [])));
}

/** Characteristics of the market's list a pasted listing may fill. */
const PREFILLED_CHARACTERISTICS = ["frontCount", "frontage", "depth", "shape", "zone", "conservation", "topography", "services", "notes"] as const;
const PREFILLED_LABELS: Record<(typeof PREFILLED_CHARACTERISTICS)[number], string> = {
  frontCount: "Frentes", frontage: "Frente", depth: "Fondo", shape: "Forma", zone: "Zona", conservation: "Conservación",
  topography: "Topografía", services: "Servicios", notes: "",
};

/**
 * The characteristics as the form shows them, by field key; a pasted listing
 * may fill some. One the market's list does not have goes to «Observaciones»
 * with its name, so nothing the listing said is lost.
 */
function initialCharacteristics(comparable: ComparableDto | null, fields: CharacteristicField[], prefill: ComparablePrefill = {}) {
  const values = Object.fromEntries(fields.map((field) => [field.key, comparable ? characteristicText(comparable, field.key) : ""]));
  if (comparable) return values;
  const loose: string[] = [];
  for (const key of PREFILLED_CHARACTERISTICS) {
    const value = prefill[key]?.trim();
    if (!value) continue;
    if (key in values) values[key] = value;
    else if (key !== "notes") loose.push(`${PREFILLED_LABELS[key]}: ${value}`);
  }
  if (loose.length && "notes" in values) values.notes = [values.notes, ...loose].filter(Boolean).join(". ").slice(0, 1000);
  return values;
}

const EMPTY_VALUES: ComparableFormValues = {
  location: "", area: null, price: null, landUse: null, landUseKey: null, shape: null, zone: null, frontCount: null, frontage: null,
  depth: null, topography: null, services: null, conservation: null, quality: null, notes: null, extra: {}, characteristicsText: null, attributes: [],
  sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
};

/** A coordinate typed in the form, decimal or as Google Earth copies it: empty, a number, or NaN when it is not one. */
const coordinate = (value: string) => (value.trim() ? parseCoordinate(value) ?? Number.NaN : null);

/** Degrees, minutes and seconds turned into the decimal the form keeps; anything else stays as typed. */
const decimalCoordinate = (typed: string) => {
  const value = parseCoordinate(typed);
  return value === null ? typed : String(value);
};

/** A listing's link that can be opened: http or https. */
export const openableUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

/** Fields of the form an error points to, so the appraiser sees which one to correct. */
export type ComparableFormField =
  | "location" | "postalCode" | "frontCount" | "latitude" | "longitude" | "landArea" | "bedrooms" | "bathrooms" | "age" | "levels" | "parking"
  | "machinery-year" | "machinery-meter" | "machinery-freight"
  | "year" | "exchangeRate";

/** «Superficie de terreno (m²) dice «México»»: what was typed, so an autofill by the browser is seen at once. */
const typedIn = (label: string, typed: string) => `${label} dice «${typed.trim()}»`;

const numberOf = (typed: string) => (typed.trim() ? parseDecimal(typed) ?? Number.NaN : null);

/**
 * Land area, bedrooms and bathrooms of a built comparable as typed, or the
 * field to correct and why. NaN when something was typed that is not a number.
 */
export function buildingFieldsOf(draft: { landArea: string; bedrooms: string; bathrooms: string }):
  { landArea: number | null; bedrooms: number | null; bathrooms: number | null } | { error: string; field: ComparableFormField } {
  const landArea = numberOf(draft.landArea);
  if (landArea !== null && !(landArea > 0)) {
    return { field: "landArea", error: `${typedIn("Superficie de terreno (m²)", draft.landArea)}: debe ser un número mayor que cero, o quedar vacía.` };
  }
  const bedrooms = numberOf(draft.bedrooms);
  if (bedrooms !== null && !(Number.isInteger(bedrooms) && bedrooms >= 0)) {
    return { field: "bedrooms", error: `${typedIn("Recámaras", draft.bedrooms)}: es un número entero, o queda vacío.` };
  }
  const bathrooms = numberOf(draft.bathrooms);
  if (bathrooms !== null && !(Number.isInteger(bathrooms * 2) && bathrooms >= 0)) {
    return { field: "bathrooms", error: `${typedIn("Baños", draft.bathrooms)}: van en enteros o medios (2 o 2.5), o quedan vacíos.` };
  }
  return { landArea, bedrooms, bathrooms };
}

/** Age, levels and parking of a built comparable as typed (the card's «Construcción»), or the field to correct and why. */
export function constructionDetailsOf(draft: { age: string; levels: string; parking: string }):
  Pick<ComparablePropertyDetails, "age" | "levels" | "parking"> | { error: string; field: ComparableFormField } {
  const age = numberOf(draft.age);
  if (age !== null && !(age >= 0 && age <= 1000)) return { field: "age", error: `${typedIn("Edad (años)", draft.age)}: es un número de años, o queda vacía.` };
  const levels = numberOf(draft.levels);
  if (levels !== null && !(Number.isInteger(levels) && levels >= 0)) return { field: "levels", error: `${typedIn("Niveles", draft.levels)}: es un número entero, o queda vacío.` };
  const parking = numberOf(draft.parking);
  if (parking !== null && !(Number.isInteger(parking) && parking >= 0)) {
    return { field: "parking", error: `${typedIn("Estacionamientos", draft.parking)}: es un número entero, o queda vacío.` };
  }
  return { age, levels, parking };
}

/** The details kept with the comparable: what it had, with what the card edits on top; null when nothing is left. */
function withDetails<T extends object>(stored: T | null | undefined, edited: Partial<T>): T | null {
  const next = { ...(stored ?? {}), ...edited } as T;
  return stored || Object.values(next).some((value) => value !== null && value !== undefined && value !== "") ? next : null;
}

const withoutKey = <T extends object>(record: T | undefined, key: string): T | undefined => {
  if (!record || !(key in record)) return record;
  const { [key as keyof T]: _removed, ...rest } = record;
  return rest as T;
};

/** What the appraiser captured, to tell whether closing the form would lose something. */
const snapshotOf = (...parts: unknown[]) => JSON.stringify(parts, (_key, value: unknown) => (value instanceof File ? `${value.name}:${value.size}` : value));

/** Images chosen before the comparable exists (videos 7.1 and 7.2): uploaded right after it is saved, the photos in their order. */
export type { PendingImages };

export type ComparableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparable: ComparableDto | null;
  /** The card as the firm's base reads it (its warnings, review and uses); without it, an existing comparable's is read when it opens. */
  card?: ComparableCardDto | null;
  /** Values a new comparable opens with; nothing is saved until the appraiser saves. */
  prefill?: ComparablePrefill;
  /** The pasted listing a new comparable comes from, kept as evidence. */
  listingText?: string;
  /** The screenshot and photos a new comparable opens with (pasted in «Pegar anuncio»); uploaded when it is saved. */
  initialImages?: PendingImages;
  characteristicFields: CharacteristicField[];
  comparableType: ComparableType;
  unitLabel: string;
  readOnly: boolean;
  /** `mergeInto`: a new comparable that is the same as that one of the base keeps its number. */
  onSubmit: (values: ComparableFormValues, pending: PendingImages, mergeInto?: string) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
  /** «Encuadre» and «Zoom» of a photo as it prints; without it the photos have no framing control. */
  onFramePhoto?: (photoId: string, framing: ImageFraming | null) => Promise<void>;
  onUploadScreenshot: (file: File) => Promise<void>;
  onRemoveScreenshot: () => Promise<void>;
  /** Comparables of the firm's base that look like the same property. */
  onCheckDuplicates: (probe: DuplicateProbe) => Promise<DuplicateMatchDto[]>;
  /** "Usar el existente": brings that comparable instead of this capture. */
  onReuse: (comparableId: string) => Promise<boolean>;
  /** The months a new comparable is valid for: the firm's. */
  defaultValidityMonths?: number;
  /** Names of the characteristics added to other comparables, offered while typing a new one. */
  attributeNames?: string[];
  /** What «Características agregadas» do here: in a valuation they become characteristics of its market. */
  attributesHint?: string;
  /** In the firm's base the comparable is not in a market: its type is chosen in the form. */
  onTypeChange?: (type: ComparableType) => void;
  /**
   * The comparable is of machinery and equipment (its class): the sheet asks
   * for the machine's data instead of the land and the construction. Without
   * it, one that already carries a machine's data is (comparable-machinery.ts).
   */
  machinery?: boolean;
  /**
   * Real estate or machinery: the kinds the card offers. A market of a
   * valuation is of real estate; in the firm's base it is chosen
   * (`onClassChange`) or it is the stored comparable's.
   */
  comparableClass?: ComparableClass;
  onClassChange?: (kindClass: ComparableClass) => void;
  /** The valuation's day (YYYY-MM-DD), for the age from «Año»; missing, today. */
  valuationDate?: string;
};

/**
 * «Ficha del comparable», one window for reading and editing it (V8.2, 24 nov
 * 2026): it looks like the card the appraiser liked (its bands, its gray
 * labels beside the values, its photos and screenshot first, its map) and
 * every value is a field, for a new comparable and for one already captured.
 * Its homologation factors are captured in the homologation table of the
 * panel, and kept here as they are. A new comparable is checked against the
 * firm's base before it is added.
 */
export function ComparableDialog(props: ComparableDialogProps) {
  const { comparable } = props;
  const expandable = useExpandableDialog();
  // The sheet asks before closing with changes; Escape, the X and «Cancelar» go through it.
  const requestClose = useRef<() => void>(() => props.onOpenChange(false));
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) { props.onOpenChange(true); return; }
        // Escape with a list of suggestions open closes the list, not the form.
        if (typeof document !== "undefined" && document.activeElement?.getAttribute("aria-expanded") === "true") return;
        requestClose.current();
      }}
    >
      <DialogContent className={expandable.className("max-h-[92vh] overflow-y-auto sm:max-w-5xl")}>
        {expandable.button}
        <DialogHeader>
          <DialogTitle>{comparable ? `Ficha del comparable ${comparable.reference}` : "Nuevo comparable"}</DialogTitle>
          <DialogDescription>
            {props.readOnly
              ? "Revisa que la foto, el precio, las superficies, el contacto y la dirección coincidan con el anuncio."
              : "Escribe sobre cualquier dato de la ficha y guarda. En los campos numéricos puedes escribir un cálculo, como =5*10000. Los factores de homologación se capturan en la tabla de homologación del panel."}
            {!comparable && props.prefill ? " Los datos vienen del anuncio que pegaste: revísalos antes de guardar." : null}
          </DialogDescription>
        </DialogHeader>
        <ComparableSheetForm {...props} onCloseRequest={(close) => { requestClose.current = close; }} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The sheet itself, apart from its window so it is tested on its own: the
 * band, the photos and the screenshot, then Oferta, Ubicación (with the map),
 * Fuente de información, Terreno, Construcción, Características y
 * observaciones, Características agregadas and, read only, Más datos del
 * anuncio, Revisión and Avalúos en que se usó.
 */
export function ComparableSheetForm(props: ComparableDialogProps & {
  /** Hands the window what its close (Escape, the X) does: ask first when something was captured. */
  onCloseRequest?: (close: () => void) => void;
}) {
  const { comparable, readOnly } = props;
  const fields = props.characteristicFields.filter((field) => !TOP_FIELDS.has(field.key));
  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(comparable, props.comparableType, props.prefill, props.listingText, props.defaultValidityMonths));
  const [characteristics, setCharacteristics] = useState<Record<string, string>>(() =>
    initialCharacteristics(comparable, fields, props.prefill));
  const [freeText, setFreeText] = useState(comparable?.characteristicsText ?? "");
  // A machine's data instead of the land and the construction (24 Nov 2026).
  const [machineryDraft, setMachineryDraft] = useState(() => machineryDraftOf(comparable?.machinery));
  // Characteristics of this comparable only: a name and a value each, to capture and to filter the firm's base.
  const [attributes, setAttributes] = useState(() => comparable?.attributes?.map((item) => ({ ...item })) ?? []);
  // A rent can be typed as the year: the month (what is stored) is a twelfth of it.
  const [annualRent, setAnnualRent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "screenshot" | null>(null);
  // A new comparable may start with the screenshot and photos pasted in «Pegar anuncio».
  const [pendingScreenshot, setPendingScreenshot] = useState<File | null>(() => (comparable ? null : props.initialImages?.screenshot ?? null));
  // Photos of a new comparable, chosen before it is saved; shown from their local copy.
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ file: File; url: string }>>(() => (comparable ? [] : (props.initialImages?.photos ?? [])
    .slice(0, MAX_COMPARABLE_PHOTOS).map((file) => ({ file, url: previewUrl(file) }))));
  // Those previews belong to the page (the paste dialog shows them too): closing the form does not release them.
  const [keptUrls] = useState(() => new Set(pendingPhotos.map((photo) => photo.url)));
  // What the firm already captured, offered while typing (municipio, colonia, zona…).
  const [suggestions, setSuggestions] = useState<ComparableSuggestions>(emptySuggestions);
  const [error, setError] = useState<{ message: string; field?: ComparableFormField } | null>(null);
  // Closing with unsaved changes (Escape, the X, «Cancelar») asks first instead of losing the capture.
  const [confirmClose, setConfirmClose] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // Matches of the firm's base for a new comparable, waiting for the appraiser's answer.
  const [duplicates, setDuplicates] = useState<DuplicateMatchDto[] | null>(null);
  // What the check while typing found, shown above the form without stopping the capture.
  const [liveMatches, setLiveMatches] = useState<DuplicateMatchDto[]>([]);
  // What the firm's base knows of an existing comparable: its warnings, its review, its uses and its listing's other facts.
  const [loadedCard, setLoadedCard] = useState<ComparableCardDto | null>(null);
  const card = props.card === undefined ? loadedCard : props.card;
  const comparableId = comparable?.id ?? null;
  const cardGiven = props.card !== undefined;
  useEffect(() => {
    if (cardGiven || !comparableId) return;
    let active = true;
    api.market.card(comparableId)
      .then((next) => { if (active) setLoadedCard(next); })
      // Without it the sheet still edits: only the warnings and the uses are missing.
      .catch(() => undefined);
    return () => { active = false; };
  }, [cardGiven, comparableId]);

  const set = (key: DraftKey) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  const setAddress = (part: AddressPart) => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, address: { ...current.address, [part]: event.target.value } }));

  const address: ComparableAddress = {
    ...Object.fromEntries(ADDRESS_PARTS.map((part) => [part, draft.address[part].trim() || null])),
    streetType: draft.streetType,
    ...(draft.streetType === "OTRO" ? { streetTypeOther: draft.streetTypeOther.trim() || null } : {}),
  };
  // The single line the dictamen prints: as typed («&» or «cruce con» read «esquina con»), or composed from the parts.
  const location = normalizeCrossing(draft.location) || formatAddress(address);

  const comparableType = props.comparableType;
  useEffect(() => {
    if (readOnly) return;
    let active = true;
    api.comparableBase.suggestions(comparableType)
      .then((loaded) => { if (active) setSuggestions(loaded); })
      // Without them the form still captures: nothing is offered.
      .catch(() => undefined);
    return () => { active = false; };
  }, [comparableType, readOnly]);
  // The local copies of the photos chosen before saving are let go when the form closes.
  const pendingUrls = useRef<string[]>([]);
  useEffect(() => {
    pendingUrls.current = pendingPhotos.map((photo) => photo.url);
  }, [pendingPhotos]);
  useEffect(() => () => { for (const url of pendingUrls.current) if (!keptUrls.has(url)) URL.revokeObjectURL(url); }, [keptUrls]);

  const built = isBuiltComparableType(props.comparableType);
  const rent = isRentComparableType(props.comparableType);
  const kindClass: ComparableClass = props.comparableClass
    ?? (comparable ? comparableClassOf({ assetClass: comparable.propertyDetails?.assetClass, constructionType: comparable.constructionType }) : "INMUEBLE");
  // A machine's sheet (comparable-machinery-fields) by its class, or by the machine's data it already carries.
  const machinery = isMachineryComparable(comparable ?? {}, props.machinery ?? kindClass === "MAQUINARIA");
  // An automobile, a truck…: the automobile book's fields, in km.
  const vehicle = machinery && isVehicleKind(draft.kindKey);
  // A machine's age follows its model year («Año» of «Datos de la máquina») to the valuation's day, while not typed.
  const referenceDay = props.valuationDate ?? todayInMexico();
  const machineAge = machinery ? ageFromYear(parseDecimal(machineryDraft.year), referenceDay) : null;
  const dollars = draft.currency === "USD";
  // An offer in dollars: the pesos at the rate written, the price the calculation uses.
  const exchangeRate = parseDecimal(draft.exchangeRate);
  const pesos = dollars ? pesosOf(parseDecimal(draft.price), exchangeRate) : null;
  const setAttribute = (index: number, key: "name" | "value", value: string) =>
    setAttributes((current) => current.map((item, position) => (position === index ? { ...item, [key]: value } : item)));
  // The validity: the day of consultation plus its months; a comparable of before without months keeps its day.
  const validUntil = draft.validityMonths ? addMonths(draft.consultedOn || todayInMexico(), Number(draft.validityMonths)) : draft.validUntil;

  /** Land area, bedrooms, bathrooms and type of construction of a built comparable, or what to correct. */
  const buildingValues = (): Pick<ComparableFormValues, "landArea" | "bedrooms" | "bathrooms" | "constructionType"> | { error: string; field: ComparableFormField } => {
    const parsed = buildingFieldsOf(draft);
    return "error" in parsed ? parsed : { ...parsed, constructionType: draft.constructionType.trim() || null };
  };

  /** The values to save, or what the appraiser has to correct. */
  const valuesOf = (): { values: ComparableFormValues } | { error: string; field?: ComparableFormField } => {
    if (!location) return { field: "location", error: "Captura la ubicación del comparable: el texto o, al menos, la calle y el municipio." };
    if (draft.address.postalCode.trim() && !/^\d{5}$/.test(draft.address.postalCode.trim())) {
      return { field: "postalCode", error: `${typedIn("Código postal", draft.address.postalCode)}: lleva 5 dígitos.` };
    }
    const frontCount = characteristics.frontCount?.trim() ? parseDecimal(characteristics.frontCount) : null;
    if (frontCount !== null && (!Number.isInteger(frontCount) || frontCount < 1)) {
      return { field: "frontCount", error: "El número de frentes debe ser un entero de 1 en adelante, o quedar vacío." };
    }
    const latitude = coordinate(draft.latitude);
    const longitude = coordinate(draft.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      const field = Number.isNaN(latitude) ? "latitude" : "longitude";
      return {
        field,
        error: `${typedIn(field === "latitude" ? "Latitud" : "Longitud", draft[field])}: va en grados, como 20.7092 y -102.3467, o como la copia Google Earth (20°43'31.39"N, 102°20'44.85"O).`,
      };
    }
    const coordinatesProblem = coordinatesError(latitude, longitude);
    if (coordinatesProblem) return { field: latitude === null ? "latitude" : "longitude", error: coordinatesProblem };
    const machine = machinery ? machineryDetailsFromDraft(machineryDraft, { vehicle }) : null;
    if (machine && "error" in machine) return { field: machine.field as ComparableFormField, error: machine.error };
    const building = built && !machinery ? buildingValues() : null;
    if (building && "error" in building) return building;
    const construction = built && !machinery ? constructionDetailsOf(draft) : null;
    if (construction && "error" in construction) return construction;
    // A machine has one «Año», the one of its data; the field of the construction is of real estate.
    const year = machinery ? null : numberOf(draft.year);
    const typedAge = machinery ? numberOf(draft.age) : null;
    if (typedAge !== null && !(typedAge >= 0 && typedAge <= 1000)) {
      return { field: "age", error: `${typedIn("Edad (años)", draft.age)}: es un número de años, o queda vacía.` };
    }
    if (year !== null && !(Number.isInteger(year) && year >= 1800 && year <= 2200)) {
      return { field: "year", error: `${typedIn("Año", draft.year)}: es el año del modelo (por ejemplo, 2018), o queda vacío.` };
    }
    if (dollars && draft.exchangeRate.trim() && !(exchangeRate && exchangeRate > 0)) {
      return { field: "exchangeRate", error: `${typedIn("Tipo de cambio", draft.exchangeRate)}: son los pesos por dólar (por ejemplo, 18.3456), o queda vacío.` };
    }
    // What is not in the form (the factors, characteristics out of the list) stays as stored.
    const {
      id: _id, reference: _reference, photos: _photos, folio: _folio, screenshot: _screenshot, review: _review, updatedOn: _updatedOn, ...stored
    } = comparable ?? { ...EMPTY_VALUES, id: "", reference: 0, photos: [] };
    let values: ComparableFormValues = {
      ...stored,
      location,
      address: hasAddress(address) ? address : null,
      sourceName: draft.sourceName.trim() || null,
      contactName: draft.contactName.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      url: draft.url.trim() || null,
      offerDate: draft.offerDate || null,
      consultedOn: draft.consultedOn || null,
      validityMonths: draft.validityMonths ? Number(draft.validityMonths) : null,
      validUntil: validUntil || null,
      urbanProximity: (draft.urbanProximity || null) as UrbanProximity | null,
      operationType: (draft.operationType || null) as OperationType | null,
      latitude,
      longitude,
      listingText: draft.listingText.trim() || null,
      landUse: draft.landUse.trim() || null,
      characteristicsText: freeText.trim() || null,
      attributes: cleanAttributes(attributes),
      ...(building ?? {}),
      // The facts of the card the form edits now; the rest of them (currency, unit basis, verification…) stay as they came.
      propertyDetails: withDetails(stored.propertyDetails, {
        paving: draft.paving.trim() || null,
        blockPosition: draft.blockPosition.trim() || null,
        ...(construction ?? {}),
        kind: draft.kindKey || null,
        kindLabel: draft.kindKey ? draft.kindLabel.trim() || null : null,
        assetClass: draft.kindKey ? kindClass : stored.propertyDetails?.assetClass ?? null,
        year,
        ...(machinery ? { age: typedAge ?? machineAge } : {}),
      }),
      listingDetails: withDetails(stored.listingDetails, {
        publicationId: draft.publicationId.trim().slice(0, 120) || null,
        // In pesos nothing of a rate is kept; in dollars, the dollars and the rate with its day and source.
        currency: dollars ? "USD" : stored.listingDetails?.currency ? "MXN" : null,
        priceInCurrency: dollars ? parseDecimal(draft.price) : null,
        exchangeRate: dollars ? exchangeRate : null,
        exchangeRateDate: dollars ? draft.exchangeRateDate || null : null,
        exchangeRateSource: dollars ? draft.exchangeRateSource.trim() || null : null,
      }),
      ...(machine ? { machinery: machine.details } : {}),
    };
    values = withCharacteristic(values, "area", draft.area, parseDecimal(draft.area));
    // The price the calculation uses is in pesos: in dollars, the dollars at the rate (none without a rate).
    values = dollars ? { ...values, price: pesos, formulas: withoutKey(values.formulas, "price") } : withCharacteristic(values, "price", draft.price, parseDecimal(draft.price));
    for (const field of fields) {
      const typed = characteristics[field.key] ?? "";
      values = withCharacteristic(values, field.key, typed, NUMERIC_CHARACTERISTICS.has(field.key) ? parseDecimal(typed) : null);
    }
    return { values };
  };

  /** `mergeInto`: the answer "es el mismo" to that comparable of the base. */
  const save = async (checkDuplicates: boolean, mergeInto?: string) => {
    const parsed = valuesOf();
    if ("error" in parsed) {
      setError({ message: parsed.error, field: parsed.field });
      // The field to correct, in view and focused.
      const target = parsed.field ? form.current?.querySelector<HTMLElement>(`[data-field="${parsed.field}"]`) : null;
      target?.scrollIntoView({ block: "center" });
      target?.focus();
      return;
    }
    setError(null);
    setSaving(true);
    const { values } = parsed;
    // Only a new comparable is checked: an edited one already is in the base.
    if (!comparable && checkDuplicates) {
      const found = await props.onCheckDuplicates(duplicateProbeOf({ ...values, area: values.area ?? null, price: values.price ?? null }))
        .catch(() => liveMatches);
      if (found.length) {
        setDuplicates(found);
        setSaving(false);
        return;
      }
    }
    const ok = await props.onSubmit(values, { screenshot: pendingScreenshot, photos: pendingPhotos.map((photo) => photo.file) }, mergeInto);
    setSaving(false);
    if (ok) props.onOpenChange(false);
    else setError({ message: "No se pudo guardar el comparable. Lo capturado sigue aquí: revisa el aviso y vuelve a intentarlo." });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(true);
  };

  const reuse = async (comparableId: string) => {
    setSaving(true);
    const ok = await props.onReuse(comparableId);
    setSaving(false);
    if (ok) props.onOpenChange(false);
  };

  const room = MAX_COMPARABLE_PHOTOS - (comparable?.photos.length ?? 0) - pendingPhotos.length;
  /**
   * Several photos at once, one after the other so they keep their order; past
   * the ten a comparable keeps, it says so. A new comparable keeps them until
   * it is saved.
   */
  const uploadPhotos = async (files: File[]) => {
    if (!files.length) return;
    if (files.length > room) {
      setError({ message: `Un comparable lleva hasta ${MAX_COMPARABLE_PHOTOS} fotografías: se agregan ${Math.max(room, 0)} de las ${files.length} que elegiste.` });
    }
    if (!comparable) {
      const chosen = files.slice(0, Math.max(room, 0)).map((file) => ({ file, url: URL.createObjectURL(file) }));
      setPendingPhotos((current) => [...current, ...chosen]);
      return;
    }
    setUploading("photo");
    for (const file of files.slice(0, Math.max(room, 0))) await props.onUploadPhoto(file);
    setUploading(null);
  };
  const uploadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadPhotos(files);
  };

  const chooseScreenshot = async (file: File) => {
    if (!comparable) {
      setPendingScreenshot(file);
      return;
    }
    setUploading("screenshot");
    await props.onUploadScreenshot(file);
    setUploading(null);
  };

  const area = parseDecimal(draft.area);
  // The unit value and the duplicates read the pesos.
  const price = dollars ? pesos : parseDecimal(draft.price);
  const id = formatComparableId(comparable?.folio);

  // A new comparable is checked against the firm's base while it is typed, from its first fields
  // (location, area, phone, listing): the appraiser sees at once that it is already there.
  const probe: DuplicateProbe = {
    url: draft.url.trim() || null, location, address: hasAddress(address) ? address : null, contactPhone: draft.contactPhone.trim() || null,
    price, area, sourceName: draft.sourceName.trim() || null,
    // Only comparables of its class: a backhoe is not the duplicate of a house.
    assetClass: kindClass,
  };
  const probeKey = JSON.stringify(probe);
  // Something to compare: an area, a listing, a phone or a street number.
  const checkWhileTyping = !comparable && !readOnly
    && Boolean(probe.area || probe.url || (probe.contactPhone?.replace(/\D/g, "").length ?? 0) >= 7 || /\d/.test(location));
  const onCheckDuplicates = useEffectEvent((next: DuplicateProbe) => props.onCheckDuplicates(next));
  useEffect(() => {
    if (!checkWhileTyping) return;
    const next = JSON.parse(probeKey) as DuplicateProbe;
    let active = true;
    const timer = setTimeout(() => {
      onCheckDuplicates(next).then((found) => { if (active) setLiveMatches(found); }).catch(() => undefined);
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [checkWhileTyping, probeKey]);

  const current = snapshotOf(draft, characteristics, freeText, attributes, pendingScreenshot, pendingPhotos.map((photo) => photo.file), machineryDraft);
  const [initial] = useState(current);
  // A new comparable from a pasted listing already holds data worth asking about.
  const dirty = !readOnly && (current !== initial || (!comparable && Boolean(props.prefill)));
  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else props.onOpenChange(false);
  };
  // The window's close (Escape, the X) asks the same as «Cancelar».
  const handCloseRequest = useEffectEvent(() => props.onCloseRequest?.(requestClose));
  useEffect(() => {
    handCloseRequest();
  });
  const listingUrl = openableUrl(draft.url);
  // «lat, lon» pasted at once (Google Maps or Earth) fills both fields.
  const pasteCoordinates = (event: ClipboardEvent<HTMLInputElement>) => {
    const pair = parseCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    setDraft((current) => ({ ...current, latitude: String(pair.latitude), longitude: String(pair.longitude) }));
  };
  const invalid = (field: ComparableFormField) => (error?.field === field ? true : undefined);

  /** A part of the address that offers the firm's values while it is typed. */
  const suggestedAddress = (part: AddressPart & SuggestedAddressPart, extra: Partial<ComponentProps<typeof Input>> = {}) => (
    <SuggestInput
      value={draft.address[part]}
      options={suggestions.address[part]}
      label={`${ADDRESS_LABELS[part]} de otras fichas del despacho`}
      onPick={(value) => setDraft((current) => ({ ...current, address: { ...current.address, [part]: value } }))}
    >
      {(combobox) => (
        <Input id={FIELD_IDS[part]} autoComplete={NO_BROWSER_AUTOFILL} {...extra} {...combobox} value={draft.address[part]} onChange={setAddress(part)} />
      )}
    </SuggestInput>
  );
  /** «20°36'55.24" N» under a decimal coordinate: the same point, in the format Google Earth shows. */
  const dmsOf = (typed: string, axis: "latitude" | "longitude") => {
    const value = parseCoordinate(typed);
    if (value === null || Math.abs(value) > (axis === "latitude" ? 90 : 180)) return null;
    return (
      <p className="text-[11px] text-muted-foreground tabular-nums" data-coordinate-dms={axis}>
        = {formatCoordinateDms(value, axis)}
      </p>
    );
  };
  /** A characteristic of the market's list in its cell, with what the firm already wrote for it. */
  const characteristicField = (field: CharacteristicField, wide = false): SheetField => {
    const fieldId = `comparable-${field.key.replace(":", "-")}`;
    const Control = NUMERIC_CHARACTERISTICS.has(field.key) ? FormulaInput : Input;
    // The values of the firm's other comparables of this type first (video 7.2, 19:28), then the fixed list.
    const options = isSuggestedCharacteristic(field.key)
      ? mergeOptions(suggestions.characteristics[field.key], OPEN_LISTS[field.key]) : [];
    const value = characteristics[field.key] ?? "";
    const setValue = (next: string) => setCharacteristics((current) => ({ ...current, [field.key]: next }));
    const control = (combobox: Partial<SuggestFieldProps> = {}) => (
      <Control
        id={fieldId}
        autoComplete={NO_BROWSER_AUTOFILL}
        {...(field.key === "frontCount" ? { "data-field": "frontCount", "aria-invalid": invalid("frontCount") } : {})}
        placeholder={OPEN_LISTS[field.key as SuggestedCharacteristic] ? "Elige o escribe otro" : undefined}
        {...combobox}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
    return {
      key: field.key,
      htmlFor: fieldId,
      label: characteristicLabel(field),
      wide: wide || field.key === "notes",
      control: isSuggestedCharacteristic(field.key) ? (
        <SuggestInput value={value} options={options} label={`${field.label} de otras fichas del despacho`} onPick={setValue}>
          {(combobox) => control(combobox)}
        </SuggestInput>
      ) : control(),
    };
  };
  const field = (key: string, label: ReactNode, control: ReactNode, options: { htmlFor?: string; wide?: boolean } = {}): SheetField =>
    ({ key, label, control, htmlFor: options.htmlFor, wide: options.wide });

  // «Oferta»: the order he asked for (video 7.2, 14:11): operation, construction, offer, land area, built area.
  const offer: SheetField[] = [
    ...(props.onTypeChange ? [field("type", "Tipo de comparable", (
      <NativeSelect id={FIELD_IDS.type} className="w-full" value={props.comparableType} onChange={(event) => props.onTypeChange?.(event.target.value as ComparableType)}>
        {/* Machinery is offered for sale or rent, never as land. */}
        {COMPARABLE_TYPES.filter((item) => !machinery || isBuiltComparableType(item)).map((item) => (
          <NativeSelectOption key={item} value={item}>{machinery ? (isRentComparableType(item) ? "En renta" : "En venta") : COMPARABLE_TYPE_LABELS[item]}</NativeSelectOption>
        ))}
      </NativeSelect>
    ), { htmlFor: FIELD_IDS.type })] : []),
    ...(props.onClassChange && !comparable ? [field("assetClass", "Clase", (
      <NativeSelect
        id="cmp-clase"
        className="w-full"
        value={kindClass}
        onChange={(event) => {
          const next = event.target.value as ComparableClass;
          props.onClassChange?.(next);
          // A kind of the other class does not stay.
          setDraft((current) => ({ ...current, kindKey: "", kindLabel: "" }));
        }}
      >
        <NativeSelectOption value="INMUEBLE">Inmuebles</NativeSelectOption>
        <NativeSelectOption value="MAQUINARIA">Maquinaria y equipo</NativeSelectOption>
      </NativeSelect>
    ), { htmlFor: "cmp-clase" })] : []),
    field("kind", kindFieldLabel(kindClass), (
      <ComparableKindField
        id={FIELD_IDS.kind}
        kindClass={kindClass}
        disabled={readOnly}
        value={{ key: draft.kindKey, label: draft.kindLabel }}
        onChange={(next) => setDraft((current) => ({ ...current, kindKey: next.key, kindLabel: next.label }))}
      />
    ), { htmlFor: FIELD_IDS.kind }),
    field("operation", "Tipo de operación", (
      <NativeSelect id={FIELD_IDS.operation} className="w-full" value={draft.operationType} onChange={set("operationType")}>
        {OPERATION_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{OPERATION_TYPE_LABELS[item]}</NativeSelectOption>)}
      </NativeSelect>
    ), { htmlFor: FIELD_IDS.operation }),
    // A machine has no type of construction: its kind says what it is.
    ...(built && !machinery ? [field("constructionType", "Tipo de construcción", (
      <SuggestInput
        value={draft.constructionType}
        options={mergeOptions(suggestions.characteristics.constructionType, CONSTRUCTION_TYPE_SUGGESTIONS)}
        label="Tipos de construcción"
        onPick={(value) => setDraft((current) => ({ ...current, constructionType: value }))}
      >
        {(combobox) => (
          <Input
            id={FIELD_IDS.constructionType}
            autoComplete={NO_BROWSER_AUTOFILL}
            placeholder="Casa habitación, departamento…"
            {...combobox}
            value={draft.constructionType}
            onChange={set("constructionType")}
          />
        )}
      </SuggestInput>
    ), { htmlFor: FIELD_IDS.constructionType })] : []),
    field("currency", "Moneda", (
      <NativeSelect id={FIELD_IDS.currency} className="w-full" value={draft.currency} onChange={set("currency")}>
        {CURRENCIES.map((item) => <NativeSelectOption key={item} value={item}>{item === "USD" ? "USD (dólares)" : "MXN (pesos)"}</NativeSelectOption>)}
      </NativeSelect>
    ), { htmlFor: FIELD_IDS.currency }),
    field("price", dollars ? `${props.unitLabel} en dólares (USD)` : props.unitLabel, (
      <FormulaInput
        id={FIELD_IDS.price}
        autoComplete={NO_BROWSER_AUTOFILL}
        grouping
        value={draft.price}
        onChange={(event) => { setAnnualRent(null); set("price")(event); }}
      />
    ), { htmlFor: FIELD_IDS.price }),
    ...(dollars ? [
      field("exchangeRate", "Tipo de cambio (pesos por dólar)", (
        <Input
          id={FIELD_IDS.exchangeRate}
          data-field="exchangeRate"
          aria-invalid={invalid("exchangeRate")}
          autoComplete={NO_BROWSER_AUTOFILL}
          inputMode="decimal"
          placeholder="18.3456"
          value={draft.exchangeRate}
          onChange={set("exchangeRate")}
        />
      ), { htmlFor: FIELD_IDS.exchangeRate }),
      field("exchangeRateDate", "Fecha del tipo de cambio", (
        <Input id={FIELD_IDS.exchangeRateDate} type="date" value={draft.exchangeRateDate} onChange={set("exchangeRateDate")} />
      ), { htmlFor: FIELD_IDS.exchangeRateDate }),
      field("exchangeRateSource", "Fuente del tipo de cambio", (
        <Input
          id={FIELD_IDS.exchangeRateSource}
          autoComplete={NO_BROWSER_AUTOFILL}
          maxLength={200}
          placeholder={defaultExchangeRateSource(draft.exchangeRateDate || null)}
          value={draft.exchangeRateSource}
          onChange={set("exchangeRateSource")}
        />
      ), { htmlFor: FIELD_IDS.exchangeRateSource }),
      field("pesos", "Equivalente en pesos (MXN)", (
        <p className="flex min-h-7 items-center px-1 font-medium tabular-nums" data-price-pesos="">
          {pesos === null ? "Escribe el tipo de cambio: sin él no entra al cálculo." : (exchangeNote({ price: pesos, listingDetails: {
            currency: "USD", priceInCurrency: parseDecimal(draft.price), exchangeRate,
            exchangeRateDate: draft.exchangeRateDate || null, exchangeRateSource: draft.exchangeRateSource.trim() || null,
          } }) ?? "—")}
        </p>
      ), { wide: true }),
    ] : []),
    ...(rent ? [field("annualRent", "Renta anual", (
      <>
        <Input
          id={FIELD_IDS.annualRent}
          autoComplete={NO_BROWSER_AUTOFILL}
          inputMode="decimal"
          value={annualRent ?? annualOf(draft.price)}
          onChange={(event) => {
            const typed = event.target.value;
            setAnnualRent(typed);
            const yearly = parseDecimal(typed);
            setDraft((current) => ({ ...current, price: yearly === null ? "" : String(Number((yearly / 12).toFixed(2))) }));
          }}
        />
        <p className="text-[11px] text-muted-foreground">Captura la mensual o la anual: la otra se calcula. Se guarda la mensual.</p>
      </>
    ), { htmlFor: FIELD_IDS.annualRent })] : []),
    // A machine has no areas nor price per m² (its card neither, #160).
    ...(built && !machinery ? [field("landArea", "Superficie de terreno (m²)", (
      <Input
        id={FIELD_IDS.landArea}
        data-field="landArea"
        aria-invalid={invalid("landArea")}
        autoComplete={NO_BROWSER_AUTOFILL}
        inputMode="decimal"
        value={draft.landArea}
        onChange={set("landArea")}
      />
    ), { htmlFor: FIELD_IDS.landArea })] : []),
    ...(machinery ? [] : [field("area", AREA_FIELD_LABELS[props.comparableType], (
      <FormulaInput id={FIELD_IDS.area} autoComplete={NO_BROWSER_AUTOFILL} grouping value={draft.area} onChange={set("area")} />
    ), { htmlFor: FIELD_IDS.area }),
    field("unitValue", rent ? "$/m²/mes" : "$/m²", (
      <p className="flex h-7 items-center px-1 font-medium tabular-nums" data-unit-value="">
        {area && price ? (price / area).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "—"}
      </p>
    ))]),
    field("offerDate", "Fecha de la oferta", (
      <Input id={FIELD_IDS.offerDate} type="date" value={draft.offerDate} onChange={set("offerDate")} />
    ), { htmlFor: FIELD_IDS.offerDate }),
    // A machine's age: from its «Año» to the valuation's day unless typed (the construction, where it goes for real estate, is not shown).
    ...(machinery ? [field("age", "Edad (años)", (
      <>
        <Input
          id={FIELD_IDS.age}
          data-field="age"
          aria-invalid={invalid("age")}
          autoComplete={NO_BROWSER_AUTOFILL}
          inputMode="decimal"
          placeholder={machineAge === null ? "Escribe el año en «Datos de la máquina»" : String(machineAge)}
          value={draft.age}
          onChange={set("age")}
        />
        {machineAge !== null && !draft.age.trim() ? <p className="text-[11px] text-muted-foreground">Del año {machineryDraft.year} al {formatDay(referenceDay)}.</p> : null}
      </>
    ), { htmlFor: FIELD_IDS.age })] : []),
  ];

  const place: SheetField[] = [
    field("state", ADDRESS_LABELS.state, suggestedAddress("state"), { htmlFor: FIELD_IDS.state }),
    field("municipality", ADDRESS_LABELS.municipality, suggestedAddress("municipality"), { htmlFor: FIELD_IDS.municipality }),
    field("postalCode", ADDRESS_LABELS.postalCode, (
      <Input
        id={FIELD_IDS.postalCode}
        data-field="postalCode"
        aria-invalid={invalid("postalCode")}
        autoComplete={NO_BROWSER_AUTOFILL}
        inputMode="numeric"
        maxLength={5}
        value={draft.address.postalCode}
        onChange={setAddress("postalCode")}
      />
    ), { htmlFor: FIELD_IDS.postalCode }),
    field("neighborhood", ADDRESS_LABELS.neighborhood, suggestedAddress("neighborhood"), { htmlFor: FIELD_IDS.neighborhood }),
    field("subdivision", ADDRESS_LABELS.subdivision, suggestedAddress("subdivision"), { htmlFor: FIELD_IDS.subdivision }),
    field("streetType", STREET_TYPE_LABEL, (
      <NativeSelect
        id={FIELD_IDS.streetType}
        className="w-full"
        value={draft.streetType}
        onChange={(event) => setDraft((current) => ({ ...current, streetType: event.target.value as StreetType }))}
      >
        {STREET_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{STREET_TYPE_LABELS[item]}</NativeSelectOption>)}
      </NativeSelect>
    ), { htmlFor: FIELD_IDS.streetType }),
    // «Otro» asks which (video 7.2, 13:14); once written, the firm's other comparables offer it.
    ...(draft.streetType === "OTRO" ? [field("streetTypeOther", "¿Cuál tipo de vialidad?", (
      <>
        <SuggestInput
          value={draft.streetTypeOther}
          options={suggestions.address.streetTypeOther}
          label="Tipos de vialidad que ya usó el despacho"
          onPick={(value) => setDraft((current) => ({ ...current, streetTypeOther: value }))}
        >
          {(combobox) => (
            <Input
              id={FIELD_IDS.streetTypeOther}
              autoComplete={NO_BROWSER_AUTOFILL}
              maxLength={60}
              placeholder="Callejuela, Retorno…"
              {...combobox}
              value={draft.streetTypeOther}
              onChange={(event) => setDraft((current) => ({ ...current, streetTypeOther: event.target.value }))}
            />
          )}
        </SuggestInput>
        <p className="text-[11px] text-muted-foreground">Se imprime antes del nombre y queda en la lista de todas las fichas del despacho.</p>
      </>
    ), { htmlFor: FIELD_IDS.streetTypeOther })] : []),
    field("street", ADDRESS_LABELS.street, (
      <Input id={FIELD_IDS.street} autoComplete={NO_BROWSER_AUTOFILL} value={draft.address.street} onChange={setAddress("street")} />
    ), { htmlFor: FIELD_IDS.street }),
    field("number", ADDRESS_LABELS.number, (
      <Input id={FIELD_IDS.number} autoComplete={NO_BROWSER_AUTOFILL} value={draft.address.number} onChange={setAddress("number")} />
    ), { htmlFor: FIELD_IDS.number }),
    field("crossStreet", ADDRESS_LABELS.crossStreet, (
      <Input
        id={FIELD_IDS.crossStreet}
        autoComplete={NO_BROWSER_AUTOFILL}
        placeholder="Calle Hidalgo: se imprime «… esquina con Calle Hidalgo»"
        value={draft.address.crossStreet}
        onChange={setAddress("crossStreet")}
      />
    ), { htmlFor: FIELD_IDS.crossStreet }),
    field("proximity", "Proximidad urbana", (
      <NativeSelect id={FIELD_IDS.proximity} className="w-full" value={draft.urbanProximity} onChange={set("urbanProximity")}>
        <NativeSelectOption value="">Sin indicar</NativeSelectOption>
        {URBAN_PROXIMITIES.map((item) => <NativeSelectOption key={item} value={item}>{URBAN_PROXIMITY_LABELS[item]}</NativeSelectOption>)}
      </NativeSelect>
    ), { htmlFor: FIELD_IDS.proximity }),
    field("location", "Ubicación como la imprime el dictamen", (
      <>
        <Input
          id={FIELD_IDS.location}
          data-field="location"
          aria-invalid={invalid("location")}
          autoComplete={NO_BROWSER_AUTOFILL}
          value={draft.location}
          placeholder="Se arma sola con los campos de arriba; escribe aquí solo si quieres otro texto"
          onChange={set("location")}
        />
        {/* The line the dictamen prints, shown as text and not as a grey example, so it does not look empty. */}
        <p className="rounded-sm bg-muted/50 px-1.5 py-1" data-location-preview>
          <span className="text-muted-foreground">El dictamen imprime: </span>
          {location ? <span className="font-medium">{location}</span> : <span className="text-muted-foreground">captura la vialidad, el número, la colonia y el municipio</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {draft.location.trim()
            ? "Se imprime el texto que escribiste («&», «cruce con» o «esq.» se imprimen «esquina con»). Bórralo para que se arme con los campos."
            : "Se arma con la calle, el número, la esquina, la colonia, el C.P., el municipio y el estado."}
        </p>
      </>
    ), { htmlFor: FIELD_IDS.location, wide: true }),
    field("latitude", "Latitud", (
      <>
        <Input
          id={FIELD_IDS.latitude}
          data-field="latitude"
          aria-invalid={invalid("latitude")}
          autoComplete={NO_BROWSER_AUTOFILL}
          placeholder={`20.7092 o 20°43'31.39"N`}
          value={draft.latitude}
          onChange={set("latitude")}
          onPaste={pasteCoordinates}
          onBlur={() => setDraft((current) => ({ ...current, latitude: decimalCoordinate(current.latitude) }))}
        />
        {dmsOf(draft.latitude, "latitude")}
      </>
    ), { htmlFor: FIELD_IDS.latitude }),
    field("longitude", "Longitud", (
      <>
        <Input
          id={FIELD_IDS.longitude}
          data-field="longitude"
          aria-invalid={invalid("longitude")}
          autoComplete={NO_BROWSER_AUTOFILL}
          placeholder={`-102.3467 o 102°20'44.85"O`}
          value={draft.longitude}
          onChange={set("longitude")}
          onPaste={pasteCoordinates}
          onBlur={() => setDraft((current) => ({ ...current, longitude: decimalCoordinate(current.longitude) }))}
        />
        {dmsOf(draft.longitude, "longitude")}
      </>
    ), { htmlFor: FIELD_IDS.longitude }),
  ];

  const source: SheetField[] = [
    field("source", "Fuente o portal", (
      <Input id={FIELD_IDS.source} autoComplete={NO_BROWSER_AUTOFILL} placeholder="Inmobiliaria, portal o anuncio" value={draft.sourceName} onChange={set("sourceName")} />
    ), { htmlFor: FIELD_IDS.source }),
    field("contact", "Anunciante", (
      <Input id={FIELD_IDS.contact} autoComplete={NO_BROWSER_AUTOFILL} value={draft.contactName} onChange={set("contactName")} />
    ), { htmlFor: FIELD_IDS.contact }),
    field("phone", "Teléfono", (
      <Input id={FIELD_IDS.phone} autoComplete={NO_BROWSER_AUTOFILL} inputMode="tel" value={draft.contactPhone} onChange={set("contactPhone")} />
    ), { htmlFor: FIELD_IDS.phone }),
    field("consultedOn", "Fecha de consulta", (
      <Input id={FIELD_IDS.consultedOn} type="date" value={draft.consultedOn} onChange={set("consultedOn")} />
    ), { htmlFor: FIELD_IDS.consultedOn }),
    field("validity", "Vigencia de la oferta", (
      <>
        <NativeSelect id={FIELD_IDS.validity} className="w-full" value={draft.validityMonths} onChange={set("validityMonths")}>
          <NativeSelectOption value="">{draft.validUntil ? "La fecha capturada" : "Sin indicar"}</NativeSelectOption>
          {COMPARABLE_VALIDITY_MONTHS.map((months) => (
            <NativeSelectOption key={months} value={String(months)}>{months} {months === 1 ? "mes" : "meses"}</NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-[11px] text-muted-foreground" data-valid-until>
          {validUntil ? `Vigente hasta el ${formatDay(validUntil)}, desde la fecha de consulta.` : "Desde la fecha de consulta."}
        </p>
      </>
    ), { htmlFor: FIELD_IDS.validity }),
    field("publicationId", "ID de publicación", (
      <Input id={FIELD_IDS.publicationId} autoComplete={NO_BROWSER_AUTOFILL} maxLength={120} value={draft.publicationId} onChange={set("publicationId")} />
    ), { htmlFor: FIELD_IDS.publicationId }),
    field("url", "Liga del anuncio", (
      <div className="flex gap-1.5">
        <Input id={FIELD_IDS.url} autoComplete={NO_BROWSER_AUTOFILL} type="url" placeholder="https://" value={draft.url} onChange={set("url")} />
        {/* «Ver anuncio» right in the card. */}
        {listingUrl ? (
          <a className={buttonVariants({ variant: "outline", size: "sm", className: "h-7 shrink-0" })} href={listingUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink data-icon="inline-start" /> Ver anuncio
          </a>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" disabled title="Escribe la liga completa, con https://">
            <ExternalLink data-icon="inline-start" /> Ver anuncio
          </Button>
        )}
      </div>
    ), { htmlFor: FIELD_IDS.url, wide: true }),
    ...(draft.listingText ? [field("listingText", "Texto del anuncio pegado (evidencia)", (
      <Textarea id={FIELD_IDS.listingText} rows={3} className="max-h-40" value={draft.listingText} onChange={set("listingText")} />
    ), { htmlFor: FIELD_IDS.listingText, wide: true })] : []),
  ];

  const land: SheetField[] = [
    field("landUse", "Uso de suelo", (
      <SuggestInput
        value={draft.landUse}
        options={suggestions.characteristics.landUse}
        label="Usos de suelo de otras fichas del despacho"
        onPick={(value) => setDraft((current) => ({ ...current, landUse: value }))}
      >
        {(combobox) => (
          <Input id={FIELD_IDS.landUse} autoComplete={NO_BROWSER_AUTOFILL} placeholder="Descripción, como la imprime el dictamen" {...combobox} value={draft.landUse} onChange={set("landUse")} />
        )}
      </SuggestInput>
    ), { htmlFor: FIELD_IDS.landUse }),
    ...fields.filter((item) => LAND_FIELDS.has(item.key)).map((item) => characteristicField(item)),
    field("paving", "Pavimento / acceso", (
      <Input id={FIELD_IDS.paving} autoComplete={NO_BROWSER_AUTOFILL} maxLength={80} value={draft.paving} onChange={set("paving")} />
    ), { htmlFor: FIELD_IDS.paving }),
    field("blockPosition", "Posición en manzana", (
      <Input id={FIELD_IDS.blockPosition} autoComplete={NO_BROWSER_AUTOFILL} maxLength={80} placeholder="Intermedio, esquina…" value={draft.blockPosition} onChange={set("blockPosition")} />
    ), { htmlFor: FIELD_IDS.blockPosition }),
  ];

  const countField = (key: "bedrooms" | "bathrooms" | "age" | "levels" | "parking" | "year", label: string, extra: Partial<ComponentProps<typeof Input>> = {}) =>
    field(key, label, (
      <Input
        id={FIELD_IDS[key]}
        data-field={key}
        aria-invalid={invalid(key)}
        autoComplete={NO_BROWSER_AUTOFILL}
        inputMode="numeric"
        {...extra}
        value={draft[key]}
        onChange={set(key)}
      />
    ), { htmlFor: FIELD_IDS[key] });
  const construction: SheetField[] = built ? [
    ...fields.filter((item) => CONSTRUCTION_FIELDS.has(item.key)).map((item) => characteristicField(item)),
    countField("age", "Edad (años)", { inputMode: "decimal" }),
    // «Año» of the model: the age follows it, from the valuation's day, while the age is empty (24 Nov 2026).
    field("year", "Año", (
      <Input
        id={FIELD_IDS.year}
        data-field="year"
        aria-invalid={invalid("year")}
        autoComplete={NO_BROWSER_AUTOFILL}
        inputMode="numeric"
        maxLength={4}
        placeholder={machinery ? "2018" : "Año de construcción"}
        value={draft.year}
        onChange={(event) => {
          const typed = event.target.value;
          setDraft((current) => {
            const age = ageFromYear(parseDecimal(typed), referenceDay);
            const followed = !current.age.trim() || String(ageFromYear(parseDecimal(current.year), referenceDay)) === current.age.trim();
            return { ...current, year: typed, ...(followed ? { age: age === null ? "" : String(age) } : {}) };
          });
        }}
      />
    ), { htmlFor: FIELD_IDS.year }),
    countField("levels", "Niveles"),
    countField("bedrooms", "Recámaras"),
    countField("bathrooms", "Baños", { inputMode: "decimal", placeholder: "2.5" }),
    countField("parking", "Estacionamientos"),
  ] : [];

  const others: SheetField[] = [
    ...fields.filter((item) => !LAND_FIELDS.has(item.key) && !CONSTRUCTION_FIELDS.has(item.key) && item.key !== "notes")
      .map((item) => characteristicField(item)),
    field("characteristicsText", "Texto libre de características", (
      <Textarea
        id={FIELD_IDS.characteristicsText}
        rows={2}
        placeholder="Si lo escribes, el dictamen lo imprime en lugar de la línea de características."
        value={freeText}
        onChange={(event) => setFreeText(event.target.value)}
      />
    ), { htmlFor: FIELD_IDS.characteristicsText, wide: true }),
    ...fields.filter((item) => item.key === "notes").map((item) => ({ ...characteristicField(item), label: "Observaciones" })),
  ];

  const details = card ? listingDetailItems(card.comparable) : [];
  const where = card?.valuation ? `Capturado en el avalúo ${card.valuation.folio}`
    : card ? "En la base general, sin avalúo"
      : comparable ? "" : props.onTypeChange ? "Se guarda en la base general del despacho" : "Se guarda en este avalúo y en la base del despacho";

  return (
    <>
      <div className="grid gap-3 text-sm" data-comparable-sheet={comparable ? "editar" : "nuevo"}>
        <ComparableCardHeader id={id ?? (comparable ? null : "Nuevo")} type={props.comparableType} reference={comparable?.reference ?? null} review={comparable?.review} where={where} />
        {comparable?.updatedOn ? <ComparableValidityLine updatedOn={comparable.updatedOn} months={comparable.validityMonths ?? props.defaultValidityMonths} /> : null}
        {card ? <ComparableCardWarnings warnings={card.warnings} /> : null}

        {duplicates ? (
          <section className="grid gap-3 rounded-md border border-highlight/50 bg-highlight/10 p-3" aria-label="Posibles duplicados" data-duplicates>
            <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
              <Copy className="mt-0.5 size-4 shrink-0" />
              Posible duplicado: este inmueble parece estar ya en la base del despacho.
            </p>
            <p className="text-xs text-muted-foreground">
              Si es el mismo, se conserva su número y se queda la información más reciente (la que capturas ahora), con sus fotos.
              Si son diferentes, se guardan los dos, cada uno con su número.
            </p>
            <DuplicateMatchList
              matches={duplicates}
              busy={saving}
              onSame={(comparableId) => void save(false, comparableId)}
              onReuse={(comparableId) => void reuse(comparableId)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save(false)}>Son diferentes: conservar ambos</Button>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDuplicates(null)}>Volver a la captura</Button>
            </div>
          </section>
        ) : null}

        {/* Chrome's address autofill wrote «México» in the land area and the comparable would not save: see NO_BROWSER_AUTOFILL. */}
        <form ref={form} className="grid gap-3" onSubmit={submit} hidden={duplicates !== null} autoComplete="off" data-no-browser-autofill>
          {checkWhileTyping && liveMatches.length ? (
            <section
              className="grid gap-2 rounded-md border border-highlight/50 bg-highlight/10 p-3"
              aria-label="Ya está en la base"
              aria-live="polite"
              data-duplicates-live
            >
              <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                <Copy className="mt-0.5 size-4 shrink-0" />
                Este inmueble parece estar ya en la base del despacho. Puedes usar el existente en lugar de capturarlo otra vez.
              </p>
              <DuplicateMatchList
                matches={liveMatches}
                busy={saving}
                onSame={(comparableId) => void save(false, comparableId)}
                onReuse={(comparableId) => void reuse(comparableId)}
              />
            </section>
          ) : null}

          {/* The photos and the screenshot first, side by side, as the card shows them; from the first capture, before saving (videos 7.1 and 7.2). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SheetFormSection title="Fotografías del inmueble">
              <div className="flex flex-wrap gap-2" data-comparable-photos>
                {(comparable?.photos ?? []).map((photo) => (
                  <figure key={photo.id} className="relative size-24 overflow-hidden rounded-md border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.title} className="size-full object-cover" />
                    {props.onFramePhoto ? (
                      <span className="absolute bottom-1 left-1">
                        <ComparablePhotoFraming photo={photo} readOnly={readOnly} onSave={props.onFramePhoto} />
                      </span>
                    ) : null}
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        className="absolute top-1 right-1"
                        aria-label={`Quitar ${photo.title}`}
                        onClick={() => void props.onRemovePhoto(photo.id)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </figure>
                ))}
                {pendingPhotos.map((photo, index) => (
                  <figure key={photo.url} className="relative size-24 overflow-hidden rounded-md border border-dashed bg-muted" data-pending-photo>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`Fotografía ${index + 1} por guardar`} className="size-full object-cover" />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="absolute top-1 right-1"
                      aria-label={`Quitar la fotografía ${index + 1}`}
                      onClick={() => {
                        URL.revokeObjectURL(photo.url);
                        setPendingPhotos((current) => current.filter((item) => item.url !== photo.url));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </figure>
                ))}
                {!readOnly ? (
                  <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted">
                    {uploading === "photo" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    Agregar fotos
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      aria-label="Agregar fotografías del inmueble"
                      className="sr-only"
                      onChange={uploadPhoto}
                      disabled={uploading !== null || room <= 0}
                    />
                  </label>
                ) : null}
                {readOnly && !comparable?.photos.length ? <p className="text-xs text-muted-foreground">Sin fotografías.</p> : null}
              </div>
              {!readOnly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <PasteImageButton baseName="foto-comparable" multiple disabled={uploading !== null || room <= 0} onFiles={(files) => void uploadPhotos(files)} />
                  <span className="text-xs text-muted-foreground">
                    Elige varias a la vez (hasta {MAX_COMPARABLE_PHOTOS}) o pega una imagen copiada.
                    {pendingPhotos.length ? " Se suben al guardar el comparable, en este orden." : ""}
                  </span>
                </div>
              ) : null}
            </SheetFormSection>
            <SheetFormSection title="Pantalla de referencia">
              <ScreenshotSlot
                storedUrl={comparable?.screenshot?.url || null}
                pending={pendingScreenshot}
                readOnly={readOnly}
                busy={uploading === "screenshot"}
                onChoose={(file) => void chooseScreenshot(file)}
                onRemove={() => {
                  if (pendingScreenshot) setPendingScreenshot(null);
                  else void props.onRemoveScreenshot();
                }}
              />
            </SheetFormSection>
          </div>

          <fieldset disabled={readOnly || saving} className="grid min-w-0 gap-3">
            <SheetSection title="Oferta"><SheetFieldTable items={offer} /></SheetSection>
            <SheetSection title="Ubicación">
              <SheetFieldTable items={place} />
              {/* V7.2-06 and V8.2: the pin on the map fills the latitude and longitude; the address is looked up in a map's words. */}
              <ComparableLocationPicker
                className="border-t p-1.5"
                latitude={parseCoordinate(draft.latitude)}
                longitude={parseCoordinate(draft.longitude)}
                address={location}
                query={geocodingQueryOf(hasAddress(address) ? address : null, location)}
                parts={address}
                disabled={readOnly || saving}
                onChange={(point) => setDraft((current) => ({ ...current, latitude: String(point.latitude), longitude: String(point.longitude) }))}
              />
            </SheetSection>
            <SheetSection title="Fuente de información"><SheetFieldTable items={source} /></SheetSection>
            {machinery ? (
              <MachineryDetailsFields draft={machineryDraft} onChange={setMachineryDraft} invalidField={error?.field} autoComplete={NO_BROWSER_AUTOFILL} vehicle={vehicle} />
            ) : (
              <SheetSection title="Terreno"><SheetFieldTable items={land} /></SheetSection>
            )}
            {built && !machinery ? (
              <SheetSection title="Construcción">
                <SheetFieldTable items={construction} />
                <p className="border-t px-2 py-1 text-[11px] text-muted-foreground">
                  La superficie de terreno, las recámaras, los baños, la edad, los niveles y los estacionamientos sirven para buscarlo en la base del despacho;
                  el cálculo y el dictamen no los usan.
                </p>
              </SheetSection>
            ) : null}
            <SheetSection title="Características y observaciones"><SheetFieldTable items={others} /></SheetSection>

            <SheetFormSection
              title="Características agregadas"
              hint={props.attributesHint ?? "Agrega lo que este comparable tiene y la lista no (alberca, vista, amueblado…): nombre y valor. Sirven para capturar y para filtrar en Comparables; el cálculo no las usa."}
            >
              <div className="grid gap-2" data-comparable-attributes>
                {attributes.map((item, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <Input
                      aria-label={`Nombre de la característica ${index + 1}`}
                      list="comparable-attribute-names"
                      placeholder="Nombre"
                      maxLength={60}
                      value={item.name}
                      onChange={(event) => setAttribute(index, "name", event.target.value)}
                    />
                    <Input
                      aria-label={`Valor de la característica ${index + 1}`}
                      placeholder="Valor"
                      maxLength={200}
                      value={item.value}
                      onChange={(event) => setAttribute(index, "value", event.target.value)}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Quitar la característica ${item.name || index + 1}`}
                      onClick={() => setAttributes((current) => current.filter((_, position) => position !== index))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <datalist id="comparable-attribute-names">
                  {(props.attributeNames ?? []).map((name) => <option key={name} value={name} />)}
                </datalist>
                {!readOnly ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={attributes.length >= MAX_COMPARABLE_ATTRIBUTES}
                    onClick={() => setAttributes((current) => [...current, { name: "", value: "" }])}
                  >
                    <Plus data-icon="inline-start" /> Agregar característica
                  </Button>
                ) : null}
              </div>
            </SheetFormSection>
          </fieldset>

          {/* What the firm's base knows of it and the sheet does not edit. */}
          {details.length ? <SheetSection title="Más datos del anuncio"><SheetTable items={details} /></SheetSection> : null}
          {card ? <ComparableCardReview review={card.comparable.review} /> : null}
          {card ? <ComparableCardUses uses={card.uses} /> : null}

          {error ? <p className="text-sm text-destructive" role="alert" data-form-error={error.field}>{error.message}</p> : null}
          <DialogFooter className="sticky -bottom-4 z-10 -mx-1 bg-popover px-1 pt-2 pb-4 sm:-bottom-6 sm:pb-6">
            {comparable ? (
              <a className={cn(buttonVariants({ variant: "outline" }), "sm:mr-auto")} href={`/comparables/${comparable.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink data-icon="inline-start" /> Abrir en otra pestaña
              </a>
            ) : null}
            <Button type="button" variant="outline" onClick={requestClose}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly ? (
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Guardar comparable
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </div>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sin guardar el comparable?</AlertDialogTitle>
            <AlertDialogDescription>Lo que capturaste en este comparable todavía no se guarda. Si cierras, se pierde.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir capturando</AlertDialogCancel>
            <Button type="button" variant="outline" className="text-destructive" onClick={() => { setConfirmClose(false); props.onOpenChange(false); }}>
              Descartar cambios
            </Button>
            <Button type="button" disabled={saving} onClick={() => { setConfirmClose(false); form.current?.requestSubmit(); }}>
              Guardar comparable
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The comparables of the base a capture matches, with what they match on and the answers. */
function DuplicateMatchList(props: {
  matches: DuplicateMatchDto[];
  busy: boolean;
  onSame: (comparableId: string) => void;
  onReuse: (comparableId: string) => void;
}) {
  return (
    <ul className="grid gap-2">
      {props.matches.map((match) => (
        <li key={match.comparableId} className="grid gap-2 rounded-md border bg-background p-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" data-duplicate={formatComparableId(match.folio) ?? match.comparableId}>
          {match.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.thumbnailUrl} alt="" className="size-12 rounded object-cover" />
          ) : <span className="hidden sm:block sm:w-12" />}
          <div className="min-w-0">
            <p className="font-medium">
              Coincide con <span className="font-mono">{formatComparableId(match.folio) ?? "un comparable sin número"}</span> · {match.location}
            </p>
            <p className="text-xs text-muted-foreground">
              {COMPARABLE_TYPE_LABELS[match.type]} · {money(match.price)}
              {match.area ? ` · ${match.area.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²` : ""}
              {match.contactPhone ? ` · tel. ${match.contactPhone}` : ""} · {match.valuation ? `avalúo ${match.valuation.folio}` : "base general"}
              {match.sameValuation ? " (este avalúo)" : ""} · datos del {formatDay(match.updatedOn)}
            </p>
            <p className="text-xs font-medium text-foreground">
              Coinciden: {match.reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(", ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <ComparableCardButton comparableId={match.comparableId} />
            <Button type="button" size="sm" disabled={props.busy} onClick={() => props.onReuse(match.comparableId)}>
              Usar el existente
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onSame(match.comparableId)}>
              Es el mismo: conservar lo que capturo
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

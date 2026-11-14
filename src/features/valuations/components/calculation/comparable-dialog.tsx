"use client";

import { Copy, ExternalLink, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentProps, type FormEvent,
} from "react";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, type ComparableFormValues } from "@/lib/api-client";
import type { ComparablePrefill } from "@/features/ai/listing-prefill";
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
  type OperationType,
  type UrbanProximity,
  type StreetType,
  STREET_TYPES,
  STREET_TYPE_LABEL,
  STREET_TYPE_LABELS,
  streetTypeOf,
} from "@/features/valuations/calculation/comparable-card";
import type { DuplicateMatchDto } from "@/features/valuations/calculation/comparable-card.service";
import { DUPLICATE_REASON_LABELS, duplicateProbeOf, type DuplicateProbe } from "@/features/valuations/calculation/comparable-duplicates";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { ComparableLocationPicker } from "@/features/valuations/comparable-base/components/comparable-location-picker";
import { ComparableCardButton } from "./comparable-card-dialog";
import { ComparableValidityLine } from "./comparable-validity-badge";
import { COMPARABLE_VALIDITY_MONTHS, addMonths, validityMonthsOf } from "@/features/valuations/calculation/comparable-validity";
import { FormulaInput } from "./formula-input";
import { useExpandableDialog } from "./expandable-dialog";
import { ScreenshotSlot } from "./screenshot-slot";
import { ComparablePhotoFraming } from "./comparable-photo-framing";
import type { ImageFraming } from "@/features/valuations/services/image-framing";
import { SheetFormSection } from "./comparable-sheet";
import { SuggestInput, type SuggestFieldProps } from "./suggest-input";
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
  | "landArea" | "bedrooms" | "bathrooms" | "constructionType";
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
  location: "cmp-ubic-linea", latitude: "cmp-coord-1", longitude: "cmp-coord-2",
  area: "cmp-sup-1", landArea: "cmp-sup-2", price: "cmp-oferta", source: "cmp-fuente", contact: "cmp-contacto-1", phone: "cmp-contacto-2",
  url: "cmp-anuncio",
} satisfies Record<string, string>;

/** Area and price are captured at the top of the form; the list of characteristics shows the rest. */
const TOP_FIELDS = new Set(["area", "price"]);

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
  for (const part of ADDRESS_PARTS) address[part] = comparable?.address?.[part] ?? "";
  return {
    location: comparable?.location ?? "",
    // A number typed as a formula reads back as typed.
    area: comparable?.formulas?.area ?? text(comparable?.area),
    price: comparable?.formulas?.price ?? text(comparable?.price),
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
    address,
    // A comparable of before has no type of road: it reads as «Calle».
    streetType: streetTypeOf(comparable?.address),
    streetTypeOther: comparable?.address?.streetTypeOther ?? "",
    // A new comparable may start from the data read from a pasted listing.
    ...(comparable ? {} : pick(prefill, ["location", "area", "price", "sourceName", "contactName", "contactPhone", "url", "offerDate", "landUse"])),
  };
}

function pick(prefill: ComparablePrefill, keys: DraftKey[]): Partial<Draft> {
  return Object.fromEntries(keys.flatMap((key) => (key in prefill ? [[key, prefill[key as keyof ComparablePrefill] ?? ""]] : [])));
}

/** The characteristics as the form shows them, by field key; a pasted listing may fill some. */
function initialCharacteristics(comparable: ComparableDto | null, fields: CharacteristicField[], prefill: ComparablePrefill = {}) {
  const values = Object.fromEntries(fields.map((field) => [field.key, comparable ? characteristicText(comparable, field.key) : ""]));
  if (comparable) return values;
  for (const key of ["frontage", "depth", "topography", "services"] as const) {
    if (prefill[key] !== undefined && key in values) values[key] = prefill[key] ?? "";
  }
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
  | "location" | "postalCode" | "frontCount" | "latitude" | "longitude" | "landArea" | "bedrooms" | "bathrooms";

/** «Superficie de terreno (m²) dice «México»»: what was typed, so an autofill by the browser is seen at once. */
const typedIn = (label: string, typed: string) => `${label} dice «${typed.trim()}»`;

/**
 * Land area, bedrooms and bathrooms of a built comparable as typed, or the
 * field to correct and why. NaN when something was typed that is not a number.
 */
export function buildingFieldsOf(draft: { landArea: string; bedrooms: string; bathrooms: string }):
  { landArea: number | null; bedrooms: number | null; bathrooms: number | null } | { error: string; field: ComparableFormField } {
  const numberOf = (typed: string) => (typed.trim() ? parseDecimal(typed) ?? Number.NaN : null);
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

/** What the appraiser captured, to tell whether closing the form would lose something. */
const snapshotOf = (...parts: unknown[]) => JSON.stringify(parts, (_key, value: unknown) => (value instanceof File ? `${value.name}:${value.size}` : value));

/**
 * Images chosen before the comparable exists (videos 7.1 and 7.2): uploaded
 * right after it is saved, the photos in the order they were chosen.
 */
export type PendingImages = { screenshot: File | null; photos: File[] };

/**
 * The data of one comparable: where it is, its offer, its source and
 * evidence, its characteristics (the fields of the market's list) and its
 * photos. Its homologation factors are captured in the homologation table of
 * the panel, and kept here as they are. A new comparable is checked against
 * the firm's base before it is added.
 */
export function ComparableDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparable: ComparableDto | null;
  /** Values a new comparable opens with; nothing is saved until the appraiser saves. */
  prefill?: ComparablePrefill;
  /** The pasted listing a new comparable comes from, kept as evidence. */
  listingText?: string;
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
}) {
  const { comparable, readOnly } = props;
  const fields = props.characteristicFields.filter((field) => !TOP_FIELDS.has(field.key));
  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(comparable, props.comparableType, props.prefill, props.listingText, props.defaultValidityMonths));
  const [characteristics, setCharacteristics] = useState<Record<string, string>>(() =>
    initialCharacteristics(comparable, fields, props.prefill));
  const [freeText, setFreeText] = useState(comparable?.characteristicsText ?? "");
  // Characteristics of this comparable only: a name and a value each, to capture and to filter the firm's base.
  const [attributes, setAttributes] = useState(() => comparable?.attributes?.map((item) => ({ ...item })) ?? []);
  // A rent can be typed as the year: the month (what is stored) is a twelfth of it.
  const [annualRent, setAnnualRent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "screenshot" | null>(null);
  const [pendingScreenshot, setPendingScreenshot] = useState<File | null>(null);
  // Photos of a new comparable, chosen before it is saved; shown from their local copy.
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ file: File; url: string }>>([]);
  // What the firm already captured, offered while typing (municipio, colonia, zona…).
  const [suggestions, setSuggestions] = useState<ComparableSuggestions>(emptySuggestions);
  const [error, setError] = useState<{ message: string; field?: ComparableFormField } | null>(null);
  // Closing with unsaved changes (Escape, the X, «Cancelar») asks first instead of losing the capture.
  const [confirmClose, setConfirmClose] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const expandable = useExpandableDialog();
  // Matches of the firm's base for a new comparable, waiting for the appraiser's answer.
  const [duplicates, setDuplicates] = useState<DuplicateMatchDto[] | null>(null);
  // What the check while typing found, shown above the form without stopping the capture.
  const [liveMatches, setLiveMatches] = useState<DuplicateMatchDto[]>([]);

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
  useEffect(() => () => { for (const url of pendingUrls.current) URL.revokeObjectURL(url); }, []);

  const built = isBuiltComparableType(props.comparableType);
  const rent = isRentComparableType(props.comparableType);
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
    const building = built ? buildingValues() : null;
    if (building && "error" in building) return building;
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
    };
    for (const key of ["area", "price"] as const) values = withCharacteristic(values, key, draft[key], parseDecimal(draft[key]));
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
  const price = parseDecimal(draft.price);
  const id = formatComparableId(comparable?.folio);

  // A new comparable is checked against the firm's base while it is typed, from its first fields
  // (location, area, phone, listing): the appraiser sees at once that it is already there.
  const probe: DuplicateProbe = {
    url: draft.url.trim() || null, location, address: hasAddress(address) ? address : null, contactPhone: draft.contactPhone.trim() || null,
    price, area, sourceName: draft.sourceName.trim() || null,
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

  const current = snapshotOf(draft, characteristics, freeText, attributes, pendingScreenshot, pendingPhotos.map((photo) => photo.file));
  const [initial] = useState(current);
  // A new comparable from a pasted listing already holds data worth asking about.
  const dirty = !readOnly && (current !== initial || (!comparable && Boolean(props.prefill)));
  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else props.onOpenChange(false);
  };
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
      <p className="text-xs text-muted-foreground tabular-nums" data-coordinate-dms={axis}>
        = {formatCoordinateDms(value, axis)}
      </p>
    );
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) { props.onOpenChange(true); return; }
        // Escape with a list of suggestions open closes the list, not the form.
        if (typeof document !== "undefined" && document.activeElement?.getAttribute("aria-expanded") === "true") return;
        requestClose();
      }}
    >
      <DialogContent className={expandable.className("max-h-[92vh] overflow-y-auto sm:max-w-4xl")}>
        {expandable.button}
        <DialogHeader>
          <DialogTitle>{comparable ? `Comparable ${comparable.reference}${id ? ` · ${id}` : ""}` : "Nuevo comparable"}</DialogTitle>
          <DialogDescription>
            En cualquier campo numérico puedes escribir un cálculo empezando con el signo igual, por ejemplo =5*10000. Los factores de
            homologación se capturan en la tabla de homologación del panel.
            {!comparable && props.prefill ? " Los datos vienen del anuncio que pegaste: revísalos antes de guardar." : null}
          </DialogDescription>
        </DialogHeader>

        {comparable?.updatedOn ? <ComparableValidityLine updatedOn={comparable.updatedOn} months={comparable.validityMonths ?? props.defaultValidityMonths} /> : null}

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
        <form ref={form} className="grid gap-5" onSubmit={submit} hidden={duplicates !== null} autoComplete="off" data-no-browser-autofill>
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
          <fieldset disabled={readOnly || saving} className="grid gap-5">
            <SheetFormSection title="Ubicación">
              <FieldGroup className="grid gap-3 sm:grid-cols-6">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.state}>{ADDRESS_LABELS.state}</FieldLabel>
                  {suggestedAddress("state")}
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.municipality}>{ADDRESS_LABELS.municipality}</FieldLabel>
                  {suggestedAddress("municipality")}
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.postalCode}>{ADDRESS_LABELS.postalCode}</FieldLabel>
                  <Input id={FIELD_IDS.postalCode} data-field="postalCode" aria-invalid={invalid("postalCode")} autoComplete={NO_BROWSER_AUTOFILL} inputMode="numeric" maxLength={5} value={draft.address.postalCode} onChange={setAddress("postalCode")} />
                </Field>
                <Field className="sm:col-span-3">
                  <FieldLabel htmlFor={FIELD_IDS.neighborhood}>{ADDRESS_LABELS.neighborhood}</FieldLabel>
                  {suggestedAddress("neighborhood")}
                </Field>
                <Field className="sm:col-span-3">
                  <FieldLabel htmlFor={FIELD_IDS.subdivision}>{ADDRESS_LABELS.subdivision} (opcional)</FieldLabel>
                  {suggestedAddress("subdivision")}
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.streetType}>{STREET_TYPE_LABEL}</FieldLabel>
                  <NativeSelect
                    id={FIELD_IDS.streetType}
                    className="w-full"
                    value={draft.streetType}
                    onChange={(event) => setDraft((current) => ({ ...current, streetType: event.target.value as StreetType }))}
                  >
                    {STREET_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{STREET_TYPE_LABELS[item]}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                {draft.streetType === "OTRO" ? (
                  // «Otro» asks which (video 7.2, 13:14); once written, the firm's other comparables offer it.
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={FIELD_IDS.streetTypeOther}>¿Cuál tipo de vialidad?</FieldLabel>
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
                    <p className="text-xs text-muted-foreground">Se imprime antes del nombre y queda en la lista de todas las fichas del despacho.</p>
                  </Field>
                ) : null}
                <Field className={draft.streetType === "OTRO" ? "sm:col-span-2" : "sm:col-span-3"}>
                  <FieldLabel htmlFor={FIELD_IDS.street}>{ADDRESS_LABELS.street}</FieldLabel>
                  <Input id={FIELD_IDS.street} autoComplete={NO_BROWSER_AUTOFILL} value={draft.address.street} onChange={setAddress("street")} />
                </Field>
                <Field className={draft.streetType === "OTRO" ? "sm:col-span-2" : undefined}>
                  <FieldLabel htmlFor={FIELD_IDS.number}>{ADDRESS_LABELS.number}</FieldLabel>
                  <Input id={FIELD_IDS.number} autoComplete={NO_BROWSER_AUTOFILL} value={draft.address.number} onChange={setAddress("number")} />
                </Field>
                <Field className={draft.streetType === "OTRO" ? "sm:col-span-4" : "sm:col-span-6"}>
                  <FieldLabel htmlFor={FIELD_IDS.crossStreet}>{ADDRESS_LABELS.crossStreet} (opcional)</FieldLabel>
                  <Input
                    id={FIELD_IDS.crossStreet}
                    autoComplete={NO_BROWSER_AUTOFILL}
                    placeholder="Calle Hidalgo: se imprime «… esquina con Calle Hidalgo»"
                    value={draft.address.crossStreet}
                    onChange={setAddress("crossStreet")}
                  />
                </Field>
                <Field className="sm:col-span-6">
                  <FieldLabel htmlFor={FIELD_IDS.location}>Ubicación como la imprime el dictamen</FieldLabel>
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
                  <p className="rounded-md border bg-muted/40 px-2 py-1.5 text-sm" data-location-preview>
                    <span className="text-xs text-muted-foreground">El dictamen imprime: </span>
                    {location ? <span className="font-medium">{location}</span> : <span className="text-muted-foreground">captura la vialidad, el número, la colonia y el municipio</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draft.location.trim()
                      ? "Se imprime el texto que escribiste («&», «cruce con» o «esq.» se imprimen «esquina con»). Bórralo para que se arme con los campos."
                      : "Se arma con la calle, el número, la esquina, la colonia, el C.P., el municipio y el estado."}
                  </p>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="comparable-proximity">Proximidad urbana</FieldLabel>
                  <NativeSelect id="comparable-proximity" className="w-full" value={draft.urbanProximity} onChange={set("urbanProximity")}>
                    <NativeSelectOption value="">Sin indicar</NativeSelectOption>
                    {URBAN_PROXIMITIES.map((item) => <NativeSelectOption key={item} value={item}>{URBAN_PROXIMITY_LABELS[item]}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.latitude}>Latitud (opcional)</FieldLabel>
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
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.longitude}>Longitud (opcional)</FieldLabel>
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
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-6">
                  Pega las coordenadas en decimales o como las copia Google Earth (20°43&apos;31.39&quot;N); si pegas las dos juntas, se llenan solas.
                  Se guardan en decimales y debajo se ve el mismo punto en grados, minutos y segundos: los minutos y segundos van de 0 a 59, por eso
                  cambian los dígitos y no el lugar.
                </p>
                {/* V7.2-06: the pin on the map fills the latitude and longitude (comparable-location-picker.tsx, maps area). */}
                <ComparableLocationPicker
                  className="sm:col-span-6"
                  latitude={parseCoordinate(draft.latitude)}
                  longitude={parseCoordinate(draft.longitude)}
                  address={location}
                  disabled={readOnly || saving}
                  onChange={(point) => setDraft((current) => ({ ...current, latitude: String(point.latitude), longitude: String(point.longitude) }))}
                />
              </FieldGroup>
            </SheetFormSection>

            <SheetFormSection title={built ? "Oferta, superficies y construcción" : "Oferta y superficie"}>
            <FieldGroup className="grid gap-3 sm:grid-cols-6">
              {props.onTypeChange ? (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="comparable-type">Tipo de comparable</FieldLabel>
                  <NativeSelect
                    id="comparable-type"
                    className="w-full"
                    value={props.comparableType}
                    onChange={(event) => props.onTypeChange?.(event.target.value as ComparableType)}
                  >
                    {COMPARABLE_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{COMPARABLE_TYPE_LABELS[item]}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
              ) : null}
              {/* The order he asked for (video 7.2, 14:11): operation, construction, offer, land area, built area. */}
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="comparable-operation">Tipo de operación</FieldLabel>
                <NativeSelect id="comparable-operation" className="w-full" value={draft.operationType} onChange={set("operationType")}>
                  {OPERATION_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{OPERATION_TYPE_LABELS[item]}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              {built ? (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="comparable-construction-type">Tipo de construcción</FieldLabel>
                  <SuggestInput
                    value={draft.constructionType}
                    options={mergeOptions(suggestions.characteristics.constructionType, CONSTRUCTION_TYPE_SUGGESTIONS)}
                    label="Tipos de construcción"
                    onPick={(value) => setDraft((current) => ({ ...current, constructionType: value }))}
                  >
                    {(combobox) => (
                      <Input
                        id="comparable-construction-type"
                        autoComplete={NO_BROWSER_AUTOFILL}
                        placeholder="Casa habitación, departamento…"
                        {...combobox}
                        value={draft.constructionType}
                        onChange={set("constructionType")}
                      />
                    )}
                  </SuggestInput>
                </Field>
              ) : null}
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={FIELD_IDS.price}>{props.unitLabel}</FieldLabel>
                <FormulaInput
                  id={FIELD_IDS.price}
                  autoComplete={NO_BROWSER_AUTOFILL}
                  grouping
                  value={draft.price}
                  onChange={(event) => { setAnnualRent(null); set("price")(event); }}
                />
              </Field>
              {rent ? (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="comparable-annual-rent">Renta anual</FieldLabel>
                  <Input
                    id="comparable-annual-rent"
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
                  <p className="text-xs text-muted-foreground">Captura la mensual o la anual: la otra se calcula. Se guarda la mensual.</p>
                </Field>
              ) : null}
              {built ? (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.landArea}>Superficie de terreno (m²)</FieldLabel>
                  <Input
                    id={FIELD_IDS.landArea}
                    data-field="landArea"
                    aria-invalid={invalid("landArea")}
                    autoComplete={NO_BROWSER_AUTOFILL}
                    inputMode="decimal"
                    value={draft.landArea}
                    onChange={set("landArea")}
                  />
                </Field>
              ) : null}
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={FIELD_IDS.area}>{AREA_FIELD_LABELS[props.comparableType]}</FieldLabel>
                <FormulaInput id={FIELD_IDS.area} autoComplete={NO_BROWSER_AUTOFILL} grouping value={draft.area} onChange={set("area")} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Valor unitario</FieldLabel>
                <p className="flex h-8 items-center text-sm text-muted-foreground tabular-nums">
                  {area && price ? `${(price / area).toLocaleString("es-MX", { style: "currency", currency: "MXN" })} /m²` : "—"}
                </p>
              </Field>
              {built ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="comparable-bedrooms">Recámaras</FieldLabel>
                    <Input id="comparable-bedrooms" data-field="bedrooms" aria-invalid={invalid("bedrooms")} autoComplete={NO_BROWSER_AUTOFILL} inputMode="numeric" value={draft.bedrooms} onChange={set("bedrooms")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="comparable-bathrooms">Baños</FieldLabel>
                    <Input id="comparable-bathrooms" data-field="bathrooms" aria-invalid={invalid("bathrooms")} autoComplete={NO_BROWSER_AUTOFILL} inputMode="decimal" placeholder="2.5" value={draft.bathrooms} onChange={set("bathrooms")} />
                  </Field>
                  <p className="text-xs text-muted-foreground sm:col-span-6">
                    La superficie de terreno, las recámaras y los baños sirven para buscarlo en la base del despacho; el cálculo y el dictamen no los usan.
                  </p>
                </>
              ) : null}
            </FieldGroup>
            </SheetFormSection>

            <SheetFormSection title="Origen o fuente de información">
              <FieldGroup className="grid gap-3 sm:grid-cols-4">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={FIELD_IDS.source}>Fuente</FieldLabel>
                  <Input id={FIELD_IDS.source} autoComplete={NO_BROWSER_AUTOFILL} placeholder="Inmobiliaria, portal o anuncio" value={draft.sourceName} onChange={set("sourceName")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={FIELD_IDS.contact}>Contacto (anunciante)</FieldLabel>
                  <Input id={FIELD_IDS.contact} autoComplete={NO_BROWSER_AUTOFILL} value={draft.contactName} onChange={set("contactName")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={FIELD_IDS.phone}>Teléfono</FieldLabel>
                  <Input id={FIELD_IDS.phone} autoComplete={NO_BROWSER_AUTOFILL} inputMode="tel" value={draft.contactPhone} onChange={set("contactPhone")} />
                </Field>
                <Field className="sm:col-span-4">
                  <FieldLabel htmlFor={FIELD_IDS.url}>Liga del anuncio</FieldLabel>
                  <div className="flex gap-2">
                    <Input id={FIELD_IDS.url} autoComplete={NO_BROWSER_AUTOFILL} type="url" placeholder="https://" value={draft.url} onChange={set("url")} />
                    {/* «Ver anuncio» right in the form, without going to the card. */}
                    {listingUrl ? (
                      <a className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 shrink-0" })} href={listingUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink data-icon="inline-start" /> Ver anuncio
                      </a>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" disabled title="Escribe la liga completa, con https://">
                        <ExternalLink data-icon="inline-start" /> Ver anuncio
                      </Button>
                    )}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="comparable-consulted">Fecha de consulta</FieldLabel>
                  <Input id="comparable-consulted" type="date" value={draft.consultedOn} onChange={set("consultedOn")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="comparable-date">Fecha de la oferta</FieldLabel>
                  <Input id="comparable-date" type="date" value={draft.offerDate} onChange={set("offerDate")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="comparable-valid">Vigencia (meses)</FieldLabel>
                  <NativeSelect id="comparable-valid" className="w-full" value={draft.validityMonths} onChange={set("validityMonths")}>
                    <NativeSelectOption value="">{draft.validUntil ? "La fecha capturada" : "Sin indicar"}</NativeSelectOption>
                    {COMPARABLE_VALIDITY_MONTHS.map((months) => (
                      <NativeSelectOption key={months} value={String(months)}>{months} {months === 1 ? "mes" : "meses"}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground" data-valid-until>
                    {validUntil ? `Vigente hasta el ${formatDay(validUntil)}, desde la fecha de consulta.` : "Desde la fecha de consulta."}
                  </p>
                </Field>
                {draft.listingText ? (
                  <Field className="sm:col-span-4">
                    <FieldLabel htmlFor="comparable-listing-text">Texto del anuncio pegado (evidencia)</FieldLabel>
                    <Textarea id="comparable-listing-text" rows={3} className="max-h-40 text-xs" value={draft.listingText} onChange={set("listingText")} />
                  </Field>
                ) : null}
              </FieldGroup>
            </SheetFormSection>

            <SheetFormSection title="Terreno y características">
              <FieldGroup className="grid gap-3 sm:grid-cols-4">
                <Field className="sm:col-span-4">
                  <FieldLabel htmlFor="comparable-landUse">Uso de suelo (descripción, columna del dictamen)</FieldLabel>
                  <SuggestInput
                    value={draft.landUse}
                    options={suggestions.characteristics.landUse}
                    label="Usos de suelo de otras fichas del despacho"
                    onPick={(value) => setDraft((current) => ({ ...current, landUse: value }))}
                  >
                    {(combobox) => (
                      <Input id="comparable-landUse" autoComplete={NO_BROWSER_AUTOFILL} {...combobox} value={draft.landUse} onChange={set("landUse")} />
                    )}
                  </SuggestInput>
                </Field>
                {fields.map((field) => {
                  const fieldId = `comparable-${field.key.replace(":", "-")}`;
                  const long = field.key === "notes" || field.key === "services" || !isBuiltinCharacteristic(field.key);
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
                  return (
                    <Field key={field.key} className={long ? "sm:col-span-2" : undefined}>
                      <FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
                      {isSuggestedCharacteristic(field.key) ? (
                        <SuggestInput value={value} options={options} label={`${field.label} de otras fichas del despacho`} onPick={setValue}>
                          {(combobox) => control(combobox)}
                        </SuggestInput>
                      ) : control()}
                    </Field>
                  );
                })}
                <Field className="sm:col-span-4">
                  <FieldLabel htmlFor="comparable-characteristics-text">Texto libre de características (opcional)</FieldLabel>
                  <Textarea
                    id="comparable-characteristics-text"
                    rows={2}
                    placeholder="Si lo escribes, el dictamen lo imprime en lugar de la línea de características."
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            </SheetFormSection>

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
              </div>
            </SheetFormSection>
          </fieldset>

          {/* From the first capture, before saving (videos 7.1 and 7.2): a new comparable keeps them and uploads them once saved. */}
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

          {error ? <p className="text-sm text-destructive" role="alert" data-form-error={error.field}>{error.message}</p> : null}
          <DialogFooter>
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
      </DialogContent>
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
    </Dialog>
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

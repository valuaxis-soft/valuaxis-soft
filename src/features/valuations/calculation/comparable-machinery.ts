/**
 * The data of a machinery and equipment comparable (24 Nov 2026: «en lugar
 * de una ficha de comparables de una casa, va a ser de un equipo de
 * maquinaria, y las características deben de ser de ese equipo»), as the MEH
 * book captures its offers («V. ENF. MERCADO»: Marca, Modelo, Año, Horas,
 * Kilómetros, Aditamentos, Conservación, Tipo de mant., Procedencia, Edo.
 * operativo) plus the serial, the capacity and the freight that puts it on
 * site. Horómetro or odómetro: the appraiser says which the machine has (a
 * backhoe is measured in hours, a car in km).
 *
 * A vehicle (its kind is Automóvil, Camioneta, Camión or Motocicleta) is
 * captured as the firm's automobile book does (25 Nov 2026, «CARACTERÍSTICAS
 * TÉCNICAS» of its «V. ENF. MERCADO»): Marca, Modelo, Año, Conservación,
 * Tipo de mant., Procedencia, Color, Kilómetros, Motor, Puertas, Llanta
 * repuesto, Historial servicios, Reparaciones, Edo. operativo and the
 * Aditamentos of its «RESUMEN DE COMPARABLES»; it is always read in km.
 *
 * Kept in the comparable's property snapshot (`machinery`), beside the real
 * estate fields, which a machinery card does not show. The calculation does
 * not read them: the homologation of machinery is captured in its panel.
 *
 * The class of the comparable comes from the catalog of comparable kinds
 * (comparable-classes.ts, «MAQUINARIA»); until it is merged, a comparable is
 * machinery when it carries these data or the caller says so
 * (`isMachineryComparable`).
 *
 * Pure TypeScript — no React, no database.
 */
import { z } from "zod";

export const METER_KINDS = ["HOROMETRO", "ODOMETRO"] as const;
export type MeterKind = (typeof METER_KINDS)[number];
export const METER_KIND_LABELS: Record<MeterKind, string> = { HOROMETRO: "Horómetro (horas)", ODOMETRO: "Odómetro (km)" };
const METER_UNITS: Record<MeterKind, string> = { HOROMETRO: "horas", ODOMETRO: "km" };

export type ComparableMachineryDetails = {
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  serial?: string | null;
  /** «Capacidad / potencia» as written: «101 HP (75 kW)», «1 m³», «20 t». */
  capacity?: string | null;
  meterKind?: MeterKind | null;
  /** Hours or km, by `meterKind`. */
  meterReading?: number | null;
  /** «Conservación»: Bueno, Excelente, Regular… */
  condition?: string | null;
  /** «Edo. operativo»: Activo, Inactivo. */
  operatingState?: string | null;
  /** «Tipo de mant.»: Preventivo, Correctivo… */
  maintenance?: string | null;
  /** «Aditamentos»: cucharón frontal, rotomartillo… */
  attachments?: string | null;
  /** «Procedencia»: the country it comes from. */
  origin?: string | null;
  /** «Flete / costo de envío» to put it where the subject is, in the offer's currency. */
  freight?: number | null;
  // A vehicle's own, as the automobile book.
  /** «Color». */
  color?: string | null;
  /** «Motor»: its displacement or description, as written. */
  engine?: string | null;
  /** «Puertas». */
  doors?: string | null;
  /** «Llanta repuesto». */
  spareTire?: string | null;
  /** «Historial servicios». */
  serviceHistory?: string | null;
  /** «Reparaciones». */
  repairs?: string | null;
};

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const machineryDetailsSchema = z.object({
  brand: text(120),
  model: text(120),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  serial: text(120),
  capacity: text(120),
  meterKind: z.enum(METER_KINDS).nullable().optional(),
  meterReading: z.number().min(0).max(100_000_000).nullable().optional(),
  condition: text(120),
  operatingState: text(120),
  maintenance: text(120),
  attachments: text(500),
  origin: text(120),
  freight: z.number().min(0).max(1e12).nullable().optional(),
  color: text(120),
  engine: text(120),
  doors: text(120),
  spareTire: text(120),
  serviceHistory: text(120),
  repairs: text(120),
});

/** The stored data without its empty fields; null when there is none (a real estate comparable). */
export function machineryDetailsOf(stored: unknown): ComparableMachineryDetails | null {
  const parsed = machineryDetailsSchema.safeParse(stored);
  if (!parsed.success) return null;
  const kept = Object.entries(parsed.data).filter(([, value]) => value !== null && value !== undefined && value !== "");
  return kept.length ? (Object.fromEntries(kept) as ComparableMachineryDetails) : null;
}

/** Whether a comparable's card is a machine's: it carries machine data, or its class (the valuation, the catalog) says so. */
export const isMachineryComparable = (comparable: { machinery?: ComparableMachineryDetails | null }, classHint?: boolean) =>
  classHint === true || Boolean(comparable.machinery);

const orDash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "—" : typeof value === "number" ? value.toLocaleString("es-MX") : value;

/** «8,498 horas», «2,145 km»: the reading with its unit; without a kind, the number alone. */
export function meterText(details: ComparableMachineryDetails | null | undefined) {
  if (details?.meterReading === null || details?.meterReading === undefined) return "—";
  const reading = details.meterReading.toLocaleString("es-MX", { maximumFractionDigits: 1 });
  return details.meterKind ? `${reading} ${METER_UNITS[details.meterKind]}` : reading;
}

/**
 * The rows of «Datos de la máquina» in the card, in the book's order. The
 * location and the price are the comparable's own (its «Ubicación» and
 * «Oferta»): they are not repeated here.
 */
export function machineryCardRows(details: ComparableMachineryDetails | null | undefined): { label: string; value: string }[] {
  const data = details ?? {};
  return [
    { label: "Marca", value: orDash(data.brand) },
    { label: "Modelo", value: orDash(data.model) },
    { label: "Año", value: data.year ? String(data.year) : "—" },
    { label: "Número de serie", value: orDash(data.serial) },
    { label: "Capacidad / potencia", value: orDash(data.capacity) },
    { label: data.meterKind ? METER_KIND_LABELS[data.meterKind] : "Horómetro u odómetro", value: meterText(data) },
    { label: "Conservación", value: orDash(data.condition) },
    { label: "Estado operativo", value: orDash(data.operatingState) },
    { label: "Mantenimiento", value: orDash(data.maintenance) },
    { label: "Aditamentos", value: orDash(data.attachments) },
    { label: "Procedencia", value: orDash(data.origin) },
    {
      label: "Flete / costo de envío",
      value: data.freight === null || data.freight === undefined ? "—" : data.freight.toLocaleString("es-MX", { style: "currency", currency: "MXN" }),
    },
  ];
}

/**
 * The rows of «Datos del vehículo» in the card: the automobile book's
 * «CARACTERÍSTICAS TÉCNICAS» in its order and with its names, the km read
 * from the odómetro, and the «Aditamentos» of its summary. The location and
 * the price are the comparable's own.
 */
export function vehicleCardRows(details: ComparableMachineryDetails | null | undefined): { label: string; value: string }[] {
  const data = details ?? {};
  return [
    { label: "Marca", value: orDash(data.brand) },
    { label: "Modelo", value: orDash(data.model) },
    { label: "Año", value: data.year ? String(data.year) : "—" },
    { label: "Conservación", value: orDash(data.condition) },
    { label: "Tipo de mant.", value: orDash(data.maintenance) },
    { label: "Procedencia", value: orDash(data.origin) },
    { label: "Color", value: orDash(data.color) },
    { label: "Kilómetros", value: meterText(data.meterReading === null || data.meterReading === undefined ? data : { ...data, meterKind: "ODOMETRO" }) },
    { label: "Motor", value: orDash(data.engine) },
    { label: "Puertas", value: orDash(data.doors) },
    { label: "Llanta repuesto", value: orDash(data.spareTire) },
    { label: "Historial servicios", value: orDash(data.serviceHistory) },
    { label: "Reparaciones", value: orDash(data.repairs) },
    { label: "Edo. operativo", value: orDash(data.operatingState) },
    { label: "Aditamentos", value: orDash(data.attachments) },
  ];
}

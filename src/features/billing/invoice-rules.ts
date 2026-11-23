/**
 * Pure rules of the CFDI 4.0 invoicing of package purchases (docs/COBRO.md,
 * "Facturación CFDI"): the SAT catalogs the fiscal data form offers, the RFC
 * format, the split of what Stripe charged into subtotal and IVA, and the
 * payloads sent to Facturapi. No database and no network.
 */
import { z } from "zod";

/** SAT keys of every invoice. To be confirmed by the client's accountant (docs/COBRO.md). */
export const CFDI_DEFAULTS = {
  /** c_ClaveProdServ 81112106 "Proveedores de servicios de aplicación": software used as a service. */
  productKey: "81112106",
  /** c_ClaveUnidad E48 "Unidad de servicio". */
  unitKey: "E48",
  unitName: "Unidad de servicio",
  /** c_FormaPago 31 "Intermediario pagos": the buyer pays through Stripe, whatever the card. */
  paymentForm: "31",
  /** c_MetodoPago PUE: the purchase is paid in full before the invoice. */
  paymentMethod: "PUE",
} as const;

/** What the SAT requires on each concept of a global invoice (Anexo 20, guía de llenado). */
const GLOBAL_CONCEPT = { productKey: "01010101", unitKey: "ACT", unitName: "Actividad", description: "Venta" } as const;
export const PUBLIC_RFC = "XAXX010101000";
const PUBLIC_LEGAL_NAME = "PUBLICO EN GENERAL";

type PersonType = "FISICA" | "MORAL";

/** c_RegimenFiscal, with the kind of taxpayer each one applies to. */
export const FISCAL_REGIMES: ReadonlyArray<{ key: string; label: string; persons: readonly PersonType[] }> = [
  { key: "601", label: "General de Ley Personas Morales", persons: ["MORAL"] },
  { key: "603", label: "Personas Morales con Fines no Lucrativos", persons: ["MORAL"] },
  { key: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios", persons: ["FISICA"] },
  { key: "606", label: "Arrendamiento", persons: ["FISICA"] },
  { key: "607", label: "Régimen de Enajenación o Adquisición de Bienes", persons: ["FISICA"] },
  { key: "608", label: "Demás ingresos", persons: ["FISICA"] },
  { key: "610", label: "Residentes en el Extranjero sin Establecimiento Permanente en México", persons: ["FISICA", "MORAL"] },
  { key: "611", label: "Ingresos por Dividendos (socios y accionistas)", persons: ["FISICA"] },
  { key: "612", label: "Personas Físicas con Actividades Empresariales y Profesionales", persons: ["FISICA"] },
  { key: "614", label: "Ingresos por intereses", persons: ["FISICA"] },
  { key: "615", label: "Régimen de los ingresos por obtención de premios", persons: ["FISICA"] },
  { key: "616", label: "Sin obligaciones fiscales", persons: ["FISICA"] },
  { key: "620", label: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", persons: ["MORAL"] },
  { key: "621", label: "Incorporación Fiscal", persons: ["FISICA"] },
  { key: "622", label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", persons: ["MORAL"] },
  { key: "623", label: "Opcional para Grupos de Sociedades", persons: ["MORAL"] },
  { key: "624", label: "Coordinados", persons: ["MORAL"] },
  { key: "625", label: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", persons: ["FISICA"] },
  { key: "626", label: "Régimen Simplificado de Confianza", persons: ["FISICA", "MORAL"] },
];

/** Regimes that may deduct an expense (G01, G03): c_UsoCFDI of the SAT. */
const DEDUCTING_REGIMES = ["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"];

/** The c_UsoCFDI keys that make sense for buying software: an expense, or no fiscal effect. */
export const CFDI_USES: ReadonlyArray<{ key: string; label: string; regimes: readonly string[] | "all" }> = [
  { key: "G03", label: "Gastos en general", regimes: DEDUCTING_REGIMES },
  { key: "G01", label: "Adquisición de mercancías", regimes: DEDUCTING_REGIMES },
  { key: "S01", label: "Sin efectos fiscales", regimes: "all" },
];

const RFC_PATTERN = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2})([A\d])$/;

export const normalizeRfc = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();

/** "MORAL" for 12 characters, "FISICA" for 13; null when it is not an RFC. */
export function rfcPersonType(rfc: string): PersonType | null {
  const match = RFC_PATTERN.exec(rfc);
  if (!match) return null;
  // The six digits are the date of birth or incorporation (YYMMDD).
  const [, , yy, mm, dd] = match;
  const month = Number(mm);
  const day = Number(dd);
  const daysInMonth = new Date(Date.UTC(2000 + Number(yy), month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  return rfc.length === 12 ? "MORAL" : "FISICA";
}

/** An RFC for the logs: never in full. */
export const maskRfc = (rfc: string | null | undefined) => (rfc ? `${rfc.slice(0, 3)}…${rfc.slice(-2)}` : "sin RFC");

/**
 * The legal name as the CFDI 4.0 wants it: as written in the Constancia de
 * Situación Fiscal, in capitals and without the corporate regime ("S.A. de
 * C.V."). The firm's letterhead (SRazonSocial) may carry the regime; it is
 * left out here only.
 */
export function legalNameForCfdi(name: string) {
  const regime =
    /[\s,]+(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?EN\s?C\.?(\s?POR\s?A\.?)?|S\.?\s?C\.?|A\.?\s?C\.?|I\.?\s?A\.?\s?P\.?|S\.?\s?C\.?\s?DE\s?R\.?\s?L\.?)(\s?DE\s?C\.?\s?V\.?)?\s*$/;
  const upper = name.trim().replace(/\s+/g, " ").toUpperCase();
  return upper.replace(regime, "").replace(/[\s,]+$/, "").trim() || upper;
}

const trimmed = (max: number, message: string) => z.string().trim().min(1, message).max(max, `Máximo ${max} caracteres.`);

/** «Datos fiscales» of Plan y facturación. All fields go together: an invoice needs every one. */
export const fiscalDataSchema = z
  .object({
    rfc: z.string().transform(normalizeRfc).pipe(z.string().min(1, "Escribe el RFC.")),
    legalName: trimmed(220, "Escribe la razón social o el nombre."),
    taxSystem: z.string().trim(),
    zip: z.string().trim().regex(/^\d{5}$/, "El código postal son 5 dígitos."),
    cfdiUse: z.string().trim(),
    email: z.string().trim().toLowerCase().max(180, "Máximo 180 caracteres.").pipe(z.email("Escribe un correo válido.")),
  })
  .superRefine((value, context) => {
    const person = rfcPersonType(value.rfc);
    if (!person) {
      context.addIssue({ code: "custom", path: ["rfc"], message: "Escribe un RFC válido: 12 caracteres para persona moral o 13 para persona física." });
    } else if (value.rfc === PUBLIC_RFC || value.rfc === "XEXX010101000") {
      context.addIssue({ code: "custom", path: ["rfc"], message: "Escribe el RFC de tu organización, no uno genérico." });
    }
    const regime = FISCAL_REGIMES.find((item) => item.key === value.taxSystem);
    if (!regime) context.addIssue({ code: "custom", path: ["taxSystem"], message: "Elige el régimen fiscal." });
    else if (person && !regime.persons.includes(person)) {
      context.addIssue({
        code: "custom",
        path: ["taxSystem"],
        message: person === "MORAL" ? "Ese régimen es de personas físicas y el RFC es de persona moral." : "Ese régimen es de personas morales y el RFC es de persona física.",
      });
    }
    const use = CFDI_USES.find((item) => item.key === value.cfdiUse);
    if (!use) context.addIssue({ code: "custom", path: ["cfdiUse"], message: "Elige el uso del CFDI." });
    else if (regime && use.regimes !== "all" && !use.regimes.includes(regime.key)) {
      context.addIssue({ code: "custom", path: ["cfdiUse"], message: `El SAT no permite «${use.label}» con el régimen ${regime.key}; elige «Sin efectos fiscales» u otro régimen.` });
    }
  });

export type FiscalData = z.infer<typeof fiscalDataSchema>;

/** The organization's columns, complete enough to invoice to its RFC; null when any is missing or invalid. */
export function completeFiscalData(row: {
  SRFC: string | null;
  SRazonSocial: string | null;
  SRegimenFiscal: string | null;
  SCodigoPostalFiscal: string | null;
  SUsoCfdi: string | null;
  SCorreoFacturacion: string | null;
}): FiscalData | null {
  const parsed = fiscalDataSchema.safeParse({
    rfc: row.SRFC ?? "",
    legalName: row.SRazonSocial ?? "",
    taxSystem: row.SRegimenFiscal ?? "",
    zip: row.SCodigoPostalFiscal ?? "",
    cfdiUse: row.SUsoCfdi ?? "",
    email: row.SCorreoFacturacion ?? "",
  });
  return parsed.success ? parsed.data : null;
}

const fromCents = (cents: number) => cents / 100;

export type CfdiAmounts = {
  subtotal: number;
  tax: number;
  total: number;
  /**
   * True when a subtotal with centavos exists whose IVA, rounded as the SAT
   * does, adds up to exactly what was charged: the concept goes before tax.
   * False (rare) sends the charged total with tax included and lets the
   * provider split it.
   */
  exact: boolean;
};

/**
 * Splits what Stripe charged (centavos, IVA included) into subtotal and IVA
 * so that subtotal + IVA rounded to centavos is exactly that charge. A package
 * of $146.55 + 16 % was charged $170.00: 146.55 + 23.45.
 */
export function cfdiAmounts(totalCents: number, taxPercent: number): CfdiAmounts {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error(`A charge is a whole number of centavos, got ${totalCents}.`);
  const rate = taxPercent / 100;
  const estimate = Math.round(totalCents / (1 + rate));
  for (const subtotalCents of [estimate, estimate - 1, estimate + 1, estimate - 2, estimate + 2]) {
    const taxCents = Math.round(subtotalCents * rate);
    if (subtotalCents >= 0 && subtotalCents + taxCents === totalCents) {
      return { subtotal: fromCents(subtotalCents), tax: fromCents(taxCents), total: fromCents(totalCents), exact: true };
    }
  }
  return { subtotal: fromCents(estimate), tax: fromCents(totalCents - estimate), total: fromCents(totalCents), exact: false };
}

/** A Facturapi item (product inline). */
type InvoiceItem = {
  quantity: number;
  product: {
    description: string;
    product_key: string;
    unit_key: string;
    unit_name: string;
    price: number;
    tax_included: boolean;
    taxability: "02";
    taxes: Array<{ type: "IVA"; rate: number }>;
    sku?: string;
  };
};

/** The body of POST /v2/invoices, as far as Valuaxis uses it. */
export type CfdiInvoicePayload = {
  type: "I";
  customer: {
    legal_name: string;
    tax_id: string;
    tax_system: string;
    email?: string;
    address?: { zip: string };
  };
  items: InvoiceItem[];
  use: string;
  payment_form: string;
  payment_method: string;
  currency: "MXN";
  external_id: string;
  idempotency_key: string;
  global?: { periodicity: "month"; months: string; year: number };
};

function item(input: { description: string; productKey: string; unitKey: string; unitName: string; amounts: CfdiAmounts; taxPercent: number; sku?: string }): InvoiceItem {
  return {
    quantity: 1,
    product: {
      description: input.description,
      product_key: input.productKey,
      unit_key: input.unitKey,
      unit_name: input.unitName,
      // Before tax when the split is exact; otherwise the charged total, tax included.
      price: input.amounts.exact ? input.amounts.subtotal : input.amounts.total,
      tax_included: !input.amounts.exact,
      taxability: "02",
      taxes: input.taxPercent > 0 ? [{ type: "IVA", rate: input.taxPercent / 100 }] : [],
      ...(input.sku ? { sku: input.sku } : {}),
    },
  };
}

/** Facturapi's idempotency_key and external_id are at most 100 characters. */
const key = (value: string) => value.slice(0, 100);

/** The CFDI of one package purchase, to the organization's RFC. */
export function buildIndividualInvoice(input: {
  fiscal: FiscalData;
  /** The Checkout Session id: it names the invoice in Facturapi and makes the request idempotent. */
  paymentReference: string;
  description: string;
  totalCents: number;
  taxPercent: number;
  productKey: string;
  unitKey: string;
}): { payload: CfdiInvoicePayload; amounts: CfdiAmounts } {
  const amounts = cfdiAmounts(input.totalCents, input.taxPercent);
  return {
    amounts,
    payload: {
      type: "I",
      customer: {
        legal_name: legalNameForCfdi(input.fiscal.legalName),
        tax_id: input.fiscal.rfc,
        tax_system: input.fiscal.taxSystem,
        email: input.fiscal.email,
        address: { zip: input.fiscal.zip },
      },
      items: [
        item({
          description: input.description,
          productKey: input.productKey,
          unitKey: input.unitKey,
          unitName: CFDI_DEFAULTS.unitName,
          amounts,
          taxPercent: input.taxPercent,
        }),
      ],
      use: input.fiscal.cfdiUse,
      payment_form: CFDI_DEFAULTS.paymentForm,
      payment_method: CFDI_DEFAULTS.paymentMethod,
      currency: "MXN",
      external_id: key(input.paymentReference),
      idempotency_key: key(`valuaxis-${input.paymentReference}`),
    },
  };
}

/** "2026-11" → the month's bounds in Mexico City (UTC-6 all year since 2022) and its SAT fields. */
export function globalPeriod(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error(`The month is written as YYYY-MM, got "${month}".`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  return {
    year,
    months: match[2],
    start: new Date(`${month}-01T00:00:00-06:00`),
    end: new Date(`${next}-01T00:00:00-06:00`),
  };
}

/**
 * The monthly global invoice (público en general) of the payments that were
 * not invoiced to an RFC: one concept per payment, as the SAT asks (key
 * 01010101, unit ACT, "Venta", the payment as its identification number).
 */
export function buildGlobalInvoice(input: {
  month: string;
  /** Which global invoice of that month this is (1 the first), for the idempotency key. */
  sequence: number;
  payments: Array<{ reference: string; totalCents: number; taxPercent: number }>;
}): { payload: CfdiInvoicePayload; amounts: CfdiAmounts[] } {
  if (input.payments.length === 0) throw new Error("A global invoice needs at least one payment.");
  const period = globalPeriod(input.month);
  const amounts = input.payments.map((payment) => cfdiAmounts(payment.totalCents, payment.taxPercent));
  const name = `valuaxis-global-${input.month}-${input.sequence}`;
  return {
    amounts,
    payload: {
      type: "I",
      // Generic RFC: no zip, Facturapi puts the issuer's, as the SAT asks.
      customer: { legal_name: PUBLIC_LEGAL_NAME, tax_id: PUBLIC_RFC, tax_system: "616" },
      items: input.payments.map((payment, index) =>
        item({
          description: GLOBAL_CONCEPT.description,
          productKey: GLOBAL_CONCEPT.productKey,
          unitKey: GLOBAL_CONCEPT.unitKey,
          unitName: GLOBAL_CONCEPT.unitName,
          amounts: amounts[index],
          taxPercent: payment.taxPercent,
          sku: payment.reference.slice(0, 100),
        }),
      ),
      use: "S01",
      payment_form: CFDI_DEFAULTS.paymentForm,
      payment_method: CFDI_DEFAULTS.paymentMethod,
      currency: "MXN",
      global: { periodicity: "month", months: period.months, year: period.year },
      external_id: key(name),
      idempotency_key: key(name),
    },
  };
}

/** Keys of the SEstado column of CfdiPago. */
export const CFDI_STATES = { pending: "PENDIENTE", issued: "EMITIDA", failed: "FALLIDA" } as const;
export type CfdiState = (typeof CFDI_STATES)[keyof typeof CFDI_STATES];

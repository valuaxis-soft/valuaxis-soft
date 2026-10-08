/**
 * Figures read from free text, always in code: amounts, surfaces, lengths
 * and dates as Mexican listings write them, and the numbers a paragraph
 * mentions. The model only copies fragments; what they are worth is decided here.
 */
import { normalizeNumberText } from "@/features/valuations/calculation/comparable-import";

/** Lowercase, without accents, "m²" as "m2" and single spaces: how two texts are compared. */
export function plainText(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether the fragment is literally in the text, ignoring case, accents and spacing. */
export function appearsIn(text: string, fragment: string) {
  const needle = plainText(fragment);
  return needle.length > 0 && plainText(text).includes(needle);
}

/** "1 200 000", "2,350,000.50" or "2.35", with spaces only between groups of three. */
const NUMBER = String.raw`\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d[\d.,]*`;

/** The first number of the text and what follows it. */
function firstNumber(text: string): { value: number; rest: string; before: string } | null {
  const match = new RegExp(NUMBER).exec(text);
  if (!match) return null;
  const normalized = normalizeNumberText(match[0].replace(/ /g, "").replace(/[.,]+$/, ""));
  const value = normalized === null ? Number.NaN : Number(normalized);
  if (!Number.isFinite(value)) return null;
  return { value, rest: text.slice(match.index + match[0].length), before: text.slice(0, match.index) };
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export type ListingCurrency = "MXN" | "USD";

/**
 * "$2,350,000", "2.35 mdp", "850 mil pesos", "USD 150,000". The currency is
 * null when the text shows only "$". A bare small number ("precio 1") is not
 * an amount: it needs a money sign, a currency, a magnitude word or four digits.
 */
export function parseAmount(fragment: string): { amount: number; currency: ListingCurrency | null } | null {
  const text = plainText(fragment);
  const number = firstNumber(text);
  if (!number || number.value <= 0) return null;
  const magnitude = /^ ?(mdp|millones|millon|mill\b|mm\b)/.test(number.rest) ? 1_000_000 : /^ ?(mil\b|k\b)/.test(number.rest) ? 1_000 : 1;
  const amount = round(number.value * magnitude);
  const currency: ListingCurrency | null = /usd|us\$|dolar|dlls?\b|dls\b/.test(text)
    ? "USD"
    : /mxn|pesos|\bm\.?n\b|mdp|moneda nacional/.test(text) ? "MXN" : null;
  const looksLikeMoney = text.includes("$") || currency !== null || magnitude > 1 || amount >= 1000;
  return looksLikeMoney ? { amount, currency } : null;
}

/**
 * Whether an amount is a price per unit of surface ("2.35 mdp por hectárea",
 * "$1,500 el m2") and not the price of the offer: read from the fragment and
 * from what the text says right after it.
 */
export function amountPerUnit(text: string, fragment: string): SurfaceUnit | null {
  const plain = plainText(text);
  const needle = plainText(fragment);
  const at = plain.indexOf(needle);
  const context = at < 0 ? needle : plain.slice(at, at + needle.length + 30);
  const unit = /(?:por|x|\/|cada|el|la) ?(hectarea|has?\b|m2|mts?2|mt2|metro)/.exec(context)?.[1];
  if (!unit) return null;
  return unit.startsWith("h") ? "ha" : "m2";
}

export type SurfaceUnit = "m2" | "ha";

/**
 * "1 200 m2", "350 metros cuadrados", "3.5 hectáreas" or the agrarian
 * "12-50-00 has" (hectares-ares-centiares). The unit must be written: the
 * value stays in it, and `squareMeters` is the same surface for the form.
 */
export function parseSurface(fragment: string): { value: number; unit: SurfaceUnit; squareMeters: number } | null {
  const text = plainText(fragment);
  const agrarian = /(\d+)-(\d{2})-(\d{2}(?:\.\d+)?) ?(?:ha|has|hectareas?)\b/.exec(text);
  if (agrarian) {
    const value = round(Number(agrarian[1]) + Number(agrarian[2]) / 100 + Number(agrarian[3]) / 10_000, 6);
    return value > 0 ? { value, unit: "ha", squareMeters: round(value * 10_000) } : null;
  }
  const number = firstNumber(text);
  if (!number || number.value <= 0) return null;
  if (/^ ?(ha|has|hectareas?)\b/.test(number.rest)) return { value: number.value, unit: "ha", squareMeters: round(number.value * 10_000) };
  if (/^ ?(m2|mts?2|mt2|m 2\b|mts? cuadrados|metros cuadrados|metros2)/.test(number.rest)) return { value: number.value, unit: "m2", squareMeters: number.value };
  return null;
}

/** "10 m de frente", "25 mts", "12.5 metros" or a bare "10": meters. Other units are not read. */
export function parseMeters(fragment: string): number | null {
  const number = firstNumber(plainText(fragment));
  if (!number || number.value <= 0) return null;
  const unit = /^ ?([a-z]+\d?)/.exec(number.rest)?.[1];
  if (unit && /^(cm|mm|km|ft|pies?|in|pulgadas?|ha|has|hectareas?|m2|mts?2|mt2)$/.test(unit)) return null;
  return number.value;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-03-15", "15/03/2026" or "15 de marzo de 2026" → "2026-03-15". Relative dates ("hace 3 días") are not read. */
export function parseListingDate(fragment: string): string | null {
  const text = plainText(fragment);
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const numeric = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text);
  const written = new RegExp(String.raw`(\d{1,2})(?: de)? (${MONTHS.join("|")}|setiembre)(?: del?)? (\d{4})`).exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : numeric
      ? [Number(numeric[3]), Number(numeric[2]), Number(numeric[1])]
      : written
        ? [Number(written[3]), written[2] === "setiembre" ? 9 : MONTHS.indexOf(written[2]) + 1, Number(written[1])]
        : [0, 0, 0];
  if (!year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** The first http(s) link of the text, without the punctuation that closes a sentence. */
export function firstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"')\]]+/i.exec(text);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : null;
}

const NUMBER_WORDS: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, mil: 1000,
};

/**
 * Every number a text mentions, by value: "1,200.50" and "1200.5" are the
 * same. The digit of a unit ("m2", "m³") is not a number. Numbers written
 * with letters count too, from "dos" on ("un" and "una" are articles).
 */
export function numbersIn(value: string): number[] {
  const text = plainText(value).replace(/\b(mm|cm|km|mts?|m|ft)[23]\b/g, "$1");
  const found: number[] = [];
  // Without the groups separated by spaces: in prose "2 120" is two numbers.
  for (const match of text.matchAll(/\d[\d.,]*/g)) {
    const token = match[0].replace(/[.,]+$/, "");
    const normalized = normalizeNumberText(token);
    if (normalized !== null && Number.isFinite(Number(normalized))) {
      found.push(Number(normalized));
      continue;
    }
    // "15.03.2026" or "3-50-00" read as one token: each part is a number on its own.
    for (const part of token.split(/[.,]/)) if (part) found.push(Number(part));
  }
  for (const word of text.split(/[^a-z]+/)) if (word in NUMBER_WORDS) found.push(NUMBER_WORDS[word]);
  return found;
}

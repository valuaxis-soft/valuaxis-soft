/**
 * Amount in words for the dictamen, in the books' format:
 * "( OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M. N.)".
 * Corrected version: the books write "TREINTA Y TRÉS" and always "00/100".
 */
import { excelRound } from "./rounding";

const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TWENTIES = ["VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

/** 0–999 in words; `apocope` shortens a final "UNO" before a noun (UN MIL, VEINTIÚN PESOS). */
function belowThousand(value: number, apocope: boolean): string {
  if (value === 100) return "CIEN";
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 30) {
    const unit = rest % 10;
    parts.push(unit ? `${TENS[Math.floor(rest / 10)]} Y ${UNITS[unit]}` : TENS[Math.floor(rest / 10)]);
  } else if (rest >= 20) {
    parts.push(TWENTIES[rest - 20]);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest) {
    parts.push(UNITS[rest]);
  }
  const words = parts.join(" ");
  if (!apocope) return words;
  return words.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");
}

/** 0–999,999 in words. */
function belowMillion(value: number, apocope: boolean): string {
  const thousands = Math.floor(value / 1000);
  const rest = value % 1000;
  const parts: string[] = [];
  if (thousands === 1) parts.push("MIL");
  else if (thousands) parts.push(`${belowThousand(thousands, true)} MIL`);
  if (rest) parts.push(belowThousand(rest, apocope));
  return parts.join(" ");
}

/** Whole pesos in words, up to 999,999,999,999 (novecientos noventa y nueve mil millones). */
export function integerInWords(value: number): string {
  if (value === 0) return "CERO";
  const millions = Math.floor(value / 1_000_000);
  const rest = value % 1_000_000;
  const parts: string[] = [];
  if (millions === 1) parts.push("UN MILLÓN");
  else if (millions) parts.push(`${belowMillion(millions, true)} MILLONES`);
  if (rest) parts.push(belowMillion(rest, true));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const rounded = excelRound(amount, 2);
  const pesos = Math.floor(rounded);
  const cents = Math.round((rounded - pesos) * 100);
  const words = integerInWords(pesos);
  // "UN MILLÓN DE PESOS", "DOS MILLONES DE PESOS": a round million takes "DE".
  const preposition = pesos >= 1_000_000 && pesos % 1_000_000 === 0 ? " DE" : "";
  const currency = pesos === 1 ? "PESO" : "PESOS";
  return `( ${words}${preposition} ${currency} ${String(cents).padStart(2, "0")}/100 M. N.)`;
}

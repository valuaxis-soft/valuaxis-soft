import { parseDecimal } from "@/features/valuations/calculation/free-formula";

/** Every number is edited as text so "0." or "14,361" survive while typing. */
export type Texts<T> = { [K in keyof T]: T[K] extends number | null ? string : T[K] };

const toText = (value: number | null) => (value === null ? "" : String(value));

export function textsOf<T extends object>(row: T): Texts<T> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" || value === null ? toText(value as number | null) : value])) as Texts<T>;
}

export function numbersOf<T extends object>(row: Texts<T>, template: T): T {
  return Object.fromEntries(Object.entries(template).map(([key, value]) => {
    const text = (row as Record<string, unknown>)[key];
    if (typeof value === "number" || value === null) {
      const parsed = parseDecimal(String(text ?? ""));
      // Factors default to 1 and fractions to their template value when left empty.
      return [key, parsed ?? (typeof value === "number" ? value : null)];
    }
    return [key, text];
  })) as T;
}

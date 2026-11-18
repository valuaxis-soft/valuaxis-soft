import { parseDecimal } from "./free-formula";
import {
  MAX_CHARACTERISTIC_FIELDS,
  cleanAttributes,
  isBuiltinCharacteristic,
  isNumericCharacteristic,
  withCharacteristic,
  type BuiltinCharacteristic,
  type CharacteristicField,
  type CharacteristicKind,
  type ComparableDto,
} from "./market-types";

type Shared = Pick<ComparableDto, BuiltinCharacteristic | "attributes" | "extra" | "formulas">;

const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-MX");
const AREA_NAME = /^(sup\b|sup\.|superficie)|\b(m2|m²|area)\b/;
const AREA_UNIT = /\s*(m2|m²|mts2?|metros cuadrados)\.?$/i;

/**
 * What an added characteristic is, read from its name and its value: a
 * figure under a name of an area ("Sup. común", "Superficie de
 * amenidades") is an area; another figure, a number ("Cajones: 2"); the
 * rest, a text.
 */
export function characteristicKindOf(name: string, value: string): { kind: CharacteristicKind | undefined; value: string } {
  const plain = value.replace(AREA_UNIT, "").trim();
  const figure = !plain.startsWith("=") && parseDecimal(plain) !== null;
  if (!figure) return { kind: undefined, value: value.trim() };
  const area = AREA_NAME.test(normalized(name)) || AREA_UNIT.test(value);
  return { kind: area ? "area" : "number", value: plain };
}

/**
 * The characteristics added in a comparable's card, inside a valuation, made
 * characteristics of its market (V7.2-10, -18): each name not yet in the
 * list becomes a field of the list (it shows in every card of the market and
 * in the table 2.1, and prints), and its value is the comparable's value of
 * that field. A name the list has already takes the value. With the list
 * full, the rest stay in the card as they were.
 */
export function sharedCharacteristics<T extends Shared>(
  fields: ReadonlyArray<CharacteristicField>,
  comparable: T,
  newKey: (index: number) => string,
): { fields: CharacteristicField[]; comparable: T; added: CharacteristicField[] } {
  const list = [...fields];
  const added: CharacteristicField[] = [];
  const kept: NonNullable<ComparableDto["attributes"]> = [];
  let next = comparable;
  for (const attribute of comparable.attributes ?? []) {
    let field = list.find((item) => normalized(item.label) === normalized(attribute.name));
    const read = characteristicKindOf(attribute.name, attribute.value);
    if (!field) {
      if (list.length >= MAX_CHARACTERISTIC_FIELDS) {
        kept.push(attribute);
        continue;
      }
      field = { key: newKey(added.length), label: attribute.name.trim(), ...(read.kind ? { kind: read.kind } : {}) };
      list.push(field);
      added.push(field);
    }
    const numeric = isNumericCharacteristic(field);
    const text = numeric ? read.value : attribute.value.trim();
    next = withCharacteristic(next, field.key, text, numeric ? parseDecimal(text) : null);
  }
  return { fields: list, comparable: { ...next, attributes: kept }, added };
}

/**
 * The attributes a comparable keeps in the firm's base, to filter it in
 * Comparables: those the card did not share, and every characteristic the
 * appraiser added to the market with the value of this comparable. They
 * follow what is captured in the market (a value changed in the table 2.1
 * changes the attribute too).
 */
export function mirroredAttributes(fields: ReadonlyArray<CharacteristicField>, comparable: Pick<ComparableDto, "attributes" | "extra">) {
  const added = fields.filter((field) => !isBuiltinCharacteristic(field.key));
  const named = new Set(added.map((field) => normalized(field.label)));
  const own = (comparable.attributes ?? []).filter((attribute) => !named.has(normalized(attribute.name)));
  const shared = added
    .map((field) => ({ name: field.label, value: comparable.extra?.[field.key] ?? "" }))
    .filter((attribute) => attribute.value.trim());
  return cleanAttributes([...own, ...shared]);
}

/** What the card shows under «Características agregadas» inside a valuation: only what is not a characteristic of the market yet. */
export function unsharedAttributes(fields: ReadonlyArray<CharacteristicField>, attributes: ComparableDto["attributes"]) {
  const named = new Set(fields.map((field) => normalized(field.label)));
  return (attributes ?? []).filter((attribute) => !named.has(normalized(attribute.name)));
}

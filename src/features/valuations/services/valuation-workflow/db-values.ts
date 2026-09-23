import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export const DOCUMENT_ROW_KEY_MAX_LENGTH = 120;
export const DOCUMENT_COLUMN_KEY_MAX_LENGTH = 120;
export const DOCUMENT_COLUMN_NAME_MAX_LENGTH = 180;
export const DOCUMENT_TABLE_NAME_MAX_LENGTH = 180;
export const DOCUMENT_DESCRIPTION_MAX_LENGTH = 1000;
export const DOCUMENT_NODE_KEY_MAX_LENGTH = 140;
export const DOCUMENT_NODE_TITLE_MAX_LENGTH = 250;

export function normalizeDbKey(value: string | null | undefined, fallback: string, maxLength: number) {
  const fallbackSlug = slugDbKey(fallback) || "item";
  const slug = slugDbKey(value ?? "") || fallbackSlug;

  if (slug.length <= maxLength) return slug;

  const hash = createHash("sha256").update(value ?? fallback).digest("hex").slice(0, 12);
  if (maxLength <= hash.length + 1) return hash.slice(0, maxLength);

  return `${slug.slice(0, maxLength - hash.length - 1).replace(/[_-]+$/g, "")}_${hash}`;
}

export function limitDbText<T extends string | null | undefined>(value: T, maxLength: number): T {
  if (typeof value !== "string") return value;
  return Array.from(value).slice(0, maxLength).join("") as T;
}

export function slugDbKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .toLowerCase();
}

/**
 * Maps a captured value to its storage column. Text is stored exactly as typed:
 * converting "7,000.00" to a number or "2026-01-01" to a timestamp loses the
 * format the appraiser wrote, and that text is what the report prints.
 */
export function valueColumns(value: unknown) {
  const empty = emptyValueColumns();
  if (typeof value === "string") {
    return value.trim() ? { ...empty, SValorTexto: value } : empty;
  }

  if (typeof value === "number") {
    return {
      ...empty,
      NValorNumerico: new Prisma.Decimal(value),
    };
  }

  if (typeof value === "boolean") {
    return {
      ...empty,
      BValorBooleano: value,
    };
  }

  if (isComplexValue(value)) {
    return {
      ...empty,
      JValorComplejo: toPrismaJsonValue(value),
    };
  }

  return empty;
}

export function emptyValueColumns() {
  return {
    SValorTexto: null,
    NValorNumerico: null,
    BValorBooleano: null,
    DValorFecha: null,
    JValorComplejo: Prisma.DbNull,
  };
}

export function valueKind(value: unknown) {
  if (typeof value === "number" || parseNumeric(value)) return { dataTypeKey: "DECIMAL" };
  if (typeof value === "boolean") return { dataTypeKey: "BOOLEANO" };
  if (isDateString(value)) return { dataTypeKey: "FECHA" };
  if (isComplexValue(value)) return { dataTypeKey: "JSON" };
  return { dataTypeKey: "TEXTO_LARGO" };
}

function parseNumeric(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/[,$\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

function isDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function isComplexValue(value: unknown) {
  return value !== null && typeof value === "object";
}

function toPrismaJsonValue(value: unknown) {
  if (value === null || value === Prisma.JsonNull || value === Prisma.DbNull) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export function hasCapturableValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function nodeDescription(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as { description?: unknown }).description;
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

export function clientIdFromConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as { id?: unknown }).id;
  return typeof value === "string" ? value : null;
}

export function occupiedValueColumns(data: ReturnType<typeof valueColumns>) {
  return [
    data.SValorTexto !== null ? "SValorTexto" : null,
    data.NValorNumerico !== null ? "NValorNumerico" : null,
    data.BValorBooleano !== null ? "BValorBooleano" : null,
    data.DValorFecha !== null ? "DValorFecha" : null,
    data.JValorComplejo !== Prisma.JsonNull && data.JValorComplejo !== Prisma.DbNull && data.JValorComplejo !== null
      ? "JValorComplejo"
      : null,
  ].filter(Boolean);
}

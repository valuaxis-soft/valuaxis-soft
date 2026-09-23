import type { PrismaClient } from "@prisma/client";
import type { ConceptType, ConceptValueFormat } from "@/features/valuations/model";

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type SectionPayload = {
  id?: string;
  label?: string;
  title?: string;
  enabled?: boolean;
  required?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  blocks?: BlockPayload[];
};

export type BlockPayload = {
  id?: string;
  label?: string;
  title?: string;
  enabled?: boolean;
  required?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  concepts?: ConceptPayload[];
  subBlocks?: ApartadoPayload[];
  tables?: TablePayload[];
  images?: ImagePayload[];
};

export type ConceptPayload = {
  id?: string;
  label?: string;
  value?: unknown;
  enabled?: boolean;
  type?: ConceptType;
  labelKey?: string;
  valueKey?: string;
  layoutSpan?: "full" | "half";
  rowId?: string;
  spacingBefore?: number;
  spacingAfter?: number;
  valueFormat?: ConceptValueFormat;
  customUnit?: string;
};

export type ApartadoPayload = {
  id?: string;
  title?: string;
  enabled?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  concepts?: ConceptPayload[];
  tables?: TablePayload[];
  images?: ImagePayload[];
};

/** A table as sent by the editor: TableV2 (current) or the legacy string grid. */
export type TablePayload = {
  id?: string;
  title?: string;
  version?: number;
  columns?: unknown[];
  columnKeys?: string[];
  rows?: unknown[];
  boundaryDistanceFormats?: Array<{ valueFormat?: ConceptValueFormat; customUnit?: string }>;
  enabled?: boolean;
  schema?: unknown;
};

export type ImagePayload = {
  id?: string;
  title?: string;
  src?: string;
  enabled?: boolean;
  layoutWidth?: "normal" | "wide" | "full";
  layoutWidthPercent?: number;
};

export type CaratulaPayload = {
  numeroAvaluo?: string | null;
  folio?: string | null;
  solicitante?: string | null;
  propietario?: string | null;
  objeto?: string | null;
  proposito?: string | null;
  valuador?: string | null;
  registroValuador?: string | null;
  valorTotal?: string | number | null;
  valorConLetra?: string | null;
  fechaAvaluo?: string | null;
  fechaVigencia?: string | null;
};

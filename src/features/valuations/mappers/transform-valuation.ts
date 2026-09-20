import type {
  AppSection,
  Block,
  Concept,
  ImageContent,
  Apartado,
  TableContent,
  Comparable,
  ValuationMeta,
} from "@/features/valuations/model";

type DbSection = {
  id: string;
  label: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
  blocks: DbBlock[];
};

type DbBlock = {
  id: string;
  label: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
  concepts: DbConcept[];
  subBlocks: DbApartado[];
  tables: DbTable[];
  images: DbImage[];
};

type DbConcept = {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
};

type DbApartado = {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
  concepts: DbConcept[];
  tables: DbTable[];
  images: DbImage[];
};

type DbTable = {
  id: string;
  title: string;
  columns: string;
  rows: string;
  enabled: boolean;
};

type DbImage = {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
};

type DbComparable = {
  id: string;
  title: string;
  source: string;
  status: string;
  operation: string;
  propertyKind: string;
  postalCode: string;
  price: string;
  area: string;
  pricePerMeter: string;
  distance: string;
  link: string;
  imageUrl: string | null;
  selected: boolean;
  location: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  antiquity: string | null;
};

export function transformSections(dbSections: DbSection[]): AppSection[] {
  return dbSections.map((s) => ({
    id: s.id,
    label: s.label,
    title: s.title,
    sourceFile: `${s.title}.pdf`,
    enabled: s.enabled ?? true,
    required: s.label === "I" || s.label === "II",
    blocks: transformBlocks(s.id, s.blocks),
  }));
}

function transformBlocks(sectionId: string, dbBlocks: DbBlock[]): Block[] {
  return dbBlocks.map((b) => ({
    id: b.id,
    title: b.title,
    sectionLabel: b.label,
    enabled: b.enabled ?? true,
    required: false,
    concepts: transformConcepts(b.concepts),
    apartados: transformApartados(b.subBlocks),
    tables: transformTables(b.tables),
    images: transformImages(b.images),
  }));
}

function transformApartados(dbSubBlocks: DbApartado[]): Apartado[] {
  return dbSubBlocks.map((sb) => ({
    id: sb.id,
    title: sb.title,
    enabled: sb.enabled ?? true,
    concepts: transformConcepts(sb.concepts),
    tables: transformTables(sb.tables),
    images: transformImages(sb.images),
  }));
}

function transformConcepts(dbConcepts: DbConcept[]): Concept[] {
  return dbConcepts.map((c) => ({
    id: c.id,
    label: c.label,
    value: c.value,
    enabled: c.enabled ?? true,
  }));
}

function transformTables(dbTables: DbTable[]): TableContent[] {
  return dbTables.map((t) => ({
    id: t.id,
    title: t.title,
    columns: JSON.parse(t.columns || "[]"),
    rows: JSON.parse(t.rows || "[[]]"),
    enabled: t.enabled ?? true,
  }));
}

function transformImages(dbImages: DbImage[]): ImageContent[] {
  return dbImages.map((img) => ({
    id: img.id,
    title: img.title,
    src: img.url,
    enabled: img.enabled ?? true,
  }));
}

export function transformComparables(dbComparables: DbComparable[]): Comparable[] {
  return dbComparables.map((c) => ({
    id: c.id,
    title: c.title,
    source: c.source,
    status: c.status as Comparable["status"],
    operation: c.operation as Comparable["operation"],
    propertyKind: c.propertyKind as Comparable["propertyKind"],
    postalCode: c.postalCode,
    price: c.price,
    area: c.area,
    pricePerMeter: c.pricePerMeter,
    distance: c.distance,
    link: c.link,
    selected: c.selected,
  }));
}

export function valuationMetaFromDb(v: {
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
}): ValuationMeta {
  return {
    folio: v.folio,
    client: v.client,
    location: v.location,
    postalCode: v.postalCode,
    valuationKind: v.valuationKind as ValuationMeta["valuationKind"],
    propertyKind: v.propertyKind as ValuationMeta["propertyKind"],
  };
}

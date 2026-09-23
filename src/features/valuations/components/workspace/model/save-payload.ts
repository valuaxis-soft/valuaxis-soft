import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { AppSection } from "@/features/valuations/model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import { serializeTableForSave } from "@/features/valuations/services/table-persistence";
import { imageSourceForSave } from "@/features/valuations/services/image-source";
import {
  blockMetadataFromContent,
  conceptMetadataFromContent,
  imageMetadataFromContent,
  sectionMetadataFromContent,
  apartadoMetadataFromContent,
} from "@/features/valuations/metadata";

/** Serializes the editor sections into the `sections` body of the full save. */
export function buildSectionsPayload(sectionsForSave: AppSection[]) {
  return sectionsForSave.map((s) => ({
    id: s.id,
    label: s.label,
    title: s.title,
    ...sectionMetadataFromContent({ enabled: s.enabled, flowSpacingBeforePx: s.flowSpacingBeforePx }),
    sortOrder: sectionsForSave.indexOf(s),
    blocks: s.blocks.map((b, bi) => ({
      id: b.id,
      label: b.sectionLabel,
      title: b.title,
      ...blockMetadataFromContent(b),
      sortOrder: bi,
      concepts: b.concepts.map((c) => ({
        id: c.id,
        label: c.label,
        value: c.value,
        ...conceptMetadataFromContent({ ...c, enabled: true }),
        rowId: c.rowId,
      })),
      subBlocks: b.apartados.map((sb, sbi) => ({
        id: sb.id,
        title: sb.title,
        ...apartadoMetadataFromContent({ ...sb, enabled: true }),
        sortOrder: sbi,
        concepts: sb.concepts.map((c) => ({
          id: c.id,
          label: c.label,
          value: c.value,
          ...conceptMetadataFromContent({ ...c, enabled: true }),
          rowId: c.rowId,
        })),
        tables: sb.tables.map((t) => serializeTableForSave({ ...t, enabled: true })),
        images: sb.images.map((img) => ({
          id: img.id,
          title: img.title,
          src: imageSourceForSave(s.id, img),
          ...imageMetadataFromContent(img),
        })),
      })),
      tables: b.tables.map((t) => serializeTableForSave({ ...t, enabled: true })),
      images: (s.id === "caratula" && b.id === COMPANY_HEADER_BLOCK_ID ? [] : b.images).map((img) => ({
        id: img.id,
        title: img.title,
        src: imageSourceForSave(s.id, img),
        ...imageMetadataFromContent({ ...img, enabled: true }),
      })),
    })),
  }));
}

/** Valuation metadata sent both to the update and to the full save. */
export function valuationMetaPayload(meta: ValuationMeta) {
  return {
    folio: meta.folio,
    client: meta.client,
    location: meta.location,
    postalCode: meta.postalCode,
    valuationKind: meta.valuationKind,
    propertyKind: meta.propertyKind,
  };
}

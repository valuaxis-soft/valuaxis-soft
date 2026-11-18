import type { Block, Apartado } from "../model";
import { resolveBlockFlowV2 } from "./block-flow";
import { titlePrints } from "./block-title";

type VisibleItem = {
  id: string;
  enabled?: boolean;
};

/** An apartado as its number sees it: one whose title does not print takes no number. */
type NumberedApartado = VisibleItem & { title?: string; titleHidden?: boolean };

export function getVisibleOrdinal(items: VisibleItem[], targetId: string) {
  let ordinal = 0;

  for (const item of items) {
    if (item.enabled === false) {
      if (item.id === targetId) return null;
      continue;
    }

    ordinal += 1;
    if (item.id === targetId) return ordinal;
  }

  return null;
}

export function formatVisibleChildLabel(parentLabel: string, items: VisibleItem[], targetId: string) {
  const ordinal = getVisibleOrdinal(items, targetId);
  const normalizedParentLabel = parentLabel.replace(/\.+$/, "").trim();

  if (!ordinal || !normalizedParentLabel) return "";

  return `${normalizedParentLabel}.${ordinal}`;
}

/** The number an apartado prints ("III.2"); none inside an annex. */
export function apartadoDisplayLabel(block: Pick<Block, "annex" | "sectionLabel">, items: NumberedApartado[], targetId: string) {
  if (block.annex) return "";
  const numbered = items.map((item) => (item.title !== undefined && !titlePrints({ title: item.title, titleHidden: item.titleHidden }) ? { ...item, enabled: false } : item));
  return formatVisibleChildLabel(block.sectionLabel, numbered, targetId);
}

/**
 * Derive the visual order of Apartados from the Block's resolved BlockFlow V2.
 *
 * When BlockFlow is present, apartados are ordered by their position in the
 * V2 structural rows (content rows are skipped). Within a paired row,
 * the left Apartado comes before the right Apartado.
 *
 * When absent, falls back to block.apartados.
 *
 * Content rows do NOT receive Apartado numbering — only apartado items count.
 */
export function getBlockFlowApartadoOrder(block: Block): Apartado[] {
  const flowV2 = resolveBlockFlowV2(block);
  if (!flowV2) return block.apartados;

  const subBlockById = new Map(block.apartados.map((sb) => [sb.id, sb]));
  const ordered: Apartado[] = [];

  for (const structuralRow of flowV2.rows) {
    for (const item of structuralRow.items) {
      if (item.type === "apartado") {
        const sb = subBlockById.get(item.apartadoId);
        if (sb) ordered.push(sb);
      }
    }
  }

  // Append any live apartados not in flow (should not happen after normalization,
  // but defensive)
  for (const sb of block.apartados) {
    if (!ordered.some((o) => o.id === sb.id)) {
      ordered.push(sb);
    }
  }

  return ordered;
}

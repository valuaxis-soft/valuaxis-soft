/**
 * Every node of a section's document tree (blocks, apartados, concepts,
 * images) is stored under its key, unique within the section. Two items with
 * the same id share one node: the second takes it over, so the first one's
 * content disappears when the valuation is opened again, and an item whose id
 * is the same as its parent's makes the node its own parent, which the
 * database refuses («No se pudo guardar el avalúo», V5.7-20). That happened
 * with the croquis images, whose ids are fixed («croquis-…»), once their block
 * was moved or copied. Before the section is written, every repeated id after
 * the first gets one of its own; the layouts that point to it follow.
 * Pure: the same payload always gets the same ids, so saving twice is stable.
 */
import { DOCUMENT_NODE_KEY_MAX_LENGTH, normalizeDbKey } from "./db-values";
import type { ApartadoPayload, BlockPayload, ConceptPayload, ImagePayload, SectionPayload } from "./types";

export type RenamedNodeKey = { kind: "block" | "subBlock" | "concept" | "image"; from: string; to: string };

const nodeKey = (id: string) => normalizeDbKey(id, id, DOCUMENT_NODE_KEY_MAX_LENGTH);

type LayoutRef = { type?: unknown; id?: unknown; apartadoId?: unknown };

/** The layout (contentLayout or blockFlow) with the references of renamed items pointing to their new ids. */
function relink(value: unknown, renames: ReadonlyMap<string, string>): unknown {
  if (!renames.size || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => relink(item, renames));
  const record = value as Record<string, unknown> & LayoutRef;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) next[key] = relink(item, renames);
  if (typeof record.type === "string") {
    const kindKey = `${record.type}:`;
    if (typeof record.id === "string" && renames.has(kindKey + record.id)) next.id = renames.get(kindKey + record.id);
    if (record.type === "apartado" && typeof record.apartadoId === "string" && renames.has(`apartado:${record.apartadoId}`)) {
      next.apartadoId = renames.get(`apartado:${record.apartadoId}`);
    }
  }
  return next;
}

/** The section with a key of its own for every node, and what was renamed (to leave a trace in the server's log). */
export function withUniqueNodeKeys(section: SectionPayload): { section: SectionPayload; renamed: RenamedNodeKey[] } {
  const claimed = new Set<string>();
  const renamed: RenamedNodeKey[] = [];

  /** The id, or a new one when its key is taken: "croquis-mapa-comparables" → "croquis-mapa-comparables-2". */
  const claim = (id: string | undefined, kind: RenamedNodeKey["kind"]): string | undefined => {
    if (!id) return id;
    if (!claimed.has(nodeKey(id))) {
      claimed.add(nodeKey(id));
      return id;
    }
    let copy = 2;
    while (claimed.has(nodeKey(`${id}-${copy}`))) copy += 1;
    const next = `${id}-${copy}`;
    claimed.add(nodeKey(next));
    renamed.push({ kind, from: id, to: next });
    return next;
  };

  /** Concepts and images of a container, renamed where needed; `renames` collects "type:old" → new for its layout. */
  const items = <T extends ConceptPayload | ImagePayload>(list: T[] | undefined, kind: "concept" | "image", renames: Map<string, string>) =>
    list?.map((item) => {
      const id = claim(item.id, kind);
      if (id === item.id) return item;
      renames.set(`${kind}:${item.id}`, id!);
      return { ...item, id };
    });

  const blocks = section.blocks?.map((block): BlockPayload => {
    const renames = new Map<string, string>();
    const id = claim(block.id, "block");
    const concepts = items(block.concepts, "concept", renames);
    const images = items(block.images, "image", renames);
    const subBlocks = block.subBlocks?.map((subBlock): ApartadoPayload => {
      const own = new Map<string, string>();
      const subBlockId = claim(subBlock.id, "subBlock");
      if (subBlockId !== subBlock.id) renames.set(`apartado:${subBlock.id}`, subBlockId!);
      const next: ApartadoPayload = {
        ...subBlock,
        id: subBlockId,
        concepts: items(subBlock.concepts, "concept", own),
        images: items(subBlock.images, "image", own),
      };
      return own.size ? (relink(next, own) as ApartadoPayload) : next;
    });
    const next: BlockPayload = { ...block, id, concepts, images, subBlocks };
    if (!renames.size) return next;
    // Only the block's own layouts point to its items; the apartados keep theirs (already relinked).
    const { subBlocks: nested, ...rest } = next;
    return { ...(relink(rest, renames) as BlockPayload), subBlocks: nested };
  });

  return { section: blocks ? { ...section, blocks } : section, renamed };
}

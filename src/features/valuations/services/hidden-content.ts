import type { Apartado, Block } from "../model";

type Entry = { enabled?: boolean };

const allHidden = (entries: Entry[]) => entries.length > 0 && entries.every((entry) => entry.enabled === false);

/** Everything the apartado holds is hidden: it prints nothing, not even its title. An empty one still prints its title. */
export function apartadoContentHidden(apartado: Pick<Apartado, "concepts" | "images" | "tables">): boolean {
  return allHidden([...apartado.concepts, ...apartado.images, ...apartado.tables]);
}

/**
 * Everything the block holds is hidden (its concepts, tables and images, and
 * every apartado, hidden itself or with all its content hidden): it prints
 * nothing, not even its title, and takes no number. A block with no content
 * at all still prints its title, as a heading.
 */
export function blockContentHidden(block: Pick<Block, "concepts" | "images" | "tables" | "apartados">): boolean {
  const direct = [...block.concepts, ...block.images, ...block.tables];
  if (direct.length + block.apartados.length === 0) return false;
  return direct.every((entry) => entry.enabled === false)
    && block.apartados.every((apartado) => apartado.enabled === false || apartadoContentHidden(apartado));
}

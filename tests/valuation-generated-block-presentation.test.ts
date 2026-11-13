/**
 * The blocks the calculation writes keep what the appraiser chose in their
 * toolbar when the calculation writes them again (verification of videos 6.x,
 * DOC-03): the pages lying on their side, the page break and hidden.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { figureColumn, generatedBlock, generatedTable } from "../src/features/valuations/calculation/generated-content";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import type { AppSection, Block } from "../src/features/valuations/model";
import { resolvePageBreak, resolvePageOrientation } from "../src/features/valuations/services/document-structure";

const block = (value: string): Block => generatedBlock("motor-costos-terreno", "TERRENO", {
  tables: [generatedTable("motor-costos-terreno-tabla", "Terreno", [figureColumn("VALOR")], [[value]])],
});
const section = (blocks: Block[]): AppSection => ({ id: "costos", label: "IX", title: "COSTOS", sourceFile: "", enabled: true, required: false, blocks });
const owns = (item: Block) => item.id.startsWith("motor-costos");

test("a generated block set to landscape, with its page break, stays so when the calculation writes new figures", () => {
  const chosen = section([{ ...block("100"), pageOrientation: "landscape", pageBreak: "new-page" }]);
  const next = replaceGeneratedBlocks(chosen, owns, [block("200")]);
  assert.notEqual(next, chosen, "the figures changed");
  const [written] = next.blocks;
  assert.equal(resolvePageOrientation(written), "landscape");
  assert.equal(resolvePageBreak(written), "new-page");
  assert.equal(written.enabled, true);

  const hidden = replaceGeneratedBlocks(section([{ ...block("100"), enabled: false }]), owns, [block("300")]);
  assert.equal(hidden.blocks[0].enabled, false, "hidden stays hidden, as before");

  // A block nobody touched prints upright, with the automatic break.
  const plain = replaceGeneratedBlocks(section([block("100")]), owns, [block("400")]).blocks[0];
  assert.equal(resolvePageOrientation(plain), "portrait");
  assert.equal(plain.pageOrientation, undefined);
});

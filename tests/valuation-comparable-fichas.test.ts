/**
 * Video 8.14 (27 nov 2026), «Croquis y fotografías de comparables»: the
 * fichas print 2 or 3 a row at the size chosen, in the order the appraiser
 * leaves them, and a ficha whose main photo changes keeps its place; the
 * choice is saved with the block. The panel offers it all, undoable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { marketPhotoBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { blockMetadataFromContent, hydrateBlockMetadata } from "../src/features/valuations/metadata";
import { readPhotoGrid, type AppSection, type Block } from "../src/features/valuations/model";
import { fichasInOrder, isComparableFichasBlock, movedTo, pairedPhotoRows, photoGridBlock, withFichasOrder } from "../src/features/valuations/services/photo-layout";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";

function comparable(reference: number, photos: string[], main?: string): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Calle Inventada ${reference}`, area: 150 + reference, price: 1_000_000 + reference,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Portal de prueba", contactName: null, contactPhone: null, url: null, offerDate: null,
    photos: photos.map((id) => ({ id, title: id, url: `/api/archivos/imagen?key=${id}`, ...(id === main ? { main: true } : {}) })),
    factors: [],
  };
}
const calculation = (comparables: ComparableDto[]): MarketCalculationDto => ({ settings: defaultMarketSettings("TERRENO_VENTA"), comparables, locked: false });
const annex = (blocks: Block[]): AppSection => ({ id: "croquisComparables", label: "", title: "CROQUIS", sourceFile: "", enabled: true, required: false, blocks });

const five = calculation([1, 2, 3, 4, 5].map((n) => comparable(n, [`f${n}a`, `f${n}b`])));

test("the fichas print 3 a row when chosen, the last row short but with the width of the full ones, at the chosen size", () => {
  const [block] = marketPhotoBlocks(five);
  assert.ok(isComparableFichasBlock(block));
  const byId = new Map(block.images.map((image) => [image.id, image]));
  assert.deepEqual(pairedPhotoRows(resolveContentLayout(block), byId).map((row) => row.columns.length), [2, 2, 1], "two a row by default");
  assert.deepEqual(pairedPhotoRows(resolveContentLayout(block), byId, 3).map((row) => row.columns.length), [3, 2]);
  const printed = photoGridBlock({ ...block, photoGrid: { perRow: 3, size: 70 } });
  assert.deepEqual(printed.contentLayout?.rows.map((row) => row.columns.length), [3, 2]);
  assert.ok(printed.images.every((image) => image.layoutWidthPercent === 70));
  assert.ok(photoGridBlock(block).images.every((image) => image.layoutWidthPercent === undefined), "full size by default");
  // The renderer gives the short last row the columns of the full ones.
  assert.match(readFileSync("src/features/valuations/components/document-block-renderer.tsx", "utf8"), /const shownColumns = shortPhotoRow \? photoGrid : columnCount;/);
  assert.match(readFileSync("src/features/valuations/components/report-preview.tsx", "utf8"), /inPhotoGrid\(print\(photoGridBlock\(block\)\), photoGridOf\(block\)\.perRow\)/);
});

test("the order the appraiser gives the fichas is the order they print, and it survives the calculation writing them again", () => {
  const [block] = marketPhotoBlocks(five);
  const ids = block.images.map((image) => image.id);
  assert.deepEqual(movedTo(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(movedTo(["a", "b", "c"], 0, 5), ["a", "b", "c"], "out of range: nothing moves");
  const reordered = withFichasOrder(block, movedTo(ids, 4, 0));
  assert.deepEqual(fichasInOrder(reordered).map((image) => image.id), [ids[4], ids[0], ids[1], ids[2], ids[3]]);
  const placed = annex([{ ...reordered, photoGrid: { perRow: 3, size: 85 } }]);
  // The calculation writes the fichas again (a price changed): the order and the grid stay.
  const changed = calculation(five.comparables.map((item) => (item.reference === 2 ? { ...item, price: 2_222_222 } : item)));
  const rewritten = withGeneratedBlocks(placed, "TERRENO_VENTA", marketPhotoBlocks(changed), { kind: "fotos", position: "end" });
  assert.deepEqual(fichasInOrder(rewritten.blocks[0]).map((image) => image.id), [ids[4], ids[0], ids[1], ids[2], ids[3]]);
  assert.deepEqual(rewritten.blocks[0].photoGrid, { perRow: 3, size: 85 });
  // Comparable 1 takes its second photo as main: its ficha changes and keeps its place (second).
  const otherMain = calculation(five.comparables.map((item) => (item.reference === 1 ? comparable(1, ["f1a", "f1b"], "f1b") : item)));
  const remained = withGeneratedBlocks(placed, "TERRENO_VENTA", marketPhotoBlocks(otherMain), { kind: "fotos", position: "end" });
  const order = fichasInOrder(remained.blocks[0]).map((image) => image.id);
  assert.match(order[1], /ficha-c-1--f1b$/);
  assert.equal(order[0], ids[4]);
  assert.equal(remained.blocks[0].images.find((image) => image.id === order[1])?.src, "/api/archivos/imagen?key=f1b");
});

test("the grid is saved with the block and read back; anything else is not taken", () => {
  assert.deepEqual(readPhotoGrid({ perRow: 3, size: 70 }), { perRow: 3, size: 70 });
  assert.deepEqual(readPhotoGrid({ perRow: 2, size: 20 }), { perRow: 2, size: 50 }, "clamped");
  assert.equal(readPhotoGrid({ perRow: 4 }), undefined);
  const metadata = blockMetadataFromContent({ enabled: true, photoGrid: { perRow: 3, size: 85 } });
  assert.deepEqual(metadata.photoGrid, { perRow: 3, size: 85 });
  assert.deepEqual(hydrateBlockMetadata(JSON.parse(JSON.stringify(metadata))).photoGrid, { perRow: 3, size: 85 });
  assert.equal(hydrateBlockMetadata({ photoGrid: { perRow: 9 } }).photoGrid, undefined);
});

test("the panel orders by dragging and with ↑ ↓, chooses 2 or 3 a row and the size, each change undoable; the card chooses the main photo", () => {
  const panel = readFileSync("src/features/valuations/components/workspace/comparable-fichas-panel.tsx", "utf8");
  assert.match(panel, /draggable=\{!readOnly\}/);
  assert.match(panel, /onDrop=/);
  assert.match(panel, /aria-label=\{`Subir la ficha/);
  assert.match(panel, /3 fichas/);
  assert.match(panel, /label: "Deshacer", onClick: onUndo/);
  const workspace = readFileSync("src/features/valuations/components/workspace/valuation-workspace.tsx", "utf8");
  assert.match(workspace, /<ComparableFichasPanel/);
  const dialog = readFileSync("src/features/valuations/components/calculation/comparable-dialog.tsx", "utf8");
  assert.match(dialog, /Foto principal anterior/);
  assert.match(dialog, /Foto principal siguiente/);
  assert.match(readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8"), /api\.market\.setMainPhoto/);
});

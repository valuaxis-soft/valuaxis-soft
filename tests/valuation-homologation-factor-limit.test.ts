/**
 * FAL-12 of the audit of week 8: the homologation took up to six factors and
 * the appraiser's Excel uses seven and the FRe. It takes eight now, and the
 * table with all of them still prints within an upright page.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import {
  FACTOR_TYPE_LABELS,
  MAX_FACTOR_SLOTS,
  defaultMarketSettings,
  toMarketEngineInput,
  type ComparableDto,
  type FactorType,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import { PORTRAIT_CONTENT_WIDTH_PX, planTablePrintFit, printFitColumns } from "../src/features/valuations/services/table-print-fit";

const TYPES: FactorType[] = ["NEGOCIACION", "UBICACION", "SUPERFICIE", "ZONA", "FRENTE", "USO_SUELO", "FORMA", "TOPOGRAFIA"];
const slots = TYPES.map((type) => ({ type, label: FACTOR_TYPE_LABELS[type] }));

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: TYPES.filter((type) => type !== "SUPERFICIE").map((type, index) => ({ type, value: 0.95 + index / 100, subjectRating: null, comparableRating: null, justification: null })),
  };
}

test("eight factors are accepted, a ninth is not", () => {
  const settings = { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 205, adoptedUnitValue: 28_900 };
  assert.equal(MAX_FACTOR_SLOTS, 8);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, factorSlots: slots }).success, true);
  const ninth = marketSettingsSchema.safeParse({ ...settings, factorSlots: [...slots, { type: "OTRO", label: "Otro" }] });
  assert.equal(ninth.success, false);
});

test("the homologation with eight factors and the FRe prints within an upright page", () => {
  const calculation: MarketCalculationDto = {
    settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 205, adoptedUnitValue: 28_900, factorSlots: slots },
    comparables: [comparable(1, 260.77, 7_300_000), comparable(2, 198.4, 5_950_000), comparable(3, 315.2, 8_400_000), comparable(4, 222, 6_480_000), comparable(5, 240.5, 6_900_000)],
    locked: false,
  };
  const input = toMarketEngineInput(calculation);
  assert.ok(input.ok);
  const [block] = marketDocumentBlocks(calculation, computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG));
  const table = ensureTableV2(block.apartados.find((apartado) => apartado.tables.some((item) => item.title === "Homologación"))!.tables[0]);
  assert.equal(table.columns.length, 4 + 8 + 2, "REF, price, area, unit value, the eight factors, FRe and homologated value");
  const fit = planTablePrintFit(printFitColumns(table, new Map()), PORTRAIT_CONTENT_WIDTH_PX);
  assert.ok(fit.kind === "natural" || fit.fits, JSON.stringify(fit));
});

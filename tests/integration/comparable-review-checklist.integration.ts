/**
 * Despacho → Revisión de comparables against the local database: the firm's
 * checklist and thresholds are saved without a migration, the review reads
 * them (the built area warns past the firm's percentage), a review keeps the
 * names its checks had, reviews saved before keep reading, and another firm
 * keeps the built-in list.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getValuationReview } from "../../src/features/valuations/calculation/comparable-card.service";
import { DEFAULT_REVIEW_CHECKLIST } from "../../src/features/valuations/calculation/comparable-review-checklist";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { comparableReviewSchema } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, saveComparableReview, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import {
  REVIEW_CHECKLIST_FIELD_KEY,
  getComparableReviewSettings,
  saveComparableReviewSettings,
} from "../../src/features/firm/comparable-review-settings.service";
import { comparableReviewSettingsSchema } from "../../src/features/firm/firm-schemas";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const comparable = (location: string, area: number, price: number): ComparableInputPayload => ({
  location, area, price, factors: [],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: "Inmuebles24", contactName: "Ana López", contactPhone: "348 123 4567", url: null, offerDate: "2026-10-01",
});

test("the firm's checklist and thresholds are kept, the review uses them, and a saved review keeps the names of its checks", async () => {
  const owner = await createValuationFixture();
  const stranger = await createValuationFixture();
  await saveMarketSettings(owner.publicId, owner.user, {
    comparableType: "INMUEBLE_VENTA", subjectArea: 100, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable("Juárez 12, Arandas", 130, 2_600_000));

  // Before: the built-in list, ±20 %, and 130 m² against 100 m² warns.
  const before = await getComparableReviewSettings(owner.organizationId);
  assert.deepEqual(before.checks.map((check) => check.key), DEFAULT_REVIEW_CHECKLIST.checks.map((check) => check.key));
  assert.equal(before.builtAreaTolerancePercent, 20);
  assert.equal(before.customized, false);
  const [row] = await getValuationReview(owner.publicId, owner.organizationId);
  assert.ok(row.warnings.some((warning) => warning.key === "BUILT_AREA"));
  // A review saved with the built-in list, before the firm changed it.
  const old = await saveComparableReview(owner.publicId, owner.user, row.comparable.id, { status: "VERIFICADO", checks: { contact: true, price: true }, notes: null });
  assert.equal(old.labels?.contact, "Contacto del anunciante");

  // The administrator renames, removes, adds a required point, reorders and sets ±35 % and 9 months.
  const input = comparableReviewSettingsSchema.parse({
    checklist: {
      checks: [
        { key: "price", label: "El precio coincide con el anuncio", required: true },
        { key: "custom-uso", label: "El uso de suelo coincide", required: true },
        { key: "photo", label: "La foto coincide con el anuncio", required: false },
        { key: "builtArea", label: "Superficie construida", required: false },
        { key: "link", label: "El enlace sigue vigente", required: false, hint: "desmárcalo si el anuncio ya caducó" },
      ],
      builtAreaTolerancePercent: 35,
    },
    validityMonths: 9,
  });
  const saved = await saveComparableReviewSettings(owner.user, input);
  assert.deepEqual(saved.checks.map((check) => check.key), ["price", "custom-uso", "photo", "builtArea", "link"]);
  assert.equal(saved.builtAreaTolerancePercent, 35);
  assert.equal(saved.validityMonths, 9);
  assert.equal(saved.customized, true);
  // Without a migration: one custom field of the firm keeps it, and the comparables' months are the column it had.
  const field = await prisma.campoPersonalizado.findFirstOrThrow({ where: { IdOrganizacion: owner.organizationId, SClave: REVIEW_CHECKLIST_FIELD_KEY } });
  assert.equal((field.JConfiguracion as { builtAreaTolerancePercent: number }).builtAreaTolerancePercent, 35);
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: owner.organizationId } });
  assert.equal(organization.IMesesVigenciaComparables, 9);

  // The review reads the firm's percentage: 30 % no longer warns.
  const [after35] = await getValuationReview(owner.publicId, owner.organizationId);
  assert.equal(after35.warnings.some((warning) => warning.key === "BUILT_AREA"), false);
  // The review saved before keeps reading, with the name its check had then.
  assert.deepEqual(after35.comparable.review?.checks, { contact: true, price: true });
  assert.equal(after35.comparable.review?.labels?.contact, "Contacto del anunciante");

  // A check the firm added is accepted and saved with its name.
  const payload = comparableReviewSchema.parse({ status: "VERIFICADO", checks: { "custom-uso": true, price: false }, notes: null });
  const review = await saveComparableReview(owner.publicId, owner.user, row.comparable.id, payload);
  assert.deepEqual(review.checks, { "custom-uso": true, price: false });
  assert.deepEqual(review.labels, { "custom-uso": "El uso de suelo coincide", price: "El precio coincide con el anuncio" });
  assert.throws(() => comparableReviewSchema.parse({ status: "VERIFICADO", checks: { "no válida": true }, notes: null }));

  // Another firm keeps the built-in list.
  assert.equal((await getComparableReviewSettings(stranger.organizationId)).customized, false);

  // «Restablecer la de Valuaxis»: back to the built-in list and ±20 %; the months stay as chosen.
  const reset = await saveComparableReviewSettings(owner.user, { checklist: null, validityMonths: 9 });
  assert.equal(reset.customized, false);
  assert.equal(reset.builtAreaTolerancePercent, 20);
  assert.equal(reset.validityMonths, 9);
  const [after20] = await getValuationReview(owner.publicId, owner.organizationId);
  assert.ok(after20.warnings.some((warning) => warning.key === "BUILT_AREA"));
  // Saving again after a reset creates the field again (the old one stays deleted).
  await saveComparableReviewSettings(owner.user, input);
  assert.equal(await prisma.campoPersonalizado.count({ where: { IdOrganizacion: owner.organizationId, SClave: REVIEW_CHECKLIST_FIELD_KEY, DFechaEliminacion: null } }), 1);
});

import { describe, it } from "node:test";
import { expect } from "./support/expect";
import {
  resolveConceptLabelGuide,
  resolveCellConceptGuide,
  clampGuidePx,
  DEFAULT_GUIDE_PX,
  MAX_OFFSET_PX,
  type ConceptPresentation,
} from "../src/features/valuations/services/concept-presentation";

describe("resolveConceptLabelGuide", () => {
  it("returns default for undefined", () => {
    expect(resolveConceptLabelGuide(undefined)).toBe(DEFAULT_GUIDE_PX);
  });

  it("returns default for empty object", () => {
    expect(resolveConceptLabelGuide({})).toBe(DEFAULT_GUIDE_PX);
  });

  it("returns default when custom with offset 0", () => {
    expect(resolveConceptLabelGuide({ mode: "custom", labelGuideOffsetPx: 0 })).toBe(DEFAULT_GUIDE_PX);
  });

  it("returns default + offset for custom", () => {
    expect(resolveConceptLabelGuide({ mode: "custom", labelGuideOffsetPx: 10 })).toBe(DEFAULT_GUIDE_PX + 10);
  });

  it("returns default when custom but no offset", () => {
    expect(resolveConceptLabelGuide({ mode: "custom" })).toBe(DEFAULT_GUIDE_PX);
  });

  it("clamps offset below minimum to 0", () => {
    expect(resolveConceptLabelGuide({ mode: "custom", labelGuideOffsetPx: -10 })).toBe(DEFAULT_GUIDE_PX);
  });

  it("clamps offset above maximum", () => {
    expect(resolveConceptLabelGuide({ mode: "custom", labelGuideOffsetPx: 200 })).toBe(DEFAULT_GUIDE_PX + MAX_OFFSET_PX);
  });

  it("rounds offset to nearest integer", () => {
    expect(resolveConceptLabelGuide({ mode: "custom", labelGuideOffsetPx: 10.7 })).toBe(DEFAULT_GUIDE_PX + 11);
  });

  it("converts legacy absolute px to offset", () => {
    // 180px absolute → offset = 180 - 120 = 60
    const result = resolveConceptLabelGuide({ labelGuidePx: 180 } as Parameters<typeof resolveConceptLabelGuide>[0]);
    expect(result).toBe(DEFAULT_GUIDE_PX + 60);
  });

  it("converts legacy compact preset to offset", () => {
    // compact = 36% of 690 = 248px → offset = 248 - 120 = 128
    const result = resolveConceptLabelGuide({ labelGuidePreset: "compact" } as Parameters<typeof resolveConceptLabelGuide>[0]);
    expect(result).toBe(DEFAULT_GUIDE_PX + 128);
  });

  it("converts legacy custom percent to offset", () => {
    // 35% of 690 = 241.5 → rounds to 242 → offset = 242 - 120 = 122
    const result = resolveConceptLabelGuide({ labelGuidePreset: "custom", labelGuidePercent: 35 } as Parameters<typeof resolveConceptLabelGuide>[0]);
    expect(result).toBeGreaterThanOrEqual(DEFAULT_GUIDE_PX + 121);
    expect(result).toBeLessThanOrEqual(DEFAULT_GUIDE_PX + 122);
  });
});

describe("resolveCellConceptGuide", () => {
  const custom10: ConceptPresentation = { mode: "custom", labelGuideOffsetPx: 10 };
  const custom50: ConceptPresentation = { mode: "custom", labelGuideOffsetPx: 50 };

  it("cell custom wins over container", () => {
    expect(resolveCellConceptGuide(custom10, custom50)).toBe(DEFAULT_GUIDE_PX + 10);
  });

  it("missing cell inherits container", () => {
    expect(resolveCellConceptGuide(undefined, custom50)).toBe(DEFAULT_GUIDE_PX + 50);
  });

  it("missing cell and missing container returns default", () => {
    expect(resolveCellConceptGuide(undefined, undefined)).toBe(DEFAULT_GUIDE_PX);
  });

  it("cell with mode=custom but no offset inherits container", () => {
    expect(resolveCellConceptGuide({ mode: "custom" }, custom50)).toBe(DEFAULT_GUIDE_PX + 50);
  });

  it("cell without mode inherits container", () => {
    expect(resolveCellConceptGuide({}, custom50)).toBe(DEFAULT_GUIDE_PX + 50);
  });
});

describe("clampGuidePx", () => {
  it("clamps below default", () => {
    expect(clampGuidePx(100, 400)).toBe(DEFAULT_GUIDE_PX);
  });

  it("clamps above cell width minus min value width", () => {
    expect(clampGuidePx(350, 400)).toBe(320); // 400 - 80 = 320
  });

  it("passes through valid values", () => {
    expect(clampGuidePx(150, 400)).toBe(150);
  });
});

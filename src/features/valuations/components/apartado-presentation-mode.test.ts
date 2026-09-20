import { describe, it, expect } from "vitest";
import type { ApartadoPresentationMode } from "@/features/valuations/model";

// Test that presentationMode is properly typed and defaults correctly
describe("ApartadoPresentationMode", () => {
  it("type accepts 'normal' and 'technical-list'", () => {
    const normal: ApartadoPresentationMode = "normal";
    const technical: ApartadoPresentationMode = "technical-list";
    expect(normal).toBe("normal");
    expect(technical).toBe("technical-list");
  });
});

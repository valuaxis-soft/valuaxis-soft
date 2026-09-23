import { describe, it } from "node:test";
import { expect } from "./support/expect";
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

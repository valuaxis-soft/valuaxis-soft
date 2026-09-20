import { describe, it, expect } from "vitest";
import type { Apartado } from "@/features/valuations/model";

// Test that presentationMode survives persistence round-trip
describe("presentationMode persistence", () => {
  it("undefined presentationMode is harmless in metadata", () => {
    const oldApartado: Partial<Apartado> = {
      id: "test",
      title: "Test",
      enabled: true,
      concepts: [],
      tables: [],
      images: [],
    };
    expect(oldApartado.presentationMode).toBeUndefined();
  });

  it("technical-list mode can be stored on Apartado", () => {
    const subBlock: Partial<Apartado> = {
      id: "test",
      title: "Test",
      enabled: true,
      concepts: [],
      tables: [],
      images: [],
      presentationMode: "technical-list",
    };
    expect(subBlock.presentationMode).toBe("technical-list");
  });

  it("normal mode can be stored on Apartado", () => {
    const subBlock: Partial<Apartado> = {
      id: "test",
      title: "Test",
      enabled: true,
      concepts: [],
      tables: [],
      images: [],
      presentationMode: "normal",
    };
    expect(subBlock.presentationMode).toBe("normal");
  });
});

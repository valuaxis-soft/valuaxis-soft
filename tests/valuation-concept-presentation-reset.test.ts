import { describe, it } from "node:test";
import { expect } from "./support/expect";
import { clearConceptCellPresentations } from "../src/features/valuations/services/concept-presentation";
import type { ContentLayout } from "@/features/valuations/model";

describe("clearConceptCellPresentations", () => {
  it("clears presentation from Concept cells only", () => {
    const conceptIds = new Set(["c1", "c2"]);
    const layout: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            { id: "col-1", items: [{ type: "concept", id: "c1" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 10 } },
            { id: "col-2", items: [{ type: "concept", id: "c2" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 20 } },
          ],
        },
      ],
    };

    const result = clearConceptCellPresentations(layout, conceptIds);
    expect(result.rows[0].columns[0].conceptPresentation).toBeUndefined();
    expect(result.rows[0].columns[1].conceptPresentation).toBeUndefined();
  });

  it("preserves Image/Table column presentation", () => {
    const conceptIds = new Set(["c1"]);
    const layout: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            { id: "col-1", items: [{ type: "concept", id: "c1" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 10 } },
            { id: "col-2", items: [{ type: "image", id: "img1" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 30 } },
          ],
        },
      ],
    };

    const result = clearConceptCellPresentations(layout, conceptIds);
    expect(result.rows[0].columns[0].conceptPresentation).toBeUndefined();
    expect(result.rows[0].columns[1].conceptPresentation).toEqual({ mode: "custom", labelGuideOffsetPx: 30 });
  });

  it("preserves row/column IDs and items", () => {
    const conceptIds = new Set(["c1"]);
    const layout: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            { id: "col-1", items: [{ type: "concept", id: "c1" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 10 } },
          ],
        },
      ],
    };

    const result = clearConceptCellPresentations(layout, conceptIds);
    expect(result.rows[0].id).toBe("row-1");
    expect(result.rows[0].columns[0].id).toBe("col-1");
    expect(result.rows[0].columns[0].items).toEqual([{ type: "concept", id: "c1" }]);
  });

  it("does not mutate input", () => {
    const conceptIds = new Set(["c1"]);
    const layout: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            { id: "col-1", items: [{ type: "concept", id: "c1" }], conceptPresentation: { mode: "custom", labelGuideOffsetPx: 10 } },
          ],
        },
      ],
    };

    clearConceptCellPresentations(layout, conceptIds);
    expect(layout.rows[0].columns[0].conceptPresentation).toEqual({ mode: "custom", labelGuideOffsetPx: 10 });
  });

  it("skips columns without presentation", () => {
    const conceptIds = new Set(["c1"]);
    const layout: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            { id: "col-1", items: [{ type: "concept", id: "c1" }] },
          ],
        },
      ],
    };

    const result = clearConceptCellPresentations(layout, conceptIds);
    expect(result.rows[0].columns[0].conceptPresentation).toBeUndefined();
  });
});

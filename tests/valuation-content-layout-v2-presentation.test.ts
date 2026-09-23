import { describe, it } from "node:test";
import { expect } from "./support/expect";
import { normalizeContentLayout } from "../src/features/valuations/services/content-layout";
import type { ContentLayout } from "@/features/valuations/model";

describe("normalizeContentLayout preserves conceptPresentation", () => {
  it("preserves cell conceptPresentation through normalization", () => {
    const input: ContentLayout = {
      version: 2,
      rows: [
        {
          id: "row-1",
          columns: [
            {
              id: "col-1",
              items: [{ type: "concept", id: "c1" }],
              conceptPresentation: { mode: "custom", labelGuideOffsetPx: 10 },
            },
            {
              id: "col-2",
              items: [{ type: "concept", id: "c2" }],
              conceptPresentation: { mode: "custom", labelGuideOffsetPx: 35 },
            },
          ],
        },
      ],
    };

    const result = normalizeContentLayout(input);
    const col1 = result.rows[0].columns[0];
    const col2 = result.rows[0].columns[1];

    expect(col1.conceptPresentation).toEqual({ mode: "custom", labelGuideOffsetPx: 10 });
    expect(col2.conceptPresentation).toEqual({ mode: "custom", labelGuideOffsetPx: 35 });
  });

  it("columns without conceptPresentation remain without it", () => {
    const input: ContentLayout = {
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

    const result = normalizeContentLayout(input);
    expect(result.rows[0].columns[0].conceptPresentation).toBeUndefined();
  });
});

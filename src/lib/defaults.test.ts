import { describe, expect, it } from "vitest";
import { createEmptyStorage, mergeStorage } from "./defaults";

describe("storage defaults", () => {
  it("preserves custom website links when merging stored data", () => {
    const merged = mergeStorage(createEmptyStorage(), {
      websiteLinks: {
        ai: [
          {
            name: "Custom AI",
            url: "https://example.com",
            note: "自定义入口"
          }
        ]
      }
    });

    expect(merged.websiteLinks?.ai?.[0]).toMatchObject({
      name: "Custom AI",
      url: "https://example.com",
      note: "自定义入口"
    });
  });
});

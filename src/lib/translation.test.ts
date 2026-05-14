import { describe, expect, it, vi } from "vitest";
import { translateRepoDescriptions, translationInternals } from "./translation";
import type { RepoItem } from "./types";

function repo(description: string): RepoItem {
  return {
    fullName: "owner/name",
    url: "https://github.com/owner/name",
    description,
    stars: 1,
    growth: 0,
    language: "TypeScript",
    topics: [],
    source: "search",
    fetchedAt: "2026-05-14T00:00:00.000Z"
  };
}

describe("translation helpers", () => {
  it("detects English descriptions that need translation", () => {
    expect(translationInternals.shouldTranslateDescription("A useful developer tool.")).toBe(true);
    expect(translationInternals.shouldTranslateDescription("一个有用的开发工具。")).toBe(false);
    expect(
      translationInternals.shouldTranslateDescription(
        "This will remove {{ repoNameWithOwner }} from the {{ listsWithCount }}."
      )
    ).toBe(false);
    expect(translationInternals.shouldTranslateDescription("")).toBe(false);
  });

  it("reads text from the translate response shape", () => {
    expect(
      translationInternals.readTranslatedText([
        [
          ["一个", "A"],
          ["工具", "tool"]
        ]
      ])
    ).toBe("一个工具");
  });

  it("translates repo descriptions and preserves the original", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([[["开发者工具", "Developer tool"]]])
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateRepoDescriptions([repo("Developer tool")])).resolves.toMatchObject([
      {
        description: "开发者工具",
        originalDescription: "Developer tool"
      }
    ]);

    vi.unstubAllGlobals();
  });

  it("clears cached broken template descriptions", async () => {
    await expect(
      translateRepoDescriptions([
        repo("This will remove {{ repoNameWithOwner }} from the {{ listsWithCount }}.")
      ])
    ).resolves.toMatchObject([
      {
        description: "",
        originalDescription: "This will remove {{ repoNameWithOwner }} from the {{ listsWithCount }}."
      }
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { backfillRepoDescriptions, normalizeSearchResponse, parseCompactNumber, parseTrendingHtml } from "./github";

describe("github helpers", () => {
  it("parses compact numbers", () => {
    expect(parseCompactNumber("23.9k")).toBe(23900);
    expect(parseCompactNumber("1,245 stars today")).toBe(1245);
    expect(parseCompactNumber("2.1m")).toBe(2100000);
  });

  it("parses trending html into repo items", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/Hmbown/DeepSeek-TUI"> Hmbown / DeepSeek-TUI </a></h2>
        <p>Terminal UI for DeepSeek.</p>
        <span itemprop="programmingLanguage">TypeScript</span>
        <a href="/Hmbown/DeepSeek-TUI/stargazers">23.9k</a>
        <span class="float-sm-right">2,016 stars today</span>
      </article>
    `;

    expect(parseTrendingHtml(html, "2026-05-14T00:00:00.000Z")).toEqual([
      {
        fullName: "Hmbown/DeepSeek-TUI",
        url: "https://github.com/Hmbown/DeepSeek-TUI",
        description: "Terminal UI for DeepSeek.",
        stars: 23900,
        growth: 2016,
        language: "TypeScript",
        topics: [],
        source: "trending",
        fetchedAt: "2026-05-14T00:00:00.000Z"
      }
    ]);
  });

  it("ignores GitHub action template copy when parsing trending descriptions", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/tinyhumansai/openhuman"> tinyhumansai / openhuman </a></h2>
        <p>This will remove {{ repoNameWithOwner }} from the {{ listsWithCount }} that it's been added to.</p>
        <p>Sponsor Unstar this repository? This will remove {{ repoNameWithOwner }} from the {{ listsWithCount }} that it's been added to.</p>
        <p class="col-9 color-fg-muted my-1 pr-4">A framework for creating interactive digital humans.</p>
        <span itemprop="programmingLanguage">Rust</span>
        <a href="/tinyhumansai/openhuman/stargazers">6.9k</a>
        <span class="float-sm-right">1,700 stars today</span>
      </article>
    `;

    expect(parseTrendingHtml(html, "2026-05-14T00:00:00.000Z")[0]).toMatchObject({
      fullName: "tinyhumansai/openhuman",
      description: "A framework for creating interactive digital humans."
    });
  });

  it("parses the current GitHub trending description class", () => {
    const html = `
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/github/spec-kit">
            <span class="text-normal"> github / </span>
            spec-kit
          </a>
        </h2>
        <p class="col-9 color-fg-muted my-1 tmp-pr-4">
          💫 Toolkit to help you get started with Spec-Driven Development
        </p>
        <div class="f6 color-fg-muted mt-2">
          <span itemprop="programmingLanguage">Python</span>
          <a href="/github/spec-kit/stargazers">98,851</a>
          <span class="d-inline-block float-sm-right">1,120 stars today</span>
        </div>
      </article>
    `;

    expect(parseTrendingHtml(html, "2026-05-14T00:00:00.000Z")[0]).toMatchObject({
      fullName: "github/spec-kit",
      description: "💫 Toolkit to help you get started with Spec-Driven Development"
    });
  });

  it("backfills missing trending descriptions from repo details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          description: "A real project description",
          topics: ["developer-tools"]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      backfillRepoDescriptions([
        {
          fullName: "owner/name",
          url: "https://github.com/owner/name",
          description: "",
          stars: 1,
          growth: 0,
          language: "TypeScript",
          topics: [],
          source: "trending",
          fetchedAt: "2026-05-14T00:00:00.000Z"
        }
      ])
    ).resolves.toMatchObject([
      {
        description: "A real project description",
        topics: ["developer-tools"]
      }
    ]);

    vi.unstubAllGlobals();
  });

  it("normalizes search responses", () => {
    const repos = normalizeSearchResponse(
      {
        items: [
          {
            full_name: "openai/openai-cookbook",
            html_url: "https://github.com/openai/openai-cookbook",
            description: "Examples and guides",
            stargazers_count: 60000,
            language: "MDX",
            topics: ["openai", "examples"]
          }
        ]
      },
      "2026-05-14T00:00:00.000Z"
    );

    expect(repos[0]).toMatchObject({
      fullName: "openai/openai-cookbook",
      stars: 60000,
      source: "search",
      topics: ["openai", "examples"]
    });
  });
});

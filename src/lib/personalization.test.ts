import { describe, expect, it } from "vitest";
import { findKeywordMatches, normalizeKeywords } from "./personalization";
import type { RepoItem } from "./types";

function repo(fullName: string, patch: Partial<RepoItem> = {}): RepoItem {
  return {
    fullName,
    url: `https://github.com/${fullName}`,
    description: "",
    stars: 100,
    growth: 0,
    language: "TypeScript",
    topics: [],
    source: "trending",
    fetchedAt: "2026-05-14T00:00:00.000Z",
    ...patch
  };
}

describe("personalization helpers", () => {
  it("normalizes and deduplicates keywords", () => {
    expect(normalizeKeywords([" Agent ", "agent", "MCP", "", "RAG  tool "])).toEqual([
      "Agent",
      "MCP",
      "RAG tool"
    ]);
  });

  it("finds matching repos and sorts by match strength and momentum", () => {
    const matches = findKeywordMatches(
      [
        repo("owner/rag-tool", { description: "RAG workflow", growth: 5, stars: 1000 }),
        repo("owner/agent-mcp", { topics: ["agent", "mcp"], growth: 1, stars: 100 }),
        repo("owner/plain", { description: "Database utility", stars: 5000 })
      ],
      ["agent", "mcp", "rag"]
    );

    expect(matches.map((item) => item.fullName)).toEqual(["owner/agent-mcp", "owner/rag-tool"]);
  });
});

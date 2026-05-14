import { describe, expect, it } from "vitest";
import { createRepoSummary } from "./summary";
import type { RepoItem } from "./types";

function repo(patch: Partial<RepoItem> = {}): RepoItem {
  return {
    fullName: "owner/agent-tool",
    url: "https://github.com/owner/agent-tool",
    description: "一个用于构建 AI Agent 工作流的开发工具。",
    stars: 12800,
    growth: 3400,
    language: "TypeScript",
    topics: ["ai-agent", "workflow"],
    source: "trending",
    fetchedAt: "2026-05-14T00:00:00.000Z",
    ...patch
  };
}

describe("summary helpers", () => {
  it("creates a compact Chinese summary from repo metadata", () => {
    expect(createRepoSummary(repo())).toEqual({
      oneLine: "一个用于构建 AI Agent 工作流的开发工具。",
      bestFor: "适合：AI Agent 和大模型工作流",
      signal: "近期增长 3.4k，总 Star 12.8k"
    });
  });

  it("falls back when description is missing", () => {
    expect(createRepoSummary(repo({ description: "", topics: [], growth: 0, language: "Rust" }))).toMatchObject({
      oneLine: "owner/agent-tool 是一个值得进一步查看的开源项目。",
      bestFor: "适合：AI Agent 和大模型工作流",
      signal: "总 Star 12.8k，适合纳入候选清单"
    });
  });
});

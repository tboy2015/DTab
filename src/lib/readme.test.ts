import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReadmeMarkdown, readmeInternals, summarizeReadmeMarkdown } from "./readme";

const repo = {
  fullName: "owner/project",
  description: "A useful developer tool."
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readme helpers", () => {
  it("extracts a compact readme summary", () => {
    const summary = summarizeReadmeMarkdown(
      `
# Project

![badge](https://example.com/badge.svg)

Project is a fast toolkit for building local AI workflows with a small runtime and simple plugin system.

## Features

- Run agents locally with a typed configuration file.
- Connect tools, memory and browser automation from one workspace.
- Export repeatable workflows for the team.

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`
      `,
      repo
    );

    expect(summary).toMatchObject({
      overview: "Project is a fast toolkit for building local AI workflows with a small runtime and simple plugin system.",
      highlights: [
        "Run agents locally with a typed configuration file.",
        "Connect tools, memory and browser automation from one workspace.",
        "Export repeatable workflows for the team."
      ],
      quickStart: "npm install && npm run dev"
    });
  });

  it("cleans markdown links and inline code", () => {
    expect(readmeInternals.stripMarkdown("Use [`foo`](https://example.com) with `bar`.")).toBe(
      "Use foo with bar."
    );
  });
});

describe("fetchReadmeMarkdown", () => {
  it("falls back to raw GitHub README files when the API is rate limited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, text: async () => "# Raw README" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReadmeMarkdown("owner/project")).resolves.toBe("# Raw README");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/owner/project/main/README.md",
      expect.objectContaining({ cache: "force-cache" })
    );
  });
});

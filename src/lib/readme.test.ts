import { describe, expect, it } from "vitest";
import { readmeInternals, summarizeReadmeMarkdown } from "./readme";

const repo = {
  fullName: "owner/project",
  description: "A useful developer tool."
};

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

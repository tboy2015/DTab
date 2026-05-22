import { translateTextToChinese } from "./translation";
import type { ReadmeSummary, RepoItem } from "./types";

const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/;
const LATIN_TEXT_PATTERN = /[A-Za-z]/;
const FEATURE_HEADING_PATTERN = /feature|highlight|capabilit|what.+do|why|特性|功能|亮点/i;
const QUICK_START_HEADING_PATTERN = /install|quick.?start|get.?started|usage|setup|run|安装|快速开始|使用/i;
const COMMAND_PATTERN = /^(?:npm|pnpm|yarn|bun|pip|uv|cargo|go|docker|git|npx|deno|python|node)\b/i;

interface ReadmeSection {
  heading: string;
  content: string;
}

function compactText(value: string, limit = 180): string {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 3).trim()}...`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.match(/\[([^\]]+)]/)?.[1] ?? " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~|]/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSections(markdown: string): ReadmeSection[] {
  const sections: ReadmeSection[] = [];
  const lines = markdown.split(/\r?\n/);
  let heading = "README";
  let buffer: string[] = [];

  function pushSection() {
    const content = buffer.join("\n").trim();

    if (content) {
      sections.push({ heading, content });
    }
  }

  for (const line of lines) {
    const match = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/);

    if (match) {
      pushSection();
      heading = stripMarkdown(match[1]);
      buffer = [];
      continue;
    }

    buffer.push(line);
  }

  pushSection();
  return sections;
}

function extractParagraphs(markdown: string): string[] {
  return markdown
    .replace(/```[\s\S]*?```/g, "\n\n")
    .split(/\n\s*\n/)
    .map(stripMarkdown)
    .filter((paragraph) => paragraph.length >= 36)
    .filter((paragraph) => !/^(badge|license|copyright)$/i.test(paragraph))
    .filter((paragraph) => !/^\[!\[/.test(paragraph));
}

function extractBullets(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*+]\s+(.+)$/)?.[1] ?? "")
    .map(stripMarkdown)
    .filter((line) => line.length >= 12)
    .slice(0, 3)
    .map((line) => compactText(line, 96));
}

function extractCommands(value: string): string[] {
  const fencedBlocks = Array.from(value.matchAll(/```[^\n]*\n([\s\S]*?)```/g)).flatMap((match) =>
    match[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\$\s*/, "").trim())
      .filter((line) => COMMAND_PATTERN.test(line))
  );
  const inlineCommands = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s*/, "").replace(/^\$\s*/, "").trim())
    .filter((line) => COMMAND_PATTERN.test(line));

  return Array.from(new Set([...fencedBlocks, ...inlineCommands])).slice(0, 2);
}

function shouldTranslate(value: string): boolean {
  return LATIN_TEXT_PATTERN.test(value) && !CHINESE_TEXT_PATTERN.test(value);
}

async function translateIfNeeded(value: string): Promise<string> {
  if (!shouldTranslate(value)) {
    return value;
  }

  try {
    return compactText(await translateTextToChinese(value), 180) || value;
  } catch {
    return value;
  }
}

async function translateHighlights(highlights: string[]): Promise<string[]> {
  const translated = await Promise.all(highlights.map((item) => translateIfNeeded(item)));
  return translated.filter(Boolean).slice(0, 3);
}

export function summarizeReadmeMarkdown(markdown: string, repo: Pick<RepoItem, "description" | "fullName">): ReadmeSummary {
  const sections = splitSections(markdown);
  const paragraphs = extractParagraphs(markdown);
  const featureSection = sections.find((section) => FEATURE_HEADING_PATTERN.test(section.heading));
  const quickStartSection = sections.find((section) => QUICK_START_HEADING_PATTERN.test(section.heading));
  const highlights = extractBullets(featureSection?.content ?? markdown);
  const commands = extractCommands(quickStartSection?.content ?? markdown);
  const overview = compactText(paragraphs[0] || repo.description || `${repo.fullName} 是一个值得进一步查看的开源项目。`);

  return {
    overview,
    highlights,
    quickStart: commands.join(" && ") || undefined,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchReadmeMarkdown(fullName: string): Promise<string> {
  const [owner, repo] = fullName.split("/");

  if (!owner || !repo) {
    throw new Error("仓库名格式不正确");
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;
  const response = await fetch(
    apiUrl,
    {
      headers: {
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  if (response.ok) {
    return response.text();
  }

  if (response.status === 403 || response.status === 429) {
    const rawMarkdown = await fetchRawReadmeMarkdown(owner, repo);

    if (rawMarkdown) {
      return rawMarkdown;
    }
  }

  if (!response.ok) {
    throw new Error(response.status === 404 ? "这个仓库没有可读取的 README" : `README 请求失败：${response.status}`);
  }

  return response.text();
}

async function fetchRawReadmeMarkdown(owner: string, repo: string): Promise<string | null> {
  const branches = ["main", "master"];
  const filenames = ["README.md", "readme.md", "README"];

  for (const branch of branches) {
    for (const filename of filenames) {
      const response = await fetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${branch}/${filename}`,
        { cache: "force-cache" }
      );

      if (response.ok) {
        return response.text();
      }
    }
  }

  return null;
}

export async function fetchReadmeSummary(repo: RepoItem): Promise<ReadmeSummary> {
  const markdown = await fetchReadmeMarkdown(repo.fullName);
  const summary = summarizeReadmeMarkdown(markdown, repo);

  return {
    ...summary,
    overview: await translateIfNeeded(summary.overview),
    highlights: await translateHighlights(summary.highlights)
  };
}

export const readmeInternals = {
  extractBullets,
  extractCommands,
  extractParagraphs,
  splitSections,
  stripMarkdown
};

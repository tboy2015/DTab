import type { RecommendationCategory, RepoItem, TrendRange } from "./types";

const TRENDING_PERIOD: Record<TrendRange, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly"
};

const CATEGORY_QUERIES: Record<RecommendationCategory, string> = {
  ai: "AI OR artificial-intelligence OR machine-learning in:name,description,topics",
  chatgpt: "ChatGPT OR GPT OR LLM in:name,description,topics",
  algorithm: "algorithm OR data-structures OR leetcode in:name,description,topics",
  tools: "developer-tools OR productivity OR cli in:name,description,topics"
};

export function parseCompactNumber(value: string): number {
  const cleaned = value.replace(/,/g, "").trim().toLowerCase();
  const match = cleaned.match(/([\d.]+)\s*([km])?/);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const suffix = match[2];

  if (suffix === "k") {
    return Math.round(amount * 1000);
  }

  if (suffix === "m") {
    return Math.round(amount * 1000000);
  }

  return Math.round(amount);
}

function stripText(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function isTemplateDescription(value: string): boolean {
  return /\{\{\s*(?:repoNameWithOwner|listsWithCount)\s*\}\}/.test(value);
}

function cleanDescription(value: string): string {
  const description = stripText(value);

  return isTemplateDescription(description) ? "" : description;
}

function findTrendingDescription(article: Element): string {
  const preferred = article.querySelector("h2 + p");
  const preferredDescription = cleanDescription(preferred?.textContent ?? "");

  if (preferredDescription) {
    return preferredDescription;
  }

  const description = Array.from(article.querySelectorAll("p.color-fg-muted, p"))
    .map((paragraph) => cleanDescription(paragraph.textContent ?? ""))
    .find(Boolean);

  return description ?? "";
}

function findFallbackDescription(article: string): string {
  const preferredMatch = article.match(/<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  const preferredDescription = cleanDescription((preferredMatch?.[1] ?? "").replace(/<[^>]+>/g, ""));

  if (preferredDescription) {
    return preferredDescription;
  }

  const matches = Array.from(article.matchAll(/<p[^>]*class="[^"]*color-fg-muted[^"]*"[^>]*>([\s\S]*?)<\/p>|<p[^>]*>([\s\S]*?)<\/p>/gi));
  const description = matches
    .map((match) => cleanDescription((match[1] ?? match[2] ?? "").replace(/<[^>]+>/g, "")))
    .find(Boolean);

  return description ?? "";
}

function parseWithDOM(html: string, fetchedAt: string): RepoItem[] {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const articles = Array.from(document.querySelectorAll("article.Box-row"));

  return articles
    .map((article) => {
      const link = article.querySelector<HTMLAnchorElement>("h2 a");
      const href = link?.getAttribute("href") ?? "";
      const fullName = stripText(link?.textContent ?? "").replace(/\s*\/\s*/g, "/");
      const description = findTrendingDescription(article);
      const language = stripText(
        article.querySelector("[itemprop='programmingLanguage']")?.textContent ?? ""
      );
      const starLink = article.querySelector<HTMLAnchorElement>("a[href$='/stargazers']");
      const stars = parseCompactNumber(starLink?.textContent ?? "");
      const growthText = stripText(
        article.querySelector(".float-sm-right")?.textContent ??
          article.textContent?.match(/[\d,]+\s+stars?\s+today|[\d,]+\s+stars?\s+this\s+week|[\d,]+\s+stars?\s+this\s+month/i)?.[0] ??
          ""
      );
      const growth = parseCompactNumber(growthText);

      if (!fullName || !href) {
        return undefined;
      }

      const repo: RepoItem = {
        fullName,
        url: `https://github.com${href}`,
        description,
        stars,
        growth,
        language,
        topics: [],
        source: "trending" as const,
        fetchedAt
      };

      return repo;
    })
    .filter((repo): repo is RepoItem => Boolean(repo));
}

function parseWithFallback(html: string, fetchedAt: string): RepoItem[] {
  const articles = html.split(/<article\b[^>]*Box-row[^>]*>/i).slice(1);

  return articles
    .map((article) => {
      const linkMatch = article.match(/<h2[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const languageMatch = article.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i);
      const starMatch = article.match(/href="[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/i);
      const growthMatch = article.match(/([\d,]+)\s+stars?\s+(?:today|this week|this month)/i);

      if (!linkMatch) {
        return undefined;
      }

      const href = linkMatch[1];
      const fullName = stripText(linkMatch[2].replace(/<[^>]+>/g, "")).replace(/\s*\/\s*/g, "/");

      const repo: RepoItem = {
        fullName,
        url: `https://github.com${href}`,
        description: findFallbackDescription(article),
        stars: parseCompactNumber((starMatch?.[1] ?? "").replace(/<[^>]+>/g, "")),
        growth: parseCompactNumber(growthMatch?.[1] ?? ""),
        language: stripText((languageMatch?.[1] ?? "").replace(/<[^>]+>/g, "")),
        topics: [],
        source: "trending" as const,
        fetchedAt
      };

      return repo;
    })
    .filter((repo): repo is RepoItem => Boolean(repo));
}

export function parseTrendingHtml(html: string, fetchedAt = new Date().toISOString()): RepoItem[] {
  if (typeof DOMParser !== "undefined") {
    return parseWithDOM(html, fetchedAt);
  }

  return parseWithFallback(html, fetchedAt);
}

export async function fetchTrending(range: TrendRange): Promise<RepoItem[]> {
  const response = await fetch(`https://github.com/trending?since=${TRENDING_PERIOD[range]}`, {
    headers: {
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub Trending 请求失败：${response.status}`);
  }

  return parseTrendingHtml(await response.text()).slice(0, range === "monthly" ? 30 : 25);
}

function needsDescriptionBackfill(repo: RepoItem): boolean {
  return !repo.description || isTemplateDescription(repo.description);
}

interface SearchRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
}

interface SearchResponse {
  items?: SearchRepo[];
}

interface RepoResponse {
  description: string | null;
  topics?: string[];
}

export function normalizeSearchResponse(payload: SearchResponse, fetchedAt = new Date().toISOString()): RepoItem[] {
  return (payload.items ?? []).map((repo) => ({
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description ?? "",
    stars: repo.stargazers_count,
    growth: 0,
    language: repo.language ?? "",
    topics: repo.topics ?? [],
    source: "search",
    fetchedAt
  }));
}

export async function fetchRecommendations(category: RecommendationCategory): Promise<RepoItem[]> {
  const query = encodeURIComponent(`${CATEGORY_QUERIES[category]} stars:>500 pushed:>2025-01-01`);
  const response = await fetch(
    `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=12`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub Search 请求失败：${response.status}`);
  }

  return normalizeSearchResponse(await response.json());
}

export async function backfillRepoDescriptions(repos: RepoItem[]): Promise<RepoItem[]> {
  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      if (!needsDescriptionBackfill(repo)) {
        return repo;
      }

      const response = await fetch(`https://api.github.com/repos/${repo.fullName}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      if (!response.ok) {
        return repo;
      }

      const payload = (await response.json()) as RepoResponse;

      return {
        ...repo,
        description: payload.description ?? "",
        topics: payload.topics ?? repo.topics
      };
    })
  );

  return results.map((result, index) => (result.status === "fulfilled" ? result.value : repos[index]));
}

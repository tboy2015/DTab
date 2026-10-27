import type { RecommendationCategory, RepoItem, TrendRange } from "./types";

const TRENDING_PERIOD: Record<TrendRange, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly"
};

const API_POOL_MAX_AGE = 1000 * 60 * 5;
let trendingFallbackPool: { fetchedAt: number; promise: Promise<RepoItem[]> } | undefined;
let recommendationPool: { fetchedAt: number; promise: Promise<RepoItem[]> } | undefined;

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
  try {
    const response = await fetch(`https://github.com/trending?since=${TRENDING_PERIOD[range]}`, {
      headers: { Accept: "text/html" }
    });
    const repos = response.ok
      ? parseTrendingHtml(await response.text()).slice(0, range === "monthly" ? 30 : 25)
      : [];

    if (repos.length > 0) {
      return repos;
    }
  } catch {
    // GitHub 的 HTML 页面偶尔会被浏览器网络策略拦截，继续使用 API 降级源。
  }

  return fetchTrendingFallback(range);
}

async function fetchTrendingFallback(range: TrendRange): Promise<RepoItem[]> {
  const now = Date.now();

  if (!trendingFallbackPool || now - trendingFallbackPool.fetchedAt >= API_POOL_MAX_AGE) {
    const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const query = encodeURIComponent(`pushed:>=${since} stars:>100`);
    const promise = fetch(
      `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=30`,
      { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }
    ).then(async (response) => {
      if (!response.ok) throw new Error(`GitHub 趋势降级请求失败：${response.status}`);
      return normalizeSearchResponse(await response.json()).map((repo) => ({ ...repo, source: "trending" as const }));
    });
    trendingFallbackPool = { fetchedAt: now, promise };
    void promise.catch(() => { trendingFallbackPool = undefined; });
  }

  const repos = (await trendingFallbackPool.promise).slice(0, range === "monthly" ? 30 : 25);

  if (repos.length === 0) {
    trendingFallbackPool = undefined;
    throw new Error("GitHub 趋势数据为空，已保留原有缓存");
  }

  return repos;
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
  const now = Date.now();

  if (!recommendationPool || now - recommendationPool.fetchedAt >= API_POOL_MAX_AGE) {
    const query = encodeURIComponent("AI OR GPT OR algorithm OR developer-tools in:name,description,topics stars:>500 pushed:>2025-01-01");
    const promise = fetch(
      `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=50`,
      { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }
    ).then(async (response) => {
      if (!response.ok) throw new Error(`GitHub Search 请求失败：${response.status}`);
      return normalizeSearchResponse(await response.json());
    });
    recommendationPool = { fetchedAt: now, promise };
    void promise.catch(() => { recommendationPool = undefined; });
  }

  const repos = await recommendationPool.promise;
  const categoryPattern: Record<RecommendationCategory, RegExp> = {
    ai: /\b(ai|artificial intelligence|machine learning|agent)\b/i,
    chatgpt: /\b(chatgpt|gpt|llm|language model)\b/i,
    algorithm: /\b(algorithm|data structure|leetcode|interview)\b/i,
    tools: /\b(tool|productivity|cli|developer|automation)\b/i
  };
  const matches = repos.filter((repo) => categoryPattern[category].test(
    `${repo.fullName} ${repo.description} ${repo.topics.join(" ")}`
  ));

  return uniqueByFullName([...matches, ...repos]).slice(0, 12);
}

function uniqueByFullName(repos: RepoItem[]): RepoItem[] {
  const seen = new Set<string>();
  return repos.filter((repo) => !seen.has(repo.fullName) && Boolean(seen.add(repo.fullName)));
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

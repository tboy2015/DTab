import type { RepoItem } from "./types";

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function repoSearchText(repo: RepoItem): string {
  return [
    repo.fullName,
    repo.description,
    repo.originalDescription,
    repo.language,
    ...repo.topics,
    repo.summary?.oneLine,
    repo.summary?.bestFor
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();

  return keywords
    .map(normalizeKeyword)
    .filter(Boolean)
    .filter((keyword) => {
      const key = keyword.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function findKeywordMatches(repos: RepoItem[], keywords: string[], limit = 8): RepoItem[] {
  const normalizedKeywords = normalizeKeywords(keywords).map((keyword) => keyword.toLowerCase());

  if (normalizedKeywords.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const scored = repos
    .filter((repo) => {
      if (seen.has(repo.fullName)) {
        return false;
      }

      seen.add(repo.fullName);
      return true;
    })
    .map((repo) => {
      const text = repoSearchText(repo);
      const matchedCount = normalizedKeywords.filter((keyword) => text.includes(keyword)).length;

      return {
        repo,
        score: matchedCount * 1000000 + repo.growth * 10 + repo.stars
      };
    })
    .filter((item) => item.score >= 1000000)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.repo);
}


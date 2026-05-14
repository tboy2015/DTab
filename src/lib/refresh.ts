import { DIGEST_LABELS } from "./defaults";
import { backfillRepoDescriptions, fetchRecommendations, fetchTrending } from "./github";
import { getNextRefreshSchedule, isStale } from "./schedule";
import { readDashboardStorage, writeDashboardStorage } from "./storage";
import { attachRepoSummaries } from "./summary";
import { translateRepoDescriptions } from "./translation";
import type { AppStorage, DigestKey, RecommendationCategory, RepoItem, TrendRange } from "./types";
import { RECOMMENDATION_CATEGORIES, TREND_RANGES } from "./types";

const TRENDING_MAX_AGE = 1000 * 60 * 60 * 8;
const RECOMMENDATION_MAX_AGE = 1000 * 60 * 60 * 24;

function uniqueRepos(repos: RepoItem[]): RepoItem[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    if (seen.has(repo.fullName)) {
      return false;
    }

    seen.add(repo.fullName);
    return true;
  });
}

function byGrowthThenStars(a: RepoItem, b: RepoItem): number {
  return b.growth - a.growth || b.stars - a.stars;
}

function buildDigestItem(key: DigestKey, repos: RepoItem[], now: Date) {
  const limits: Record<DigestKey, number> = {
    dailyTop10: 10,
    weeklyTop20: 20,
    monthlyTop30: 30,
    weeklyDigest: 12,
    monthlyDigest: 16
  };

  return {
    key,
    ...DIGEST_LABELS[key],
    updatedAt: now.toISOString(),
    nextRefreshAt: getNextRefreshSchedule(key, now),
    repos: uniqueRepos(repos).sort(byGrowthThenStars).slice(0, limits[key]).map((repo) => ({
      ...repo,
      source: "digest" as const
    }))
  };
}

async function refreshTrending(storage: AppStorage, range: TrendRange, force: boolean, now: Date) {
  if (!force && !isStale(storage.lastUpdated[range], TRENDING_MAX_AGE, now.getTime())) {
    return;
  }

  storage.trending[range] = attachRepoSummaries(
    await translateRepoDescriptions(await backfillRepoDescriptions(await fetchTrending(range)))
  );
  storage.lastUpdated[range] = now.toISOString();
}

async function refreshRecommendations(
  storage: AppStorage,
  category: RecommendationCategory,
  force: boolean,
  now: Date
) {
  if (!force && !isStale(storage.lastUpdated[category], RECOMMENDATION_MAX_AGE, now.getTime())) {
    return;
  }

  storage.recommendations.byCategory[category] = attachRepoSummaries(
    await translateRepoDescriptions(await fetchRecommendations(category))
  );
  storage.lastUpdated[category] = now.toISOString();
}

function refreshDigests(storage: AppStorage, now: Date) {
  const daily = storage.trending.daily;
  const weekly = storage.trending.weekly;
  const monthly = storage.trending.monthly;
  const recommendationPool = Object.values(storage.recommendations.byCategory).flat();

  storage.digest.dailyTop10 = buildDigestItem("dailyTop10", daily, now);
  storage.digest.weeklyTop20 = buildDigestItem("weeklyTop20", weekly, now);
  storage.digest.monthlyTop30 = buildDigestItem("monthlyTop30", monthly, now);
  storage.digest.weeklyDigest = buildDigestItem("weeklyDigest", [...weekly, ...recommendationPool], now);
  storage.digest.monthlyDigest = buildDigestItem("monthlyDigest", [...monthly, ...recommendationPool], now);

  storage.nextRefreshAt = {
    daily: getNextRefreshSchedule("dailyTop10", now),
    weekly: getNextRefreshSchedule("weeklyTop20", now),
    monthly: getNextRefreshSchedule("monthlyTop30", now),
    dailyTop10: storage.digest.dailyTop10.nextRefreshAt,
    weeklyTop20: storage.digest.weeklyTop20.nextRefreshAt,
    monthlyTop30: storage.digest.monthlyTop30.nextRefreshAt,
    weeklyDigest: storage.digest.weeklyDigest.nextRefreshAt,
    monthlyDigest: storage.digest.monthlyDigest.nextRefreshAt
  };
}

async function translateStoredDescriptions(storage: AppStorage) {
  await Promise.all([
    ...TREND_RANGES.map(async (range) => {
      storage.trending[range] = attachRepoSummaries(
        await translateRepoDescriptions(await backfillRepoDescriptions(storage.trending[range]))
      );
    }),
    ...RECOMMENDATION_CATEGORIES.map(async (category) => {
      storage.recommendations.byCategory[category] = attachRepoSummaries(
        await translateRepoDescriptions(storage.recommendations.byCategory[category])
      );
    })
  ]);
}

export async function refreshDashboard(force = false): Promise<AppStorage> {
  const storage = await readDashboardStorage();
  const now = new Date();
  const errors: string[] = [];

  const trendResults = await Promise.allSettled(
    TREND_RANGES.map((range) => refreshTrending(storage, range, force, now))
  );
  const recommendationResults = await Promise.allSettled(
    RECOMMENDATION_CATEGORIES.map((category) => refreshRecommendations(storage, category, force, now))
  );

  [...trendResults, ...recommendationResults].forEach((result) => {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : "刷新失败，请稍后重试");
    }
  });

  await translateStoredDescriptions(storage);
  refreshDigests(storage, now);
  storage.lastUpdated.all = now.toISOString();
  storage.error = errors.length > 0 ? Array.from(new Set(errors)).join("；") : undefined;

  await writeDashboardStorage(storage);
  return storage;
}

import type { AppStorage, DigestKey, RecommendationCategory } from "./types";
import { getNextRefreshSchedule } from "./schedule";

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  ai: "AI",
  chatgpt: "ChatGPT",
  algorithm: "算法",
  tools: "工具"
};

export const DIGEST_LABELS: Record<DigestKey, { title: string; cadence: string }> = {
  dailyTop10: { title: "每天飙升榜 Top 10", cadence: "每天 08:30 更新" },
  weeklyTop20: { title: "每周飙升榜 Top 20", cadence: "每周一 08:00 更新" },
  monthlyTop30: { title: "每月飙升榜 Top 30", cadence: "每月 1 日 08:00 更新" },
  weeklyDigest: { title: "GitHub 精选开源项目周刊", cadence: "每周一更新" },
  monthlyDigest: { title: "GitHub 精选开源项目月刊", cadence: "每月 30 日更新" }
};

export function createEmptyStorage(now = new Date()): AppStorage {
  return {
    trending: {
      daily: [],
      weekly: [],
      monthly: []
    },
    recommendations: {
      byCategory: {
        ai: [],
        chatgpt: [],
        algorithm: [],
        tools: []
      }
    },
    digest: {
      dailyTop10: {
        key: "dailyTop10",
        ...DIGEST_LABELS.dailyTop10,
        nextRefreshAt: getNextRefreshSchedule("dailyTop10", now),
        repos: []
      },
      weeklyTop20: {
        key: "weeklyTop20",
        ...DIGEST_LABELS.weeklyTop20,
        nextRefreshAt: getNextRefreshSchedule("weeklyTop20", now),
        repos: []
      },
      monthlyTop30: {
        key: "monthlyTop30",
        ...DIGEST_LABELS.monthlyTop30,
        nextRefreshAt: getNextRefreshSchedule("monthlyTop30", now),
        repos: []
      },
      weeklyDigest: {
        key: "weeklyDigest",
        ...DIGEST_LABELS.weeklyDigest,
        nextRefreshAt: getNextRefreshSchedule("weeklyDigest", now),
        repos: []
      },
      monthlyDigest: {
        key: "monthlyDigest",
        ...DIGEST_LABELS.monthlyDigest,
        nextRefreshAt: getNextRefreshSchedule("monthlyDigest", now),
        repos: []
      }
    },
    userLibrary: {
      favorites: {},
      ignored: {}
    },
    lastUpdated: {},
    nextRefreshAt: {
      daily: getNextRefreshSchedule("dailyTop10", now),
      weekly: getNextRefreshSchedule("weeklyTop20", now),
      monthly: getNextRefreshSchedule("monthlyTop30", now),
      dailyTop10: getNextRefreshSchedule("dailyTop10", now),
      weeklyTop20: getNextRefreshSchedule("weeklyTop20", now),
      monthlyTop30: getNextRefreshSchedule("monthlyTop30", now),
      weeklyDigest: getNextRefreshSchedule("weeklyDigest", now),
      monthlyDigest: getNextRefreshSchedule("monthlyDigest", now)
    }
  };
}

export function mergeStorage(base: AppStorage, patch?: Partial<AppStorage>): AppStorage {
  if (!patch) {
    return base;
  }

  return {
    ...base,
    ...patch,
    trending: {
      ...base.trending,
      ...patch.trending
    },
    recommendations: {
      byCategory: {
        ...base.recommendations.byCategory,
        ...patch.recommendations?.byCategory
      }
    },
    digest: {
      ...base.digest,
      ...patch.digest
    },
    userLibrary: {
      favorites: {
        ...base.userLibrary.favorites,
        ...patch.userLibrary?.favorites
      },
      ignored: {
        ...base.userLibrary.ignored,
        ...patch.userLibrary?.ignored
      }
    },
    lastUpdated: {
      ...base.lastUpdated,
      ...patch.lastUpdated
    },
    nextRefreshAt: {
      ...base.nextRefreshAt,
      ...patch.nextRefreshAt
    }
  };
}

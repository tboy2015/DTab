export type TrendRange = "daily" | "weekly" | "monthly";

export type RecommendationCategory = "ai" | "chatgpt" | "algorithm" | "tools";

export type DigestKey =
  | "dailyTop10"
  | "weeklyTop20"
  | "monthlyTop30"
  | "weeklyDigest"
  | "monthlyDigest";

export interface RepoItem {
  fullName: string;
  url: string;
  description: string;
  originalDescription?: string;
  summary?: RepoSummary;
  stars: number;
  growth: number;
  language: string;
  topics: string[];
  source: "trending" | "search" | "digest";
  fetchedAt: string;
}

export interface RepoSummary {
  oneLine: string;
  bestFor: string;
  signal: string;
}

export interface DigestItem {
  key: DigestKey;
  title: string;
  cadence: string;
  nextRefreshAt: string;
  updatedAt?: string;
  repos: RepoItem[];
}

export interface UserLibrary {
  favorites: Record<string, RepoItem>;
  ignored: Record<string, RepoItem>;
  keywords: string[];
}

export interface AppStorage {
  trending: Record<TrendRange, RepoItem[]>;
  recommendations: {
    byCategory: Record<RecommendationCategory, RepoItem[]>;
  };
  digest: Record<DigestKey, DigestItem>;
  userLibrary: UserLibrary;
  lastUpdated: Partial<Record<TrendRange | RecommendationCategory | DigestKey | "all", string>>;
  nextRefreshAt: Partial<Record<DigestKey | "daily" | "weekly" | "monthly", string>>;
  error?: string;
}

export interface RefreshResult {
  storage: AppStorage;
  refreshedAt: string;
}

export type RuntimeMessage =
  | { type: "GET_DASHBOARD" }
  | { type: "REFRESH_DASHBOARD"; force?: boolean };

export interface RuntimeResponse {
  ok: boolean;
  data?: AppStorage;
  error?: string;
}

export const TREND_RANGES: TrendRange[] = ["daily", "weekly", "monthly"];

export const RECOMMENDATION_CATEGORIES: RecommendationCategory[] = [
  "ai",
  "chatgpt",
  "algorithm",
  "tools"
];

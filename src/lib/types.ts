export type TrendRange = "daily" | "weekly" | "monthly";

export type TranslationTargetLanguage = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";

export type BilingualDisplayStyle = "subtle" | "highlight" | "compact";

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
  readmeSummary?: ReadmeSummary;
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

export interface ReadmeSummary {
  overview: string;
  highlights: string[];
  quickStart?: string;
  updatedAt: string;
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
}

export interface WebsiteLink {
  name: string;
  url: string;
  note: string;
  mark?: string;
}

export type WebsiteLinkCategory = "ai" | "coding" | "resources";

export interface AppStorage {
  trending: Record<TrendRange, RepoItem[]>;
  recommendations: {
    byCategory: Record<RecommendationCategory, RepoItem[]>;
  };
  digest: Record<DigestKey, DigestItem>;
  userLibrary: UserLibrary;
  websiteLinks?: Partial<Record<WebsiteLinkCategory, WebsiteLink[]>>;
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
  | { type: "REFRESH_DASHBOARD"; force?: boolean }
  | { type: "TRANSLATE_TEXTS"; texts: string[]; targetLanguage?: TranslationTargetLanguage }
  | { type: "OPEN_TRANSLATE_SIDE_PANEL" }
  | { type: "TOGGLE_PAGE_TRANSLATION" }
  | { type: "RETRANSLATE_PAGE" };

export interface RuntimeResponse<T = AppStorage> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface PendingSidePanelTranslation {
  text: string;
  updatedAt: string;
}

export interface TranslationPreferences {
  selectionBubbleEnabled: boolean;
  autoTranslateSelection: boolean;
  targetLanguage: TranslationTargetLanguage;
  bilingualStyle: BilingualDisplayStyle;
}

export interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  targetLanguage: TranslationTargetLanguage;
  createdAt: string;
}

export const SIDE_PANEL_PENDING_TRANSLATION_KEY = "dtab.sidePanel.pendingTranslation";
export const TRANSLATION_PREFERENCES_KEY = "dtab.translation.preferences";
export const TRANSLATION_HISTORY_KEY = "dtab.translation.history";

export const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  selectionBubbleEnabled: true,
  autoTranslateSelection: false,
  targetLanguage: "zh-CN",
  bilingualStyle: "subtle"
};

export const TREND_RANGES: TrendRange[] = ["daily", "weekly", "monthly"];

export const RECOMMENDATION_CATEGORIES: RecommendationCategory[] = [
  "ai",
  "chatgpt",
  "algorithm",
  "tools"
];

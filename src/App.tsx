import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  ExternalLink,
  Flame,
  Github,
  EyeOff,
  Plus,
  RefreshCw,
  Radar,
  RotateCcw,
  Search,
  Star,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "./lib/defaults";
import { findKeywordMatches, normalizeKeywords } from "./lib/personalization";
import { refreshDashboard } from "./lib/refresh";
import { readDashboardStorage, writeDashboardStorage } from "./lib/storage";
import { createRepoSummary } from "./lib/summary";
import type {
  AppStorage,
  RecommendationCategory,
  RepoItem,
  RuntimeMessage,
  RuntimeResponse,
  TrendRange
} from "./lib/types";
import { RECOMMENDATION_CATEGORIES } from "./lib/types";

const RANGE_LABELS: Record<TrendRange, string> = {
  daily: "每日",
  weekly: "每周",
  monthly: "每月"
};

const CATEGORY_ORDER: RecommendationCategory[] = RECOMMENDATION_CATEGORIES;
const TRENDING_VISIBLE_LIMIT = 12;
const RADAR_VISIBLE_LIMIT = 4;
const RECOMMENDATION_VISIBLE_LIMIT = 5;
const FAVORITE_VISIBLE_LIMIT = 4;
const DIGEST_VISIBLE_LIMIT = 3;

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "等待更新";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message);
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Search size={28} />
      <p>暂无缓存数据，点击刷新后会从 GitHub 拉取最新榜单。</p>
    </div>
  );
}

function AppError({ message }: { message: string }) {
  return (
    <div className="error-banner">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}

function IconAction({
  active = false,
  label,
  onClick,
  children
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={active ? "icon-action active" : "icon-action"}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function RepoInsight({ repo, compact = false }: { repo: RepoItem; compact?: boolean }) {
  const summary = repo.summary ?? createRepoSummary(repo);

  return (
    <div className={compact ? "repo-insight compact" : "repo-insight"}>
      <span>{summary.bestFor}</span>
      <small>{summary.signal}</small>
    </div>
  );
}

export function App() {
  const [storage, setStorage] = useState<AppStorage | null>(null);
  const [range, setRange] = useState<TrendRange>("daily");
  const [category, setCategory] = useState<RecommendationCategory>("ai");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  async function loadDashboard(force = false) {
    setIsRefreshing(true);
    setLoadError("");

    try {
      if (isExtensionRuntime()) {
        const response = await sendRuntimeMessage({ type: "REFRESH_DASHBOARD", force });

        if (!response.ok || !response.data) {
          throw new Error(response.error ?? "刷新失败");
        }

        setStorage(response.data);
      } else {
        setStorage(await refreshDashboard(force));
      }
    } catch (error) {
      const fallback = await readDashboardStorage();
      setStorage(fallback);
      setLoadError(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard(false);
  }, []);

  function persistLibraryChange(next: AppStorage) {
    setStorage(next);
    writeDashboardStorage(next).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "偏好保存失败");
    });
  }

  function favoriteRepo(repo: RepoItem) {
    if (!storage) {
      return;
    }

    const favorites = { ...storage.userLibrary.favorites };
    const ignored = { ...storage.userLibrary.ignored };

    if (favorites[repo.fullName]) {
      delete favorites[repo.fullName];
    } else {
      favorites[repo.fullName] = repo;
      delete ignored[repo.fullName];
    }

    persistLibraryChange({
      ...storage,
      userLibrary: {
        ...storage.userLibrary,
        favorites,
        ignored
      }
    });
  }

  function ignoreRepo(repo: RepoItem) {
    if (!storage) {
      return;
    }

    const favorites = { ...storage.userLibrary.favorites };
    const ignored = { ...storage.userLibrary.ignored, [repo.fullName]: repo };
    delete favorites[repo.fullName];

    persistLibraryChange({
      ...storage,
      userLibrary: {
        ...storage.userLibrary,
        favorites,
        ignored
      }
    });
  }

  function restoreRepo(repo: RepoItem) {
    if (!storage) {
      return;
    }

    const ignored = { ...storage.userLibrary.ignored };
    delete ignored[repo.fullName];

    persistLibraryChange({
      ...storage,
      userLibrary: {
        ...storage.userLibrary,
        favorites: storage.userLibrary.favorites,
        ignored
      }
    });
  }

  function updateKeywords(keywords: string[]) {
    if (!storage) {
      return;
    }

    persistLibraryChange({
      ...storage,
      userLibrary: {
        ...storage.userLibrary,
        keywords: normalizeKeywords(keywords)
      }
    });
  }

  function addKeyword() {
    if (!keywordInput.trim() || !storage) {
      return;
    }

    updateKeywords([...storage.userLibrary.keywords, keywordInput]);
    setKeywordInput("");
  }

  function removeKeyword(keyword: string) {
    if (!storage) {
      return;
    }

    updateKeywords(storage.userLibrary.keywords.filter((item) => item.toLowerCase() !== keyword.toLowerCase()));
  }

  const favoriteRepos = Object.values(storage?.userLibrary.favorites ?? {});
  const ignoredRepos = Object.values(storage?.userLibrary.ignored ?? {});
  const keywords = storage?.userLibrary.keywords ?? [];
  const ignoredNames = new Set(Object.keys(storage?.userLibrary.ignored ?? {}));
  const favoriteNames = new Set(Object.keys(storage?.userLibrary.favorites ?? {}));
  const repoPool = [
    ...Object.values(storage?.trending ?? {}).flat(),
    ...Object.values(storage?.recommendations.byCategory ?? {}).flat()
  ].filter((repo) => !ignoredNames.has(repo.fullName));
  const radarRepos = findKeywordMatches(repoPool, keywords, RADAR_VISIBLE_LIMIT);
  const activeTrending = (storage?.trending[range] ?? []).filter((repo) => !ignoredNames.has(repo.fullName));
  const activeRecommendations = (storage?.recommendations.byCategory[category] ?? []).filter(
    (repo) => !ignoredNames.has(repo.fullName)
  );
  const digestItems = storage ? Object.values(storage.digest) : [];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Github size={25} />
          </div>
          <div>
            <p>GitHub 趋势首页</p>
            <h1>开源项目实时雷达</h1>
          </div>
        </div>

        <div className="top-actions">
          <div className="updated-at">
            <CalendarClock size={16} />
            <span>更新 {formatDateTime(storage?.lastUpdated.all)}</span>
          </div>
          <button className="refresh-button" onClick={() => void loadDashboard(true)} disabled={isRefreshing}>
            <RefreshCw size={17} className={isRefreshing ? "spin" : ""} />
            <span>{isRefreshing ? "刷新中" : "刷新"}</span>
          </button>
        </div>
      </header>

      {(loadError || storage?.error) && <AppError message={loadError || storage?.error || ""} />}

      <section className="dashboard-grid">
        <div className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Trending</span>
              <h2>趋势榜</h2>
            </div>
            <div className="segmented" aria-label="趋势榜周期">
              {(["daily", "weekly", "monthly"] as TrendRange[]).map((item) => (
                <button
                  key={item}
                  className={range === item ? "active" : ""}
                  onClick={() => setRange(item)}
                  type="button"
                >
                  {RANGE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          {activeTrending.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>项目名</th>
                    <th>Star</th>
                    <th>增长</th>
                    <th>语言</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTrending.slice(0, TRENDING_VISIBLE_LIMIT).map((repo, index) => (
                    <tr key={repo.fullName}>
                      <td>{index + 1}</td>
                      <td>
                        <a href={repo.url} target="_blank" rel="noreferrer" className="repo-link">
                          {repo.fullName}
                          <ExternalLink size={13} />
                        </a>
                        <p title={repo.originalDescription}>{repo.description || "暂无描述"}</p>
                        <RepoInsight repo={repo} />
                      </td>
                      <td>
                        <span className="star-cell">
                          <Star size={15} fill="currentColor" />
                          {formatNumber(repo.stars)}
                        </span>
                      </td>
                      <td>
                        <span className="growth">
                          <Flame size={15} />
                          {formatNumber(repo.growth)}
                        </span>
                      </td>
                      <td>
                        <span className="language-pill">{repo.language || "Other"}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <IconAction
                            active={favoriteNames.has(repo.fullName)}
                            label={favoriteNames.has(repo.fullName) ? "取消收藏" : "收藏项目"}
                            onClick={() => favoriteRepo(repo)}
                          >
                            {favoriteNames.has(repo.fullName) ? (
                              <BookmarkCheck size={16} />
                            ) : (
                              <Bookmark size={16} />
                            )}
                          </IconAction>
                          <IconAction label="忽略项目" onClick={() => ignoreRepo(repo)}>
                            <EyeOff size={16} />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="side-stack">
          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Radar</span>
                <h2>我的雷达</h2>
              </div>
            </div>
            <div className="radar-panel">
              <form
                className="keyword-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addKeyword();
                }}
              >
                <Radar size={16} />
                <input
                  aria-label="关注关键词"
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="MCP / Agent / RAG"
                  value={keywordInput}
                />
                <button aria-label="添加关键词" type="submit">
                  <Plus size={16} />
                </button>
              </form>

              <div className="keyword-tags">
                {keywords.map((keyword) => (
                  <button key={keyword} onClick={() => removeKeyword(keyword)} title={`移除 ${keyword}`} type="button">
                    {keyword}
                    <X size={13} />
                  </button>
                ))}
              </div>

              <div className="radar-list">
                {radarRepos.length === 0 ? (
                  <div className="library-empty">暂无匹配项目</div>
                ) : (
                  radarRepos.map((repo) => (
                    <article className="radar-item" key={repo.fullName}>
                      <a href={repo.url} target="_blank" rel="noreferrer">
                        <strong>{repo.fullName}</strong>
                      </a>
                      <span>{repo.summary?.bestFor ?? createRepoSummary(repo).bestFor}</span>
                      <small>
                        <Star size={13} fill="currentColor" />
                        {formatNumber(repo.stars)}
                        {repo.growth ? ` · +${formatNumber(repo.growth)}` : ""}
                      </small>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Popular</span>
                <h2>热门仓库</h2>
              </div>
            </div>
            <div className="category-tabs" aria-label="推荐分类">
              {CATEGORY_ORDER.map((item) => (
                <button
                  key={item}
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {CATEGORY_LABELS[item]}
                </button>
              ))}
            </div>
            <div className="repo-list">
              {activeRecommendations.length === 0 ? (
                <EmptyState />
              ) : (
                activeRecommendations.slice(0, RECOMMENDATION_VISIBLE_LIMIT).map((repo) => (
                  <article className="repo-card" key={repo.fullName}>
                    <div className="repo-card-header">
                      <a href={repo.url} target="_blank" rel="noreferrer">
                        <strong>{repo.fullName}</strong>
                      </a>
                      <div className="row-actions">
                        <IconAction
                          active={favoriteNames.has(repo.fullName)}
                          label={favoriteNames.has(repo.fullName) ? "取消收藏" : "收藏项目"}
                          onClick={() => favoriteRepo(repo)}
                        >
                          {favoriteNames.has(repo.fullName) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                        </IconAction>
                        <IconAction label="忽略项目" onClick={() => ignoreRepo(repo)}>
                          <EyeOff size={16} />
                        </IconAction>
                      </div>
                    </div>
                    <span title={repo.originalDescription}>{repo.description || "暂无描述"}</span>
                    <RepoInsight repo={repo} compact />
                    <small>
                      <Star size={13} fill="currentColor" />
                      {formatNumber(repo.stars)}
                      {repo.language ? ` · ${repo.language}` : ""}
                    </small>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Library</span>
                <h2>我的关注</h2>
              </div>
            </div>
            <div className="library-list">
              {favoriteRepos.length === 0 ? (
                <div className="library-empty">暂无收藏项目</div>
              ) : (
                favoriteRepos.slice(0, FAVORITE_VISIBLE_LIMIT).map((repo) => (
                  <article className="library-item" key={repo.fullName}>
                    <a href={repo.url} target="_blank" rel="noreferrer">
                      <strong>{repo.fullName}</strong>
                    </a>
                    <button onClick={() => favoriteRepo(repo)} title="移出收藏" type="button">
                      <BookmarkCheck size={15} />
                    </button>
                  </article>
                ))
              )}
              {ignoredRepos.length > 0 && (
                <div className="ignored-strip">
                  <span>已忽略 {ignoredRepos.length}</span>
                  {ignoredRepos.slice(0, 3).map((repo) => (
                    <button key={repo.fullName} onClick={() => restoreRepo(repo)} title={`恢复 ${repo.fullName}`} type="button">
                      <RotateCcw size={13} />
                      {repo.fullName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Digest</span>
                <h2>精选开源项目</h2>
              </div>
            </div>
            <div className="digest-list">
              {digestItems.slice(0, DIGEST_VISIBLE_LIMIT).map((item) => (
                <article className="digest-card" key={item.key}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.cadence}</span>
                  </div>
                  <p>{item.repos.slice(0, 3).map((repo) => repo.fullName).join(" · ") || "等待生成"}</p>
                  <small>下次 {formatDateTime(item.nextRefreshAt)}</small>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

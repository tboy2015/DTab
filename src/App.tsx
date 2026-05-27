import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Code2,
  Edit3,
  ExternalLink,
  Flame,
  Github,
  EyeOff,
  Library,
  Newspaper,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wrench,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS } from "./lib/defaults";
import { fetchDomesticHotSources, HOT_CATEGORY_LABELS } from "./lib/hot";
import type { HotCategory, HotSource } from "./lib/hot";
import { fetchReadmeSummary } from "./lib/readme";
import { refreshDashboard } from "./lib/refresh";
import { readDashboardStorage, writeDashboardStorage } from "./lib/storage";
import { createRepoSummary } from "./lib/summary";
import type {
  AppStorage,
  ReadmeSummary,
  RecommendationCategory,
  RepoItem,
  RuntimeMessage,
  RuntimeResponse,
  TrendRange,
  WebsiteLink
} from "./lib/types";
import { RECOMMENDATION_CATEGORIES } from "./lib/types";
import { ToolsPage } from "./components/ToolsPage";

const RANGE_LABELS: Record<TrendRange, string> = {
  daily: "每日",
  weekly: "每周",
  monthly: "每月"
};

const CATEGORY_ORDER: RecommendationCategory[] = RECOMMENDATION_CATEGORIES;
const TRENDING_VISIBLE_LIMIT = 12;
const RECOMMENDATION_VISIBLE_LIMIT = 5;
const FEATURED_VISIBLE_LIMIT = 4;

const SEARCH_ENGINES = [
  {
    id: "github",
    label: "GitHub",
    placeholder: "搜索仓库、Topic 或开发者",
    buildUrl: (query: string) => `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`
  },
  {
    id: "google",
    label: "Google",
    placeholder: "Google 搜索",
    buildUrl: (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: "bing",
    label: "Bing",
    placeholder: "Bing 搜索",
    buildUrl: (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: "baidu",
    label: "百度",
    placeholder: "百度搜索",
    buildUrl: (query: string) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
  }
] as const;

const WEBSITE_CATEGORIES = [
  {
    id: "ai",
    label: "AI 助手",
    icon: Sparkles,
    links: [
      { name: "ChatGPT", url: "https://chatgpt.com", note: "OpenAI 对话助手", mark: "C" },
      { name: "Claude", url: "https://claude.ai", note: "Anthropic 对话与写作", mark: "Cl" },
      { name: "DeepSeek", url: "https://chat.deepseek.com", note: "深度求索对话入口", mark: "D" },
      { name: "腾讯元宝", url: "https://yuanbao.tencent.com", note: "腾讯 AI 助手", mark: "元" }
    ]
  },
  {
    id: "coding",
    label: "编程",
    icon: Code2,
    links: [
      { name: "GitHub", url: "https://github.com", note: "代码托管与开源社区", mark: "G" },
      { name: "Cursor", url: "https://cursor.com", note: "AI 编程编辑器", mark: "Cu" },
      { name: "v0", url: "https://v0.dev", note: "生成式 UI 原型", mark: "v0" },
      { name: "StackBlitz", url: "https://stackblitz.com", note: "浏览器内开发环境", mark: "S" }
    ]
  },
  {
    id: "resources",
    label: "开发资源",
    icon: Library,
    links: [
      { name: "MDN", url: "https://developer.mozilla.org", note: "Web 技术文档", mark: "M" },
      { name: "npm", url: "https://www.npmjs.com", note: "JavaScript 包生态", mark: "n" },
      { name: "Docker Hub", url: "https://hub.docker.com", note: "容器镜像仓库", mark: "Dk" },
      { name: "Vercel", url: "https://vercel.com", note: "前端部署平台", mark: "V" }
    ]
  }
] as const;

type SearchEngineId = (typeof SEARCH_ENGINES)[number]["id"];
type WebsiteCategoryId = (typeof WEBSITE_CATEGORIES)[number]["id"];
type AppPageId = "github" | "hot" | "tools";
type HotLoadState = "idle" | "loading" | "ready" | "error";
type ReadmeSummaryState =
  | { status: "loading" }
  | { status: "ready"; summary: ReadmeSummary }
  | { status: "error"; message: string };

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

function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`;
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

function RepoTitleButton({ repo, onSelect, className = "repo-title-button" }: {
  repo: RepoItem;
  onSelect: (repo: RepoItem) => void;
  className?: string;
}) {
  return (
    <button className={className.includes("repo-title-button") ? className : `repo-title-button ${className}`} onClick={() => onSelect(repo)} type="button">
      {repo.fullName}
      <ExternalLink size={13} />
    </button>
  );
}

function RepoDetailDrawer({
  favoriteNames,
  onClose,
  onFavorite,
  onIgnore,
  onReloadReadme,
  readmeState,
  repo
}: {
  favoriteNames: Set<string>;
  onClose: () => void;
  onFavorite: (repo: RepoItem) => void;
  onIgnore: (repo: RepoItem) => void;
  onReloadReadme: (repo: RepoItem) => void;
  readmeState?: ReadmeSummaryState;
  repo: RepoItem | null;
}) {
  if (!repo) {
    return null;
  }

  const summary = repo.summary ?? createRepoSummary(repo);
  const isFavorite = favoriteNames.has(repo.fullName);

  return (
    <div className="drawer-layer" role="presentation">
      <button aria-label="关闭详情" className="drawer-backdrop" onClick={onClose} type="button" />
      <aside aria-label="项目详情" aria-modal="true" className="repo-drawer" role="dialog">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Repository</span>
            <h2>{repo.fullName}</h2>
          </div>
          <button aria-label="关闭详情" className="drawer-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <h3>中文简介</h3>
            <p>{repo.description || summary.oneLine}</p>
          </section>

          {repo.originalDescription && repo.originalDescription !== repo.description && (
            <section className="drawer-section">
              <h3>原始描述</h3>
              <p>{repo.originalDescription}</p>
            </section>
          )}

          <section className="drawer-section readme-section">
            <div className="section-title-row">
              <h3>README 摘要</h3>
              {readmeState?.status === "error" && (
                <button onClick={() => onReloadReadme(repo)} type="button">
                  重试
                </button>
              )}
            </div>

            {(!readmeState || readmeState.status === "loading") && (
              <div className="readme-loading">
                <span />
                正在读取 README
              </div>
            )}

            {readmeState?.status === "error" && <p className="readme-error">{readmeState.message}</p>}

            {readmeState?.status === "ready" && (
              <div className="readme-summary">
                <p>{readmeState.summary.overview}</p>
                {readmeState.summary.highlights.length > 0 && (
                  <ul>
                    {readmeState.summary.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                )}
                {readmeState.summary.quickStart && (
                  <code>{readmeState.summary.quickStart}</code>
                )}
              </div>
            )}
          </section>

          <section className="drawer-section">
            <h3>判断信息</h3>
            <div className="detail-insights">
              <span>{summary.bestFor}</span>
              <span>{summary.signal}</span>
              <span>{repo.language || "Other"}</span>
            </div>
          </section>

          {repo.topics.length > 0 && (
            <section className="drawer-section">
              <h3>Topics</h3>
              <div className="topic-list">
                {repo.topics.slice(0, 10).map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            </section>
          )}

          <section className="drawer-metrics" aria-label="项目指标">
            <div>
              <span>Star</span>
              <strong>{formatNumber(repo.stars)}</strong>
            </div>
            <div>
              <span>增长</span>
              <strong>{repo.growth ? formatNumber(repo.growth) : "-"}</strong>
            </div>
            <div>
              <span>来源</span>
              <strong>{repo.source}</strong>
            </div>
          </section>
        </div>

        <div className="drawer-actions">
          <a className="open-github-button" href={repo.url} rel="noreferrer" target="_blank">
            <ExternalLink size={16} />
            打开 GitHub
          </a>
          <button className={isFavorite ? "drawer-action active" : "drawer-action"} onClick={() => onFavorite(repo)} type="button">
            {isFavorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            {isFavorite ? "已收藏" : "收藏"}
          </button>
          <button className="drawer-action" onClick={() => onIgnore(repo)} type="button">
            <EyeOff size={16} />
            忽略
          </button>
        </div>
      </aside>
    </div>
  );
}

function LibraryModal({
  favoriteRepos,
  ignoredRepos,
  onClose,
  onFavorite,
  onRestore,
  onSelectRepo
}: {
  favoriteRepos: RepoItem[];
  ignoredRepos: RepoItem[];
  onClose: () => void;
  onFavorite: (repo: RepoItem) => void;
  onRestore: (repo: RepoItem) => void;
  onSelectRepo: (repo: RepoItem) => void;
}) {
  return (
    <div className="modal-layer" role="presentation">
      <button aria-label="关闭我的关注" className="modal-backdrop" onClick={onClose} type="button" />
      <section aria-label="我的关注" aria-modal="true" className="library-modal" role="dialog">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Library</span>
            <h2>我的关注</h2>
          </div>
          <button aria-label="关闭我的关注" className="drawer-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="library-modal-body">
          <section>
            <h3>收藏项目</h3>
            <div className="library-list modal-library-list">
              {favoriteRepos.length === 0 ? (
                <div className="library-empty">暂无收藏项目</div>
              ) : (
                favoriteRepos.map((repo) => (
                  <article className="library-item" key={repo.fullName}>
                    <RepoTitleButton onSelect={onSelectRepo} repo={repo} />
                    <button className="library-remove" onClick={() => onFavorite(repo)} title="移出收藏" type="button">
                      <BookmarkCheck size={15} />
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section>
            <h3>已忽略</h3>
            {ignoredRepos.length === 0 ? (
              <div className="library-empty">暂无忽略项目</div>
            ) : (
              <div className="ignored-strip modal-ignored-list">
                {ignoredRepos.map((repo) => (
                  <button key={repo.fullName} onClick={() => onRestore(repo)} title={`恢复 ${repo.fullName}`} type="button">
                    <RotateCcw size={13} />
                    {repo.fullName}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function WebsiteDock({
  activeCategory,
  activePage,
  links,
  onEditLinks,
  onPageChange,
  onChange
}: {
  activeCategory: WebsiteCategoryId;
  activePage: AppPageId;
  links: WebsiteLink[];
  onEditLinks: (category: WebsiteCategoryId) => void;
  onPageChange: (page: AppPageId) => void;
  onChange: (category: WebsiteCategoryId) => void;
}) {
  const category = WEBSITE_CATEGORIES.find((item) => item.id === activeCategory) ?? WEBSITE_CATEGORIES[0];
  const pageItems = [
    { id: "github" as const, label: "GitHub 资讯", icon: Github },
    { id: "hot" as const, label: "国内热搜", icon: Newspaper },
    { id: "tools" as const, label: "工具箱", icon: Wrench }
  ];

  return (
    <nav aria-label="官网导航" className="website-dock">
      <div className="page-nav" aria-label="页面导航">
        {pageItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-current={activePage === item.id ? "page" : undefined}
              className={activePage === item.id ? "active" : ""}
              key={item.id}
              onClick={() => onPageChange(item.id)}
              type="button"
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="dock-categories" aria-label="官网导航目录">
        {WEBSITE_CATEGORIES.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-label={item.label}
              className={category.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => onChange(item.id)}
              title={item.label}
              type="button"
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
      <div className="dock-links" aria-label={`${category.label}官网`}>
        <div className="dock-links-header">
          <span>{category.label}</span>
          <button aria-label={`编辑${category.label}官网`} onClick={() => onEditLinks(category.id)} title="编辑官网" type="button">
            <Edit3 size={14} />
          </button>
        </div>
        {links.map((link) => (
          <a
            aria-label={`${link.name}：${link.note}`}
            className="dock-link"
            href={link.url}
            key={link.name}
            rel="noreferrer"
            target="_blank"
            title={`${link.name} - ${link.note}`}
          >
            <img alt="" src={faviconUrl(link.url)} />
            <span>{link.name}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function WebsiteLinksModal({
  categoryLabel,
  links,
  onAdd,
  onChange,
  onClose,
  onRemove,
  onSave
}: {
  categoryLabel: string;
  links: WebsiteLink[];
  onAdd: () => void;
  onChange: (index: number, field: keyof WebsiteLink, value: string) => void;
  onClose: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-layer" role="presentation">
      <button aria-label="关闭官网编辑" className="modal-backdrop" onClick={onClose} type="button" />
      <section aria-label="编辑快捷官网" aria-modal="true" className="website-editor-modal" role="dialog">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Quick Links</span>
            <h2>编辑{categoryLabel}官网</h2>
          </div>
          <button aria-label="关闭官网编辑" className="drawer-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="website-editor-body">
          {links.map((link, index) => (
            <article className="website-editor-row" key={index}>
              <label>
                <span>名称</span>
                <input
                  onChange={(event) => onChange(index, "name", event.target.value)}
                  placeholder="ChatGPT"
                  value={link.name}
                />
              </label>
              <label>
                <span>网址</span>
                <input
                  onChange={(event) => onChange(index, "url", event.target.value)}
                  placeholder="https://example.com"
                  value={link.url}
                />
              </label>
              <label>
                <span>说明</span>
                <input
                  onChange={(event) => onChange(index, "note", event.target.value)}
                  placeholder="一句话说明"
                  value={link.note}
                />
              </label>
              <button aria-label={`删除 ${link.name || "官网"}`} className="website-row-remove" onClick={() => onRemove(index)} type="button">
                <Trash2 size={16} />
              </button>
            </article>
          ))}

          <button className="website-add-link" onClick={onAdd} type="button">
            <Plus size={16} />
            添加官网
          </button>
        </div>

        <div className="website-editor-actions">
          <button className="drawer-action" onClick={onClose} type="button">
            取消
          </button>
          <button className="open-github-button" onClick={onSave} type="button">
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

function HotTrendsPanel({
  activeCategory,
  activeSourceId,
  error,
  loadState,
  onCategoryChange,
  onReload,
  onSourceChange,
  variant = "compact",
  sources
}: {
  activeCategory: HotCategory;
  activeSourceId: string;
  error: string;
  loadState: HotLoadState;
  onCategoryChange: (category: HotCategory) => void;
  onReload: () => void;
  onSourceChange: (sourceId: string) => void;
  variant?: "compact" | "wide";
  sources: HotSource[];
}) {
  const filteredSources =
    activeCategory === "全部" ? sources : sources.filter((source) => source.category === activeCategory);
  const selectedSource =
    filteredSources.find((source) => source.id === activeSourceId) ?? filteredSources[0] ?? sources[0];
  const itemLimit = variant === "wide" ? 18 : 6;
  const featuredSources = filteredSources.slice(0, 4);
  const categorySections = (["科技", "新闻", "财经", "娱乐", "综合"] as Exclude<HotCategory, "全部">[])
    .map((category) => ({
      category,
      sources: sources.filter((source) => source.category === category)
    }))
    .filter((section) => section.sources.length > 0);
  const boardSections =
    activeCategory === "全部"
      ? [
          ...(featuredSources.length > 0 ? [{ category: "推荐", sources: featuredSources }] : []),
          ...categorySections
        ]
      : [{ category: activeCategory, sources: filteredSources }];

  if (variant === "wide") {
    return (
      <div className="hot-board-page">
        <div className="hot-board-tabs" aria-label="热搜分类">
          {HOT_CATEGORY_LABELS.map((item) => (
            <button
              className={activeCategory === item ? "active" : ""}
              key={item}
              onClick={() => onCategoryChange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
          <button className="hot-board-refresh" disabled={loadState === "loading"} onClick={onReload} type="button">
            <RefreshCw size={14} className={loadState === "loading" ? "spin" : ""} />
            <span>{loadState === "loading" ? "刷新中" : "刷新"}</span>
          </button>
        </div>

        {loadState === "error" && sources.length === 0 ? (
          <div className="panel hot-empty hot-board-empty">
            <Newspaper size={22} />
            <span>{error || "暂时无法读取热搜"}</span>
          </div>
        ) : (
          <>
            <section className="hot-source-gallery" aria-label="热门平台">
              <div className="hot-section-title">热门</div>
              <div className="hot-source-rail">
                {filteredSources.slice(0, 18).map((source) => (
                  <a href={source.items[0]?.url ?? "#"} key={source.id} rel="noreferrer" target="_blank">
                    <span className="hot-source-logo">
                      {source.iconUrl ? <img alt="" src={source.iconUrl} /> : <Newspaper size={24} />}
                    </span>
                    <strong>{source.name}</strong>
                    <small>{source.category}</small>
                  </a>
                ))}
              </div>
            </section>

            {boardSections.map((section) => (
              <section className="hot-board-section" key={section.category}>
                <div className="hot-section-title">{section.category}</div>
                <div className="hot-card-grid">
                  {section.sources.map((source) => (
                    <article className="hot-rank-card" key={`${section.category}-${source.id}`}>
                      <div className="hot-rank-card-header">
                        <div>
                          {source.iconUrl ? <img alt="" src={source.iconUrl} /> : <Newspaper size={16} />}
                          <h3>{source.name}</h3>
                        </div>
                        <span>{source.category}</span>
                      </div>
                      <ol className="hot-rank-list">
                        {source.items.slice(0, 10).map((item) => (
                          <li key={`${source.id}-${item.rank}-${item.title}`}>
                            <a href={item.url} rel="noreferrer" target="_blank" title={item.title}>
                              <strong>{item.rank}</strong>
                              <span>{item.title}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                      <div className="hot-rank-card-footer">
                        <span>{source.updatedAt || "刚刚更新"}</span>
                        <button aria-label={`刷新 ${source.name}`} onClick={onReload} type="button">
                          <RefreshCw size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {boardSections.length === 0 && (
              <div className="panel hot-empty hot-board-empty">
                <Newspaper size={22} />
                <span>{loadState === "loading" ? "正在读取热搜" : "暂无热搜数据"}</span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="panel hot-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Hot Search</span>
          <h2>国内热搜</h2>
        </div>
        <button className="mini-refresh" disabled={loadState === "loading"} onClick={onReload} type="button">
          <RefreshCw size={14} className={loadState === "loading" ? "spin" : ""} />
        </button>
      </div>

      <div className="hot-category-tabs" aria-label="热搜分类">
        {HOT_CATEGORY_LABELS.map((item) => (
          <button
            className={activeCategory === item ? "active" : ""}
            key={item}
            onClick={() => onCategoryChange(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      {loadState === "error" && sources.length === 0 ? (
        <div className="hot-empty">
          <Newspaper size={22} />
          <span>{error || "暂时无法读取热搜"}</span>
        </div>
      ) : (
        <>
          <div className="hot-source-strip" aria-label="热搜平台">
            {filteredSources.slice(0, 14).map((source) => (
              <button
                className={selectedSource?.id === source.id ? "active" : ""}
                key={source.id}
                onClick={() => onSourceChange(source.id)}
                type="button"
              >
                {source.iconUrl ? <img alt="" src={source.iconUrl} /> : <Newspaper size={14} />}
                <span>{source.name}</span>
              </button>
            ))}
          </div>

          {selectedSource ? (
            <div className="hot-list-wrap">
              <ol className="hot-list">
                {selectedSource.items.slice(0, itemLimit).map((item) => (
                  <li key={`${selectedSource.id}-${item.rank}-${item.title}`}>
                    <a href={item.url} rel="noreferrer" target="_blank" title={item.title}>
                      <strong>{item.rank}</strong>
                      <span>{item.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="hot-footer">
                <span>{selectedSource.updatedAt}</span>
                {loadState === "error" && <span>{error}</span>}
              </div>
            </div>
          ) : (
            <div className="hot-empty">
              <Newspaper size={22} />
              <span>{loadState === "loading" ? "正在读取热搜" : "暂无热搜数据"}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildFeaturedRepos(repos: RepoItem[], ignoredNames: Set<string>): RepoItem[] {
  const seen = new Set<string>();

  return repos
    .filter((repo) => !ignoredNames.has(repo.fullName))
    .filter((repo) => {
      if (seen.has(repo.fullName)) {
        return false;
      }

      seen.add(repo.fullName);
      return true;
    })
    .sort((a, b) => b.growth - a.growth || b.stars - a.stars);
}

export function App() {
  const [storage, setStorage] = useState<AppStorage | null>(null);
  const [activePage, setActivePage] = useState<AppPageId>("github");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<TrendRange>("monthly");
  const [category, setCategory] = useState<RecommendationCategory>("ai");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchEngine, setSearchEngine] = useState<SearchEngineId>("google");
  const [searchQuery, setSearchQuery] = useState("");
  const [websiteCategory, setWebsiteCategory] = useState<WebsiteCategoryId>("ai");
  const [editingWebsiteCategory, setEditingWebsiteCategory] = useState<WebsiteCategoryId | null>(null);
  const [websiteDraftLinks, setWebsiteDraftLinks] = useState<WebsiteLink[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepoItem | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [readmeSummaries, setReadmeSummaries] = useState<Record<string, ReadmeSummaryState>>({});
  const [hotSources, setHotSources] = useState<HotSource[]>([]);
  const [hotCategory, setHotCategory] = useState<HotCategory>("全部");
  const [hotSourceId, setHotSourceId] = useState("");
  const [hotLoadState, setHotLoadState] = useState<HotLoadState>("idle");
  const [hotError, setHotError] = useState("");

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

  async function loadHotSources() {
    setHotLoadState("loading");
    setHotError("");

    try {
      const sources = await fetchDomesticHotSources();
      setHotSources(sources);
      setHotSourceId((current) => (current && sources.some((source) => source.id === current) ? current : sources[0]?.id ?? ""));
      setHotLoadState("ready");
    } catch (error) {
      setHotError(error instanceof Error ? error.message : "热搜读取失败");
      setHotLoadState("error");
    }
  }

  useEffect(() => {
    void loadDashboard(false);
    void loadHotSources();
  }, []);

  useEffect(() => {
    if (activePage === "github") {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [activePage]);

  useEffect(() => {
    const filteredSources =
      hotCategory === "全部" ? hotSources : hotSources.filter((source) => source.category === hotCategory);

    if (filteredSources.length > 0 && !filteredSources.some((source) => source.id === hotSourceId)) {
      setHotSourceId(filteredSources[0].id);
    }
  }, [hotCategory, hotSourceId, hotSources]);

  useEffect(() => {
    if (!selectedRepo) {
      return undefined;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedRepo(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedRepo]);

  useEffect(() => {
    if (!isLibraryOpen) {
      return undefined;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLibraryOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isLibraryOpen]);

  useEffect(() => {
    if (!selectedRepo) {
      return;
    }

    void loadReadmeSummary(selectedRepo);
  }, [selectedRepo]);

  async function loadReadmeSummary(repo: RepoItem, force = false) {
    const current = readmeSummaries[repo.fullName];

    if (!force && (current?.status === "ready" || current?.status === "loading")) {
      return;
    }

    setReadmeSummaries((items) => ({
      ...items,
      [repo.fullName]: { status: "loading" }
    }));

    try {
      const summary = await fetchReadmeSummary(repo);

      setReadmeSummaries((items) => ({
        ...items,
        [repo.fullName]: { status: "ready", summary }
      }));
    } catch (error) {
      setReadmeSummaries((items) => ({
        ...items,
        [repo.fullName]: {
          status: "error",
          message: error instanceof Error ? error.message : "README 摘要生成失败"
        }
      }));
    }
  }

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
    setSelectedRepo((current) => (current?.fullName === repo.fullName ? null : current));
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

  function getWebsiteLinks(categoryId: WebsiteCategoryId): WebsiteLink[] {
    const defaultCategory = WEBSITE_CATEGORIES.find((item) => item.id === categoryId) ?? WEBSITE_CATEGORIES[0];
    return (storage?.websiteLinks?.[categoryId] ?? defaultCategory.links).map((link) => ({ ...link }));
  }

  function openWebsiteEditor(categoryId: WebsiteCategoryId) {
    setEditingWebsiteCategory(categoryId);
    setWebsiteDraftLinks(getWebsiteLinks(categoryId));
  }

  function updateWebsiteDraftLink(index: number, field: keyof WebsiteLink, value: string) {
    setWebsiteDraftLinks((links) =>
      links.map((link, itemIndex) => (itemIndex === index ? { ...link, [field]: value } : link))
    );
  }

  function saveWebsiteLinks() {
    if (!storage || !editingWebsiteCategory) {
      return;
    }

    const normalizedLinks = websiteDraftLinks
      .map((link) => ({
        name: link.name.trim(),
        url: link.url.trim(),
        note: link.note.trim() || "快捷入口",
        mark: link.mark?.trim() || undefined
      }))
      .filter((link) => link.name && link.url);

    if (normalizedLinks.some((link) => !/^https?:\/\//i.test(link.url))) {
      setLoadError("官网地址需要以 http:// 或 https:// 开头");
      return;
    }

    persistLibraryChange({
      ...storage,
      websiteLinks: {
        ...storage.websiteLinks,
        [editingWebsiteCategory]: normalizedLinks
      }
    });
    setEditingWebsiteCategory(null);
  }

  function submitSearch() {
    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    const engine = SEARCH_ENGINES.find((item) => item.id === searchEngine) ?? SEARCH_ENGINES[0];
    window.location.href = engine.buildUrl(query);
  }

  const favoriteRepos = Object.values(storage?.userLibrary.favorites ?? {});
  const ignoredRepos = Object.values(storage?.userLibrary.ignored ?? {});
  const ignoredNames = new Set(Object.keys(storage?.userLibrary.ignored ?? {}));
  const favoriteNames = new Set(Object.keys(storage?.userLibrary.favorites ?? {}));
  const activeTrending = (storage?.trending[range] ?? []).filter((repo) => !ignoredNames.has(repo.fullName));
  const activeRecommendations = (storage?.recommendations.byCategory[category] ?? []).filter(
    (repo) => !ignoredNames.has(repo.fullName)
  );
  const digestItems = storage ? Object.values(storage.digest) : [];
  const featuredRepos = buildFeaturedRepos(digestItems.flatMap((item) => item.repos), ignoredNames);
  const activeWebsiteLinks = getWebsiteLinks(websiteCategory);
  const editingWebsiteLabel = editingWebsiteCategory
    ? WEBSITE_CATEGORIES.find((item) => item.id === editingWebsiteCategory)?.label ?? ""
    : "";

  return (
    <>
      <WebsiteDock
        activeCategory={websiteCategory}
        activePage={activePage}
        links={activeWebsiteLinks}
        onChange={setWebsiteCategory}
        onEditLinks={openWebsiteEditor}
        onPageChange={setActivePage}
      />
      <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Github size={25} />
          </div>
          <div>
            <h1>{activePage === "hot" ? "国内热榜聚合" : activePage === "tools" ? "工具箱" : "开源项目实时雷达"}</h1>
          </div>
        </div>

        {activePage === "github" && (
          <section className="topbar-search" aria-label="搜索入口">
            <form
              className="search-box"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <div className="search-main">
                <label className="visually-hidden" htmlFor="dashboard-search">
                  搜索内容
                </label>
                <Search size={19} />
                <input
                  aria-label="搜索内容"
                  id="dashboard-search"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={SEARCH_ENGINES.find((item) => item.id === searchEngine)?.placeholder}
                  ref={searchInputRef}
                  value={searchQuery}
                />
                <button type="submit">
                  <Search size={15} />
                  <span>搜索</span>
                </button>
              </div>
              <div className="engine-tabs" aria-label="搜索引擎">
                {SEARCH_ENGINES.map((engine) => (
                  <button
                    aria-pressed={searchEngine === engine.id}
                    className={searchEngine === engine.id ? "active" : ""}
                    key={engine.id}
                    onClick={() => setSearchEngine(engine.id)}
                    type="button"
                  >
                    {engine.label}
                  </button>
                ))}
              </div>
            </form>
          </section>
        )}

        <div className="top-actions">
          <button className="library-trigger" onClick={() => setIsLibraryOpen(true)} type="button">
            <BookmarkCheck size={16} />
            <span>关注 {favoriteRepos.length}</span>
          </button>
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

      {activePage === "tools" && <ToolsPage />}

      {activePage === "github" ? (
      <section className="dashboard-grid github-page">
        <div className="panel trend-panel">
          <div className="panel-heading">
            <div>
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
                        <RepoTitleButton className="repo-link repo-link-button" onSelect={setSelectedRepo} repo={repo} />
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
                      <RepoTitleButton onSelect={setSelectedRepo} repo={repo} />
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
                <span className="eyebrow">Digest</span>
                <h2>精选开源项目</h2>
              </div>
            </div>
            <div className="digest-list">
              {featuredRepos.length === 0 ? (
                <div className="library-empty">刷新后会根据趋势和推荐生成精选项目。</div>
              ) : (
                featuredRepos.slice(0, FEATURED_VISIBLE_LIMIT).map((repo) => (
                  <article className="featured-card" key={repo.fullName}>
                    <div className="repo-card-header">
                      <RepoTitleButton onSelect={setSelectedRepo} repo={repo} />
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
                    <p title={repo.originalDescription}>{repo.description || "暂无描述"}</p>
                    <RepoInsight repo={repo} compact />
                    <small>
                      <Star size={13} fill="currentColor" />
                      {formatNumber(repo.stars)}
                      {repo.growth ? ` · 增长 ${formatNumber(repo.growth)}` : ""}
                      {repo.language ? ` · ${repo.language}` : ""}
                    </small>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
      ) : activePage === "hot" ? (
        <section className="hot-page-grid" aria-label="国内热搜页面">
          <HotTrendsPanel
            activeCategory={hotCategory}
            activeSourceId={hotSourceId}
            error={hotError}
            loadState={hotLoadState}
            onCategoryChange={setHotCategory}
            onReload={() => void loadHotSources()}
            onSourceChange={setHotSourceId}
            sources={hotSources}
            variant="wide"
          />
        </section>
      ) : null}
      <RepoDetailDrawer
        favoriteNames={favoriteNames}
        onClose={() => setSelectedRepo(null)}
        onFavorite={favoriteRepo}
        onIgnore={ignoreRepo}
        onReloadReadme={(repo) => void loadReadmeSummary(repo, true)}
        readmeState={selectedRepo ? readmeSummaries[selectedRepo.fullName] : undefined}
        repo={selectedRepo}
      />
      {isLibraryOpen && (
        <LibraryModal
          favoriteRepos={favoriteRepos}
          ignoredRepos={ignoredRepos}
          onClose={() => setIsLibraryOpen(false)}
          onFavorite={favoriteRepo}
          onRestore={restoreRepo}
          onSelectRepo={(repo) => {
            setSelectedRepo(repo);
            setIsLibraryOpen(false);
          }}
        />
      )}
      {editingWebsiteCategory && (
        <WebsiteLinksModal
          categoryLabel={editingWebsiteLabel}
          links={websiteDraftLinks}
          onAdd={() => setWebsiteDraftLinks((links) => [...links, { name: "", url: "https://", note: "" }])}
          onChange={updateWebsiteDraftLink}
          onClose={() => setEditingWebsiteCategory(null)}
          onRemove={(index) => setWebsiteDraftLinks((links) => links.filter((_, itemIndex) => itemIndex !== index))}
          onSave={saveWebsiteLinks}
        />
      )}
      </main>
    </>
  );
}

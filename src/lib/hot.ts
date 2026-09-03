export const REBANG_URL = "https://top.open2hub.com/";

export const HOT_CATEGORY_LABELS = ["全部", "综合", "新闻", "财经", "娱乐", "科技"] as const;

export type HotCategory = (typeof HOT_CATEGORY_LABELS)[number];

export interface HotItem {
  rank: number;
  title: string;
  url: string;
}

export interface HotSource {
  id: string;
  name: string;
  category: Exclude<HotCategory, "全部">;
  iconUrl?: string;
  updatedAt: string;
  items: HotItem[];
}

const SOURCE_PRIORITY = [
  "微博",
  "抖音",
  "百度",
  "今日头条",
  "腾讯新闻",
  "哔哩哔哩",
  "知乎",
  "IT之家",
  "稀土掘金",
  "InfoQ",
  "少数派",
  "36氪"
];

const REBANG_CHANNELS: Array<{ category: Exclude<HotCategory, "全部">; path: string }> = [
  { category: "综合", path: "channel/all" },
  { category: "新闻", path: "channel/news" },
  { category: "财经", path: "channel/finance" },
  { category: "娱乐", path: "channel/ent" },
  { category: "科技", path: "channel/tech" }
];

function textContent(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeCategory(value: string | null): HotSource["category"] {
  if (value === "新闻" || value === "财经" || value === "娱乐" || value === "科技") {
    return value;
  }

  return "综合";
}

function sourceId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-");
}

function sortSources(sources: HotSource[]): HotSource[] {
  return [...sources].sort((a, b) => {
    const aIndex = SOURCE_PRIORITY.indexOf(a.name);
    const bIndex = SOURCE_PRIORITY.indexOf(b.name);

    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? SOURCE_PRIORITY.length : aIndex) - (bIndex === -1 ? SOURCE_PRIORITY.length : bIndex);
    }

    return a.name.localeCompare(b.name, "zh-CN");
  });
}

function boardName(updatedAt: string): string {
  return updatedAt.split(" - ").pop()?.trim() ?? "";
}

function boardScore(source: HotSource): number {
  const board = boardName(source.updatedAt);

  if (/综合热门|热搜|热榜|热点|热门/.test(board)) {
    return 0;
  }

  if (board.includes(source.category)) {
    return 1;
  }

  if (/必看|必刷|榜/.test(board)) {
    return 2;
  }

  return 3;
}

function dedupeSourcesByPlatform(sources: HotSource[]): HotSource[] {
  const byPlatform = new Map<string, HotSource>();

  for (const source of sources) {
    const key = `${source.category}\n${source.name}`;
    const current = byPlatform.get(key);

    if (!current || boardScore(source) < boardScore(current)) {
      byPlatform.set(key, source);
    }
  }

  return Array.from(byPlatform.values());
}

function uniqueSources(sources: HotSource[]): HotSource[] {
  const seen = new Map<string, number>();

  return sources.map((source) => {
    const count = seen.get(source.id) ?? 0;
    seen.set(source.id, count + 1);

    if (count === 0) {
      return source;
    }

    return {
      ...source,
      id: `${source.id}-${count + 1}`
    };
  });
}

export function parseRebangHtml(html: string): HotSource[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const cards = Array.from(document.querySelectorAll("section.card, [role='listitem'][data-filter] .card-rebang"));

  return uniqueSources(dedupeSourcesByPlatform(sortSources(
    cards
      .map((card): HotSource | null => {
        const categoryElement = card.matches("[data-filter]") ? card : card.closest("[data-filter]");
        const name = textContent(card.querySelector(".platform-name-span, .header-content h3, .platform-title"));
        const iconUrl = card.querySelector<HTMLImageElement>(".platform-icon img, .icon-square img")?.src;
        const footer = textContent(card.querySelector(".update-footer, .header-content p, .platform-time"));
        const items = Array.from(card.querySelectorAll<HTMLAnchorElement>(".list-item, .list-item-link"))
          .slice(0, 10)
          .map((item, index) => ({
            rank: Number(item.dataset.rank) || Number(textContent(item.querySelector(".list-number"))) || index + 1,
            title: textContent(item.querySelector(".list-text")) || textContent(item.querySelector("span")),
            url: item.href
          }))
          .filter((item) => item.title && item.url);

        if (!name || items.length === 0) {
          return null;
        }

        const category = normalizeCategory(categoryElement?.getAttribute("data-filter") ?? null);
        const source: HotSource = {
          id: sourceId(`${category}-${name}`),
          name,
          category,
          updatedAt: footer,
          items
        };

        if (iconUrl) {
          source.iconUrl = iconUrl;
        }

        return source;
      })
      .filter((source): source is HotSource => source !== null)
  )));
}

export function getRebangFetchUrl(path = ""): string {
  if (typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname)) {
    return `/hot-proxy/rebang/${path}`.replace(/\/$/, "");
  }

  return new URL(path, REBANG_URL).toString();
}

export async function fetchDomesticHotSources(fetchUrl = getRebangFetchUrl()): Promise<HotSource[]> {
  const fetchChannel = async (url: string) => {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`热搜读取失败：${response.status}`);
    }

    return parseRebangHtml(await response.text());
  };

  const sourceGroups =
    fetchUrl === getRebangFetchUrl()
      ? (await Promise.allSettled(REBANG_CHANNELS.map((channel) => fetchChannel(getRebangFetchUrl(channel.path)))))
          .filter((result): result is PromiseFulfilledResult<HotSource[]> => result.status === "fulfilled")
          .map((result) => result.value)
      : [await fetchChannel(fetchUrl)];

  const sources = uniqueSources(sourceGroups.flat());

  if (sources.length === 0) {
    throw new Error("热搜数据为空");
  }

  return sources;
}

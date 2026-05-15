export const REBANG_URL = "https://rebang.open2hub.com/";

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

export function parseRebangHtml(html: string): HotSource[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const cards = Array.from(document.querySelectorAll("section.card"));

  return sortSources(
    cards
      .map((card): HotSource | null => {
        const name = textContent(card.querySelector(".platform-name-span"));
        const iconUrl = card.querySelector<HTMLImageElement>(".platform-icon img")?.src;
        const footer = textContent(card.querySelector(".update-footer"));
        const items = Array.from(card.querySelectorAll<HTMLAnchorElement>(".list-item"))
          .slice(0, 10)
          .map((item, index) => ({
            rank: Number(item.dataset.rank) || index + 1,
            title: textContent(item.querySelector("span")),
            url: item.href
          }))
          .filter((item) => item.title && item.url);

        if (!name || items.length === 0) {
          return null;
        }

        const source: HotSource = {
          id: sourceId(name),
          name,
          category: normalizeCategory(card.getAttribute("data-filter")),
          updatedAt: footer,
          items
        };

        if (iconUrl) {
          source.iconUrl = iconUrl;
        }

        return source;
      })
      .filter((source): source is HotSource => source !== null)
  );
}

export function getRebangFetchUrl(): string {
  if (typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname)) {
    return "/hot-proxy/rebang";
  }

  return REBANG_URL;
}

export async function fetchDomesticHotSources(fetchUrl = getRebangFetchUrl()): Promise<HotSource[]> {
  const response = await fetch(fetchUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`热搜读取失败：${response.status}`);
  }

  const sources = parseRebangHtml(await response.text());

  if (sources.length === 0) {
    throw new Error("热搜数据为空");
  }

  return sources;
}

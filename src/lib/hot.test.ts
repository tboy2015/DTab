import { describe, expect, it, vi } from "vitest";
import { fetchDomesticHotSources, getRebangFetchUrl, parseRebangHtml } from "./hot";

const sampleHtml = `
  <section class="card" data-filter="娱乐">
    <div class="platform-name">
      <span class="platform-icon"><img src="https://rebang.open2hub.com/douyin.jpg"></span>
      <span class="platform-name-span">抖音</span>
    </div>
    <ul class="list">
      <a href="https://so.douyin.com/search/a" class="list-item" data-rank="1"><span>第一条热搜</span></a>
      <a href="https://so.douyin.com/search/b" class="list-item" data-rank="2"><span>第二条热搜</span></a>
    </ul>
    <span class="update-footer">娱乐 / 更新于 15:10</span>
  </section>
  <section class="card" data-filter="综合">
    <span class="platform-name-span">微博</span>
    <ul class="list">
      <a href="https://s.weibo.com/weibo?q=x" class="list-item" data-rank="1"><span>微博热搜</span></a>
    </ul>
    <span class="update-footer">综合 / 更新于 15:12</span>
  </section>
`;

describe("parseRebangHtml", () => {
  it("normalizes rebang cards into hot sources", () => {
    const sources = parseRebangHtml(sampleHtml);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      name: "微博",
      category: "综合",
      updatedAt: "综合 / 更新于 15:12"
    });
    expect(sources[1].items[0]).toMatchObject({
      rank: 1,
      title: "第一条热搜",
      url: "https://so.douyin.com/search/a"
    });
  });

  it("parses the current rebang card markup", () => {
    const sources = parseRebangHtml(`
      <section class="card" data-filter="娱乐">
        <div class="card-header">
          <div class="icon-square">
            <img src="https://rebang.open2hub.com/425.jpg">
          </div>
          <div class="header-content">
            <h3>抖音</h3>
            <p>半小时内更新</p>
          </div>
        </div>
        <div class="list-container">
          <a href="https://so.douyin.com/s?keyword=a" class="list-item">
            <span class="list-number">1</span>
            <span class="list-text">第一条热搜</span>
          </a>
          <a href="https://so.douyin.com/s?keyword=b" class="list-item">
            <span class="list-number">2</span>
            <span class="list-text">第二条热搜</span>
          </a>
        </div>
      </section>
    `);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "抖音",
      category: "娱乐",
      iconUrl: "https://rebang.open2hub.com/425.jpg",
      updatedAt: "半小时内更新"
    });
    expect(sources[0].items[0]).toMatchObject({
      rank: 1,
      title: "第一条热搜",
      url: "https://so.douyin.com/s?keyword=a"
    });
  });

  it("parses the latest rebang card markup", () => {
    const sources = parseRebangHtml(`
      <div class="col-12 col-md-6 col-xl-4" data-filter="科技" role="listitem">
        <div class="card-rebang">
          <div class="card-header-rebang d-flex align-items-center gap-2">
            <div class="icon-square">
              <img src="https://top.open2hub.com/425.jpg" loading="lazy" decoding="async" alt="" />
            </div>
            <div class="d-flex flex-column min-w-0 flex-grow-1">
              <h3 class="platform-title">IT之家</h3>
              <p class="platform-time">十分钟内更新 - 热榜</p>
            </div>
          </div>
          <div class="list-container">
            <a class="list-item-link" target="_blank" href="https://www.ithome.com/0/123/456.htm" rel="noopener noreferrer">
              <span class="list-number">1</span>
              <span class="list-text">新版第一条热搜</span>
            </a>
            <a class="list-item-link" target="_blank" href="https://www.ithome.com/0/123/457.htm" rel="noopener noreferrer">
              <span class="list-number">2</span>
              <span class="list-text">新版第二条热搜</span>
            </a>
          </div>
        </div>
      </div>
    `);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "IT之家",
      category: "科技",
      iconUrl: "https://top.open2hub.com/425.jpg",
      updatedAt: "十分钟内更新 - 热榜"
    });
    expect(sources[0].items[0]).toMatchObject({
      rank: 1,
      title: "新版第一条热搜",
      url: "https://www.ithome.com/0/123/456.htm"
    });
  });

  it("keeps the primary board when a platform has duplicate boards", () => {
    const sources = parseRebangHtml(`
      <div class="col-12 col-md-6 col-xl-4" data-filter="娱乐" role="listitem">
        <div class="card-rebang">
          <h3 class="platform-title">哔哩哔哩</h3>
          <p class="platform-time">半小时内更新 - 综合热门</p>
          <div class="list-container">
            <a class="list-item-link" target="_blank" href="https://www.bilibili.com/a" rel="noopener noreferrer">
              <span class="list-number">1</span>
              <span class="list-text">第一条热搜</span>
            </a>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6 col-xl-4" data-filter="娱乐" role="listitem">
        <div class="card-rebang">
          <h3 class="platform-title">哔哩哔哩</h3>
          <p class="platform-time">一小时内更新 - 动画</p>
          <div class="list-container">
            <a class="list-item-link" target="_blank" href="https://www.bilibili.com/b" rel="noopener noreferrer">
              <span class="list-number">1</span>
              <span class="list-text">第二条热搜</span>
            </a>
          </div>
        </div>
      </div>
    `);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "哔哩哔哩",
      updatedAt: "半小时内更新 - 综合热门"
    });
  });
});

describe("getRebangFetchUrl", () => {
  it("uses the vite proxy on localhost", () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });

    expect(getRebangFetchUrl()).toBe("/hot-proxy/rebang");
    expect(getRebangFetchUrl("channel/news")).toBe("/hot-proxy/rebang/channel/news");

    vi.unstubAllGlobals();
  });
});

describe("fetchDomesticHotSources", () => {
  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchDomesticHotSources("https://example.com")).rejects.toThrow("热搜读取失败");

    vi.unstubAllGlobals();
  });

  it("loads all rebang channels by default", async () => {
    vi.stubGlobal("window", { location: { hostname: "app.example" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        text: async () => `
          <div class="col-12 col-md-6 col-xl-4" data-filter="${url.includes("news") ? "新闻" : "综合"}" role="listitem">
            <div class="card-rebang">
              <div class="card-header-rebang d-flex align-items-center gap-2">
                <div class="d-flex flex-column min-w-0 flex-grow-1">
                  <h3 class="platform-title">${url.includes("news") ? "腾讯新闻" : "微博"}</h3>
                  <p class="platform-time">半小时内更新</p>
                </div>
              </div>
              <div class="list-container">
                <a class="list-item-link" target="_blank" href="https://example.com/${encodeURIComponent(url)}" rel="noopener noreferrer">
                  <span class="list-number">1</span>
                  <span class="list-text">频道热搜</span>
                </a>
              </div>
            </div>
          </div>
        `
      }))
    );

    const sources = await fetchDomesticHotSources();

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(sources.some((source) => source.category === "综合")).toBe(true);
    expect(sources.some((source) => source.category === "新闻")).toBe(true);

    vi.unstubAllGlobals();
  });

  it("keeps successful channels when one rebang channel fails", async () => {
    vi.stubGlobal("window", { location: { hostname: "app.example" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("finance")) {
          return { ok: false, status: 502, text: async (): Promise<string> => "" };
        }

        return {
          ok: true,
          text: async (): Promise<string> => `
            <div class="col-12 col-md-6 col-xl-4" data-filter="综合" role="listitem">
              <div class="card-rebang">
                <h3 class="platform-title">微博</h3>
                <div class="list-container">
                  <a class="list-item-link" target="_blank" href="https://example.com" rel="noopener noreferrer">
                    <span class="list-number">1</span>
                    <span class="list-text">频道热搜</span>
                  </a>
                </div>
              </div>
            </div>
          `
        };
      })
    );

    const sources = await fetchDomesticHotSources();

    expect(sources.length).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });
});

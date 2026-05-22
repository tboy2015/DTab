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
  it.skipIf(typeof DOMParser === "undefined")("normalizes rebang cards into hot sources", () => {
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

  it.skipIf(typeof DOMParser === "undefined")("parses the current rebang card markup", () => {
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
});

describe("getRebangFetchUrl", () => {
  it("uses the vite proxy on localhost", () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });

    expect(getRebangFetchUrl()).toBe("/hot-proxy/rebang");

    vi.unstubAllGlobals();
  });
});

describe("fetchDomesticHotSources", () => {
  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchDomesticHotSources("https://example.com")).rejects.toThrow("热搜读取失败");

    vi.unstubAllGlobals();
  });
});

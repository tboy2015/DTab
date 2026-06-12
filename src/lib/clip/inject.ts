/**
 * 注入目标页执行的提取函数。
 *
 * 重要约束：本函数会被 chrome.scripting.executeScript 通过 `func` 序列化后
 * 在页面的隔离环境里运行，**不能引用任何模块作用域的变量或 import**。
 * 它依赖的 Readability / TurndownService / turndownPluginGfm 由前置注入的
 * vendor 脚本挂在全局上（见 serviceWorker 的 files 注入）。
 */

export interface InjectedClip {
  title: string;
  markdown: string;
  url: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  extracted: boolean;
}

export function extractClip(): InjectedClip {
  const g = self as unknown as {
    Readability: new (doc: Document, opts?: Record<string, unknown>) => {
      parse: () => {
        title?: string;
        content?: string;
        byline?: string;
        siteName?: string;
        excerpt?: string;
      } | null;
    };
    TurndownService: new (opts?: Record<string, unknown>) => {
      use: (plugin: unknown) => void;
      turndown: (html: string | HTMLElement) => string;
    };
    turndownPluginGfm: { gfm: unknown };
  };

  const turndown = new g.TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*"
  });
  turndown.use(g.turndownPluginGfm.gfm);

  const pageTitle = document.title || location.hostname;

  // Readability 会修改传入的 document，因此用克隆体解析
  let article: {
    title?: string;
    content?: string;
    byline?: string;
    siteName?: string;
    excerpt?: string;
  } | null = null;
  try {
    const docClone = document.cloneNode(true) as Document;
    article = new g.Readability(docClone).parse();
  } catch {
    article = null;
  }

  if (article && article.content && article.content.trim().length > 0) {
    return {
      title: (article.title || pageTitle).trim(),
      markdown: turndown.turndown(article.content),
      url: location.href,
      byline: article.byline?.trim() || undefined,
      siteName: article.siteName?.trim() || undefined,
      excerpt: article.excerpt?.trim() || undefined,
      extracted: true
    };
  }

  // 兜底：直接转换 body（SPA / 付费墙 / 提取失败时）
  const bodyHtml = document.body ? document.body.innerHTML : "";
  return {
    title: pageTitle.trim(),
    markdown: turndown.turndown(bodyHtml),
    url: location.href,
    extracted: false
  };
}

/**
 * 网页剪藏：纯函数部分（front-matter 拼装、文件名清洗、下载 URL 生成）。
 * 这些函数不依赖 DOM，可在 service worker 中运行，并便于单测。
 */

export interface ClipResult {
  /** 文章标题，提取失败时为页面 title */
  title: string;
  /** 转换后的正文 markdown */
  markdown: string;
  /** 来源地址 */
  url: string;
  /** 作者 / 署名，可空 */
  byline?: string;
  /** 站点名，可空 */
  siteName?: string;
  /** 摘要，可空 */
  excerpt?: string;
  /** Readability 是否成功提取正文；false 表示走了 body 兜底 */
  extracted: boolean;
}

/** 转义 YAML 标量里的双引号与反斜杠，统一用双引号包裹保证安全 */
function yamlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** 生成 YAML front-matter。`date` 形如 2026-06-12（本地日期） */
export function buildFrontmatter(meta: ClipResult, date: string): string {
  const lines: string[] = ["---", `title: ${yamlString(meta.title)}`, `source: ${yamlString(meta.url)}`];
  if (meta.byline) {
    lines.push(`author: ${yamlString(meta.byline)}`);
  }
  if (meta.siteName) {
    lines.push(`site: ${yamlString(meta.siteName)}`);
  }
  lines.push(`clipped: ${date}`, "---");
  return lines.join("\n");
}

/** 拼出完整的 .md 文档：front-matter + 一级标题 + 正文 */
export function buildDocument(meta: ClipResult, date: string): string {
  const frontmatter = buildFrontmatter(meta, date);
  const body = meta.markdown.trim();
  return `${frontmatter}\n\n# ${meta.title}\n\n${body}\n`;
}

/**
 * 把标题清洗成安全文件名（不含扩展名）。
 * 去掉控制字符、文件系统非法字符与路径分隔符，折叠空白，限制长度。
 */
export function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/\p{Cc}/gu, " ") // 控制字符
    .replace(/[<>:"/\\|?*]+/g, " ") // 文件系统非法字符（含路径分隔符）
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, ""); // 结尾的点和空格在 Windows 上不合法
  const fallback = cleaned.length > 0 ? cleaned : "untitled";
  return fallback.slice(0, 80);
}

/** 生成「2026-06-12-标题.md」形式的下载文件名 */
export function buildFilename(title: string, date: string): string {
  return `${date}-${sanitizeFilename(title)}.md`;
}

/** 把文本编码为可供 chrome.downloads 使用的 data URL（worker 中无法用 createObjectURL） */
export function toDataUrl(content: string): string {
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
}

/** 取本地日期 YYYY-MM-DD */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

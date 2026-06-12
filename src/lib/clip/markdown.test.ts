import { describe, expect, it } from "vitest";
import {
  buildDocument,
  buildFilename,
  buildFrontmatter,
  localDate,
  sanitizeFilename,
  toDataUrl,
  type ClipResult
} from "./markdown";

const baseMeta: ClipResult = {
  title: "示例文章",
  markdown: "正文内容",
  url: "https://example.com/post",
  extracted: true
};

describe("sanitizeFilename", () => {
  it("去除路径分隔符与非法字符", () => {
    expect(sanitizeFilename('a/b:c*d?"e')).toBe("a b c d e");
  });

  it("折叠空白并裁剪首尾", () => {
    expect(sanitizeFilename("  hello   world  ")).toBe("hello world");
  });

  it("去掉结尾的点和空格", () => {
    expect(sanitizeFilename("report...")).toBe("report");
  });

  it("空标题回退为 untitled", () => {
    expect(sanitizeFilename("///")).toBe("untitled");
  });

  it("限制最大长度为 80", () => {
    expect(sanitizeFilename("x".repeat(200))).toHaveLength(80);
  });
});

describe("buildFilename", () => {
  it("拼出日期前缀与 .md 扩展名", () => {
    expect(buildFilename("我的笔记", "2026-06-12")).toBe("2026-06-12-我的笔记.md");
  });
});

describe("buildFrontmatter", () => {
  it("包含必填字段", () => {
    const fm = buildFrontmatter(baseMeta, "2026-06-12");
    expect(fm).toContain('title: "示例文章"');
    expect(fm).toContain('source: "https://example.com/post"');
    expect(fm).toContain("clipped: 2026-06-12");
    expect(fm.startsWith("---")).toBe(true);
    expect(fm.endsWith("---")).toBe(true);
  });

  it("可选字段缺省时不输出", () => {
    const fm = buildFrontmatter(baseMeta, "2026-06-12");
    expect(fm).not.toContain("author:");
    expect(fm).not.toContain("site:");
  });

  it("可选字段存在时输出", () => {
    const fm = buildFrontmatter({ ...baseMeta, byline: "张三", siteName: "Example" }, "2026-06-12");
    expect(fm).toContain('author: "张三"');
    expect(fm).toContain('site: "Example"');
  });

  it("转义标题中的双引号", () => {
    const fm = buildFrontmatter({ ...baseMeta, title: 'a"b' }, "2026-06-12");
    expect(fm).toContain('title: "a\\"b"');
  });
});

describe("buildDocument", () => {
  it("组合 front-matter、标题与正文", () => {
    const doc = buildDocument(baseMeta, "2026-06-12");
    expect(doc).toContain("# 示例文章");
    expect(doc).toContain("正文内容");
    expect(doc.indexOf("---")).toBeLessThan(doc.indexOf("# 示例文章"));
  });
});

describe("toDataUrl", () => {
  it("生成 markdown data URL", () => {
    expect(toDataUrl("# Hi")).toBe("data:text/markdown;charset=utf-8,%23%20Hi");
  });
});

describe("localDate", () => {
  it("格式化为 YYYY-MM-DD", () => {
    expect(localDate(new Date(2026, 5, 9))).toBe("2026-06-09");
  });
});

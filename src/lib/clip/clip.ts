/**
 * 网页剪藏编排：在 service worker 中调用。
 * 负责向目标页注入 vendor 库与提取函数，拿到 markdown 后拼装文档并下载。
 */
import { extractClip, type InjectedClip } from "./inject";
import { buildDocument, buildFilename, localDate, toDataUrl, type ClipResult } from "./markdown";

/** 前置注入的第三方库（位于扩展根目录 vendor/ 下，由 public/vendor 打包而来） */
const VENDOR_FILES = ["vendor/Readability.js", "vendor/turndown.js", "vendor/turndown-plugin-gfm.js"];

/** 不支持注入的页面，提前拦截给出清晰提示 */
function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) {
    return true;
  }
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chromewebstore.google.com/") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

/** 在工具栏图标上短暂显示反馈徽标（无需通知权限） */
async function flashBadge(tabId: number, text: string, color: string): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId, text: "" });
    }, 2500);
  } catch {
    // action 不可用时静默忽略
  }
}

/**
 * 剪藏指定标签页为 Markdown 并触发下载。
 * @returns 成功返回生成的文件名，失败抛出带中文说明的错误。
 */
export async function clipTabToMarkdown(tab: chrome.tabs.Tab): Promise<string> {
  const tabId = tab.id;
  if (typeof tabId !== "number") {
    throw new Error("无法获取当前标签页");
  }
  if (isRestrictedUrl(tab.url)) {
    await flashBadge(tabId, "×", "#dc2626");
    throw new Error("当前页面不支持剪藏（浏览器内置页或商店页）");
  }

  let injected: InjectedClip;
  try {
    // 1) 注入第三方库
    await chrome.scripting.executeScript({ target: { tabId }, files: VENDOR_FILES });
    // 2) 注入提取函数并取回结果
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractClip });
    const result = results[0]?.result as InjectedClip | undefined;
    if (!result) {
      throw new Error("提取失败");
    }
    injected = result;
  } catch (error) {
    await flashBadge(tabId, "×", "#dc2626");
    const reason = error instanceof Error ? error.message : "未知错误";
    throw new Error(`无法读取页面内容：${reason}`);
  }

  const meta: ClipResult = { ...injected };
  const date = localDate();
  const document = buildDocument(meta, date);
  const filename = buildFilename(meta.title, date);

  try {
    await chrome.downloads.download({
      url: toDataUrl(document),
      filename,
      saveAs: false
    });
  } catch (error) {
    await flashBadge(tabId, "×", "#dc2626");
    const reason = error instanceof Error ? error.message : "未知错误";
    throw new Error(`下载失败：${reason}`);
  }

  await flashBadge(tabId, injected.extracted ? "✓" : "≈", injected.extracted ? "#16a34a" : "#d97706");
  return filename;
}

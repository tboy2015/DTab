import { clipTabToMarkdown } from "../lib/clip/clip";
import { refreshDashboard } from "../lib/refresh";
import { readDashboardStorage } from "../lib/storage";
import { translateTextsToChinese } from "../lib/translation";
import {
  SIDE_PANEL_PENDING_TRANSLATION_KEY,
  type AppStorage,
  type PendingSidePanelTranslation,
  type RuntimeMessage,
  type RuntimeResponse,
  type TranslationTargetLanguage
} from "../lib/types";

const ALARM_NAMES = ["refresh-daily", "refresh-weekly", "refresh-monthly"] as const;

const CLIP_MENU_ID = "clip-page-to-markdown";
const TRANSLATE_MENU_ID = "translate-page-to-chinese";
const RETRANSLATE_MENU_ID = "retranslate-page-to-chinese";
const TRANSLATE_SELECTION_MENU_ID = "translate-selection-to-chinese";
const SIDEPANEL_MENU_ID = "open-translate-sidepanel";
const TRANSLATE_BATCH_LIMIT = 160;

/** 注册右键菜单入口 */
function createClipMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CLIP_MENU_ID,
      title: "保存为 Markdown",
      contexts: ["page", "selection", "action"]
    });
    chrome.contextMenus.create({
      id: TRANSLATE_MENU_ID,
      title: "翻译为简体中文",
      contexts: ["page", "action"]
    });
    chrome.contextMenus.create({
      id: RETRANSLATE_MENU_ID,
      title: "重新翻译当前页",
      contexts: ["page", "action"]
    });
    chrome.contextMenus.create({
      id: TRANSLATE_SELECTION_MENU_ID,
      title: "翻译选中文本",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: SIDEPANEL_MENU_ID,
      title: "打开翻译侧边栏",
      contexts: ["page", "action"]
    });
  });
}

/** 剪藏当前标签页，失败时打印日志（徽标反馈在 clipTabToMarkdown 内处理） */
function runClip(tab: chrome.tabs.Tab | undefined): void {
  if (!tab) {
    return;
  }
  clipTabToMarkdown(tab).catch((error) => {
    console.error("[clip] 保存 Markdown 失败:", error instanceof Error ? error.message : error);
  });
}

function runPageTranslation(tab: chrome.tabs.Tab | undefined): void {
  if (!tab?.id) {
    return;
  }

  chrome.tabs
    .sendMessage(tab.id, { type: "TOGGLE_PAGE_TRANSLATION" } satisfies RuntimeMessage)
    .catch((error) => {
      console.warn("[translate] 触发页面翻译失败:", error instanceof Error ? error.message : error);
    });
}

function retranslatePage(tab: chrome.tabs.Tab | undefined): void {
  if (!tab?.id) {
    return;
  }

  chrome.tabs
    .sendMessage(tab.id, { type: "RETRANSLATE_PAGE" } satisfies RuntimeMessage)
    .catch((error) => {
      console.warn("[translate] 重新翻译页面失败:", error instanceof Error ? error.message : error);
    });
}

async function prepareTranslateSidePanel(tabId?: number): Promise<void> {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }

  await chrome.sidePanel.setOptions({
    ...(typeof tabId === "number" ? { tabId } : {}),
    path: "sidepanel.html",
    enabled: true
  });
}

async function openTranslateSidePanel(tab: chrome.tabs.Tab | undefined): Promise<void> {
  const tabId = tab?.id;

  if (typeof tabId !== "number" || !chrome.sidePanel?.open) {
    throw new Error("当前 Chrome 不支持侧边栏，或没有可用标签页");
  }

  await chrome.sidePanel.open({ tabId });
}

function translateSelectionInSidePanel(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined
): void {
  const text = info.selectionText?.trim();

  openTranslateSidePanel(tab).catch((error) => {
    console.warn("[sidepanel] 打开翻译侧边栏失败:", error instanceof Error ? error.message : error);
  });

  if (!text) {
    return;
  }

  const pendingTranslation: PendingSidePanelTranslation = {
    text,
    updatedAt: new Date().toISOString()
  };

  chrome.storage.local
    .set({
      [SIDE_PANEL_PENDING_TRANSLATION_KEY]: pendingTranslation
    })
    .catch((error) => {
      console.warn("[translate] 写入选中文本失败:", error instanceof Error ? error.message : error);
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CLIP_MENU_ID) {
    runClip(tab);
  }

  if (info.menuItemId === TRANSLATE_MENU_ID) {
    runPageTranslation(tab);
  }

  if (info.menuItemId === RETRANSLATE_MENU_ID) {
    retranslatePage(tab);
  }

  if (info.menuItemId === TRANSLATE_SELECTION_MENU_ID) {
    translateSelectionInSidePanel(info, tab);
  }

  if (info.menuItemId === SIDEPANEL_MENU_ID) {
    openTranslateSidePanel(tab).catch((error) => {
      console.warn("[sidepanel] 打开翻译侧边栏失败:", error instanceof Error ? error.message : error);
    });
  }
});

// 点击工具栏图标也触发剪藏
chrome.action.onClicked.addListener((tab) => {
  runClip(tab);
});

function createAlarms() {
  chrome.alarms.create("refresh-daily", {
    periodInMinutes: 60 * 24
  });
  chrome.alarms.create("refresh-weekly", {
    periodInMinutes: 60 * 24 * 7
  });
  chrome.alarms.create("refresh-monthly", {
    periodInMinutes: 60 * 24 * 30
  });
}

async function translateTexts(
  texts: string[],
  targetLanguage: TranslationTargetLanguage = "zh-CN"
): Promise<string[]> {
  const limitedTexts = texts.slice(0, TRANSLATE_BATCH_LIMIT);

  try {
    return await translateTextsToChinese(limitedTexts, targetLanguage);
  } catch (error) {
    console.warn("[translate] 批量文本翻译失败:", error instanceof Error ? error.message : error);
    return new Array<string>(limitedTexts.length).fill("");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createAlarms();
  createClipMenu();
  void prepareTranslateSidePanel();
  void refreshDashboard(false);
});

chrome.runtime.onStartup.addListener(() => {
  createAlarms();
  createClipMenu();
  void prepareTranslateSidePanel();
  void refreshDashboard(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (ALARM_NAMES.includes(alarm.name as (typeof ALARM_NAMES)[number])) {
    void refreshDashboard(false);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeResponse<AppStorage | string[] | null>) => void
  ) => {
    if (message.type === "GET_DASHBOARD") {
      readDashboardStorage()
        .then((storage) => sendResponse({ ok: true, data: storage }))
        .catch((error) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "读取缓存失败" })
        );
      return true;
    }

    if (message.type === "REFRESH_DASHBOARD") {
      refreshDashboard(message.force)
        .then((storage) => sendResponse({ ok: true, data: storage }))
        .catch((error) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "刷新失败" })
        );
      return true;
    }

    if (message.type === "TRANSLATE_TEXTS") {
      translateTexts(message.texts, message.targetLanguage)
        .then((translations) => sendResponse({ ok: true, data: translations }))
        .catch((error) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "翻译失败" })
        );
      return true;
    }

    if (message.type === "OPEN_TRANSLATE_SIDE_PANEL") {
      openTranslateSidePanel(_sender.tab)
        .then(() => sendResponse({ ok: true, data: null }))
        .catch((error) => {
          const message = error instanceof Error ? error.message : "打开侧边栏失败";
          console.warn("[sidepanel] 打开翻译侧边栏失败:", message);
          sendResponse({ ok: false, error: message });
        });
      return true;
    }

    return false;
  }
);

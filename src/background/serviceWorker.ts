import { clipTabToMarkdown } from "../lib/clip/clip";
import { refreshDashboard } from "../lib/refresh";
import { readDashboardStorage } from "../lib/storage";
import type { RuntimeMessage, RuntimeResponse } from "../lib/types";

const ALARM_NAMES = ["refresh-daily", "refresh-weekly", "refresh-monthly"] as const;

const CLIP_MENU_ID = "clip-page-to-markdown";

/** 注册右键菜单入口 */
function createClipMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CLIP_MENU_ID,
      title: "保存为 Markdown",
      contexts: ["page", "selection", "action"]
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CLIP_MENU_ID) {
    runClip(tab);
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

chrome.runtime.onInstalled.addListener(() => {
  createAlarms();
  createClipMenu();
  void refreshDashboard(false);
});

chrome.runtime.onStartup.addListener(() => {
  createAlarms();
  createClipMenu();
  void refreshDashboard(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (ALARM_NAMES.includes(alarm.name as (typeof ALARM_NAMES)[number])) {
    void refreshDashboard(false);
  }
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse: (response: RuntimeResponse) => void) => {
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

    return false;
  }
);

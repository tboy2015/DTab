import { refreshDashboard } from "../lib/refresh";
import { readDashboardStorage } from "../lib/storage";
import type { RuntimeMessage, RuntimeResponse } from "../lib/types";

const ALARM_NAMES = ["refresh-daily", "refresh-weekly", "refresh-monthly"] as const;

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
  void refreshDashboard(false);
});

chrome.runtime.onStartup.addListener(() => {
  createAlarms();
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

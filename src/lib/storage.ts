import { createEmptyStorage, mergeStorage } from "./defaults";
import type { AppStorage } from "./types";

const STORAGE_KEY = "githubTrendsDashboard";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function readDashboardStorage(): Promise<AppStorage> {
  const empty = createEmptyStorage();

  if (!hasChromeStorage()) {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return mergeStorage(empty, raw ? JSON.parse(raw) : undefined);
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return mergeStorage(empty, stored[STORAGE_KEY]);
}

export async function writeDashboardStorage(storage: AppStorage): Promise<void> {
  if (!hasChromeStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

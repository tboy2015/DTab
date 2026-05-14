import type { DigestKey } from "./types";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

interface ShanghaiParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function getShanghaiParts(date: Date): ShanghaiParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday")
  };
}

function fromShanghaiParts(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isAfterOrEqual(parts: ShanghaiParts, hour: number, minute: number) {
  return parts.hour > hour || (parts.hour === hour && parts.minute >= minute);
}

function nextDaily(now: Date, hour: number, minute: number): string {
  const parts = getShanghaiParts(now);
  const dayOffset = isAfterOrEqual(parts, hour, minute) ? 1 : 0;
  return fromShanghaiParts(parts.year, parts.month, parts.day + dayOffset, hour, minute).toISOString();
}

function nextWeeklyMonday(now: Date, hour: number, minute: number): string {
  const parts = getShanghaiParts(now);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const current = weekdays.indexOf(parts.weekday);
  const monday = 1;
  let offset = (monday - current + 7) % 7;

  if (offset === 0 && isAfterOrEqual(parts, hour, minute)) {
    offset = 7;
  }

  return fromShanghaiParts(parts.year, parts.month, parts.day + offset, hour, minute).toISOString();
}

function nextMonthlyDay(now: Date, targetDay: number, hour: number, minute: number): string {
  const parts = getShanghaiParts(now);
  let year = parts.year;
  let month = parts.month;
  const target = Math.min(targetDay, daysInMonth(year, month));

  if (parts.day > target || (parts.day === target && isAfterOrEqual(parts, hour, minute))) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const clampedDay = Math.min(targetDay, daysInMonth(year, month));
  return fromShanghaiParts(year, month, clampedDay, hour, minute).toISOString();
}

export function getNextRefreshSchedule(key: DigestKey, now = new Date()): string {
  switch (key) {
    case "dailyTop10":
      return nextDaily(now, 8, 30);
    case "weeklyTop20":
    case "weeklyDigest":
      return nextWeeklyMonday(now, 8, 0);
    case "monthlyTop30":
      return nextMonthlyDay(now, 1, 8, 0);
    case "monthlyDigest":
      return nextMonthlyDay(now, 30, 8, 0);
  }
}

export function isStale(lastUpdated?: string, maxAgeMs = 1000 * 60 * 60 * 12, now = Date.now()): boolean {
  if (!lastUpdated) {
    return true;
  }

  return now - new Date(lastUpdated).getTime() > maxAgeMs;
}

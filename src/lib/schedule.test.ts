import { describe, expect, it } from "vitest";
import { getNextRefreshSchedule, isStale } from "./schedule";

describe("schedule helpers", () => {
  it("calculates next daily refresh in Asia/Shanghai", () => {
    const beforeRefresh = new Date("2026-05-14T00:20:00.000Z");
    const afterRefresh = new Date("2026-05-14T00:40:00.000Z");

    expect(getNextRefreshSchedule("dailyTop10", beforeRefresh)).toBe("2026-05-14T00:30:00.000Z");
    expect(getNextRefreshSchedule("dailyTop10", afterRefresh)).toBe("2026-05-15T00:30:00.000Z");
  });

  it("calculates next weekly Monday refresh", () => {
    const thursday = new Date("2026-05-14T07:00:00.000Z");

    expect(getNextRefreshSchedule("weeklyTop20", thursday)).toBe("2026-05-18T00:00:00.000Z");
  });

  it("calculates monthly schedules", () => {
    const may = new Date("2026-05-14T07:00:00.000Z");

    expect(getNextRefreshSchedule("monthlyTop30", may)).toBe("2026-06-01T00:00:00.000Z");
    expect(getNextRefreshSchedule("monthlyDigest", may)).toBe("2026-05-30T00:00:00.000Z");
  });

  it("detects stale timestamps", () => {
    expect(isStale(undefined)).toBe(true);
    expect(isStale("2026-05-14T00:00:00.000Z", 1000, new Date("2026-05-14T00:00:02.000Z").getTime())).toBe(
      true
    );
  });
});

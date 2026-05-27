import { Check, Clipboard, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Unit = "s" | "ms";

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function TimestampTool() {
  const [now, setNow] = useState(() => Date.now());
  const [unit, setUnit] = useState<Unit>("s");
  const [tsInput, setTsInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // tick clock
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  type TsResult =
    | null
    | { kind: "error"; error: string }
    | { kind: "ok"; local: string; utc: string; iso: string };
  type DateResult =
    | null
    | { kind: "error"; error: string }
    | { kind: "ok"; ms: number; s: number };

  const parsedFromTs: TsResult = (() => {
    if (!tsInput.trim()) return null;
    const n = Number(tsInput.trim());
    if (!Number.isFinite(n)) return { kind: "error", error: "请输入数字" };
    const ms = unit === "s" ? n * 1000 : n;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { kind: "error", error: "无效的时间戳" };
    return { kind: "ok", local: formatDate(d), utc: formatUtc(d), iso: d.toISOString() };
  })();

  const parsedFromDate: DateResult = (() => {
    if (!dateInput.trim()) return null;
    const d = new Date(dateInput.trim());
    if (Number.isNaN(d.getTime())) return { kind: "error", error: "无法解析此日期，请用 ISO 或 YYYY-MM-DD HH:mm:ss 格式" };
    const ms = d.getTime();
    return { kind: "ok", ms, s: Math.floor(ms / 1000) };
  })();

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const CopyChip = ({ value, k }: { value: string; k: string }) => (
    <button className="copy-chip" onClick={() => void copy(value, k)} type="button" title="复制">
      {copied === k ? <Check size={13} /> : <Clipboard size={13} />}
    </button>
  );

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Utility</span>
          <h2>时间戳转换</h2>
        </div>
        <div className="json-tool-actions">
          <div className="segmented">
            <button className={unit === "s" ? "active" : ""} onClick={() => setUnit("s")} type="button">
              秒 (s)
            </button>
            <button className={unit === "ms" ? "active" : ""} onClick={() => setUnit("ms")} type="button">
              毫秒 (ms)
            </button>
          </div>
        </div>
      </div>

      <div className="ts-body">
        <section className="ts-section">
          <div className="ts-section-title">当前时间</div>
          <div className="ts-row">
            <span className="ts-label">秒</span>
            <code className="ts-value">{Math.floor(now / 1000)}</code>
            <CopyChip value={String(Math.floor(now / 1000))} k="cur-s" />
          </div>
          <div className="ts-row">
            <span className="ts-label">毫秒</span>
            <code className="ts-value">{now}</code>
            <CopyChip value={String(now)} k="cur-ms" />
          </div>
          <div className="ts-row">
            <span className="ts-label">本地</span>
            <code className="ts-value">{formatDate(new Date(now))}</code>
            <CopyChip value={formatDate(new Date(now))} k="cur-local" />
          </div>
          <div className="ts-row">
            <span className="ts-label">UTC</span>
            <code className="ts-value">{formatUtc(new Date(now))}</code>
            <CopyChip value={formatUtc(new Date(now))} k="cur-utc" />
          </div>
          <button className="json-btn json-btn-ghost ts-refresh" onClick={() => setNow(Date.now())} type="button">
            <RefreshCw size={14} />
            刷新
          </button>
        </section>

        <section className="ts-section">
          <div className="ts-section-title">时间戳 → 日期</div>
          <input
            className="ts-input"
            onChange={(e) => setTsInput(e.target.value)}
            placeholder={unit === "s" ? "例如 1700000000" : "例如 1700000000000"}
            value={tsInput}
          />
          {parsedFromTs?.kind === "error" && (
            <div className="ts-error">{parsedFromTs.error}</div>
          )}
          {parsedFromTs?.kind === "ok" && (
            <>
              <div className="ts-row">
                <span className="ts-label">本地</span>
                <code className="ts-value">{parsedFromTs.local}</code>
                <CopyChip value={parsedFromTs.local} k="from-local" />
              </div>
              <div className="ts-row">
                <span className="ts-label">UTC</span>
                <code className="ts-value">{parsedFromTs.utc}</code>
                <CopyChip value={parsedFromTs.utc} k="from-utc" />
              </div>
              <div className="ts-row">
                <span className="ts-label">ISO</span>
                <code className="ts-value">{parsedFromTs.iso}</code>
                <CopyChip value={parsedFromTs.iso} k="from-iso" />
              </div>
            </>
          )}
        </section>

        <section className="ts-section">
          <div className="ts-section-title">日期 → 时间戳</div>
          <input
            className="ts-input"
            onChange={(e) => setDateInput(e.target.value)}
            placeholder="例如 2025-01-01 12:00:00 或 ISO 字符串"
            value={dateInput}
          />
          {parsedFromDate?.kind === "error" && (
            <div className="ts-error">{parsedFromDate.error}</div>
          )}
          {parsedFromDate?.kind === "ok" && (
            <>
              <div className="ts-row">
                <span className="ts-label">秒</span>
                <code className="ts-value">{parsedFromDate.s}</code>
                <CopyChip value={String(parsedFromDate.s)} k="to-s" />
              </div>
              <div className="ts-row">
                <span className="ts-label">毫秒</span>
                <code className="ts-value">{parsedFromDate.ms}</code>
                <CopyChip value={String(parsedFromDate.ms)} k="to-ms" />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

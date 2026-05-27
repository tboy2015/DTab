import { Check, Clipboard, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function uuidv4(): string {
  // Prefer crypto.randomUUID if available
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122 v4
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Format = "default" | "upper" | "nodash" | "brace";

function formatUuid(uuid: string, fmt: Format): string {
  switch (fmt) {
    case "upper":
      return uuid.toUpperCase();
    case "nodash":
      return uuid.replace(/-/g, "");
    case "brace":
      return `{${uuid}}`;
    default:
      return uuid;
  }
}

export function UuidTool() {
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<Format>("default");
  const [list, setList] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const generate = useCallback(() => {
    const safeCount = Math.max(1, Math.min(100, count || 1));
    const next: string[] = [];
    for (let i = 0; i < safeCount; i++) next.push(uuidv4());
    setList(next);
  }, [count]);

  // Initial generation
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const copyAll = useCallback(async () => {
    if (list.length === 0) return;
    const all = list.map((u) => formatUuid(u, format)).join("\n");
    await copy(all, "all");
  }, [list, format, copy]);

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Utility</span>
          <h2>UUID 生成</h2>
        </div>
        <div className="json-tool-actions">
          <div className="segmented">
            <button
              className={format === "default" ? "active" : ""}
              onClick={() => setFormat("default")}
              type="button"
            >
              默认
            </button>
            <button
              className={format === "upper" ? "active" : ""}
              onClick={() => setFormat("upper")}
              type="button"
            >
              大写
            </button>
            <button
              className={format === "nodash" ? "active" : ""}
              onClick={() => setFormat("nodash")}
              type="button"
            >
              无分隔
            </button>
            <button
              className={format === "brace" ? "active" : ""}
              onClick={() => setFormat("brace")}
              type="button"
            >
              花括号
            </button>
          </div>
        </div>
      </div>

      <div className="uuid-body">
        <div className="uuid-controls">
          <label className="uuid-count-label">
            <span>数量</span>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <button className="json-btn json-btn-primary" onClick={generate} type="button">
            <RefreshCw size={15} />
            生成
          </button>
          <button className="json-btn" onClick={() => void copyAll()} type="button" disabled={list.length === 0}>
            {copiedKey === "all" ? <Check size={15} /> : <Clipboard size={15} />}
            {copiedKey === "all" ? "已复制" : "复制全部"}
          </button>
        </div>

        <ul className="uuid-list">
          {list.map((u, i) => {
            const formatted = formatUuid(u, format);
            const key = `${i}-${u}`;
            return (
              <li className="uuid-item" key={key}>
                <code>{formatted}</code>
                <button className="copy-chip" onClick={() => void copy(formatted, key)} type="button" title="复制">
                  {copiedKey === key ? <Check size={13} /> : <Clipboard size={13} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

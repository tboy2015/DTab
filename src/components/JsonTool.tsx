import { Check, Clipboard, Minimize2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type JsonState =
  | { status: "idle" }
  | { status: "formatted"; output: string; stats: JsonStats }
  | { status: "minified"; output: string; stats: JsonStats }
  | { status: "error"; message: string };

interface JsonStats {
  keys: number;
  size: string;
}

function countKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((acc, v) => acc + countKeys(v), 0);
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as object);
    return keys.length + keys.reduce<number>((acc, k) => acc + countKeys((value as Record<string, unknown>)[k]), 0);
  }
  return 0;
}

function buildStats(raw: string): JsonStats {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const keys = countKeys(parsed);
    const bytes = new TextEncoder().encode(raw).length;
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    return { keys, size };
  } catch {
    return { keys: 0, size: "—" };
  }
}

export function JsonTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<JsonState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const format = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input) as unknown;
      const output = JSON.stringify(parsed, null, 2);
      setState({ status: "formatted", output, stats: buildStats(input) });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [input]);

  const minify = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input) as unknown;
      const output = JSON.stringify(parsed);
      setState({ status: "minified", output, stats: buildStats(input) });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [input]);

  const copy = useCallback(async () => {
    const text = state.status === "formatted" || state.status === "minified" ? state.output : input;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [state, input]);

  const clear = useCallback(() => {
    setInput("");
    setState({ status: "idle" });
  }, []);

  const hasOutput = state.status === "formatted" || state.status === "minified";
  const stats = hasOutput ? state.stats : null;

  return (
    <section className="tools-page" aria-label="JSON 工具">
      <div className="panel json-tool-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Utility</span>
            <h2>JSON 格式化</h2>
          </div>
          <div className="json-tool-actions">
            <button className="json-btn json-btn-primary" onClick={format} type="button">
              <Sparkles size={15} />
              格式化
            </button>
            <button className="json-btn" onClick={minify} type="button">
              <Minimize2 size={15} />
              压缩
            </button>
            <button className="json-btn" onClick={() => void copy()} title="复制结果" type="button">
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
              {copied ? "已复制" : "复制"}
            </button>
            <button className="json-btn json-btn-ghost" onClick={clear} title="清空" type="button">
              <RotateCcw size={15} />
              清空
            </button>
          </div>
        </div>

        <div className="json-tool-body">
          <div className="json-pane">
            <div className="json-pane-label">输入</div>
            <textarea
              className="json-textarea"
              onChange={(e) => {
                setInput(e.target.value);
                setState({ status: "idle" });
              }}
              placeholder='粘贴 JSON，例如 {"name":"DTab","version":1}'
              spellCheck={false}
              value={input}
            />
          </div>

          <div className="json-pane">
            <div className="json-pane-label">
              {hasOutput && (
                <span className="json-stats">
                  {state.status === "formatted" ? "已格式化" : "已压缩"} · {stats?.keys} 个键 · {stats?.size}
                </span>
              )}
              {!hasOutput && <span>输出</span>}
            </div>
            {state.status === "error" ? (
              <div className="json-error">
                <span className="json-error-label">解析错误</span>
                <code>{state.message}</code>
              </div>
            ) : (
              <pre
                className={`json-output${hasOutput ? " has-content" : ""}`}
                ref={outputRef}
              >
                {hasOutput ? state.output : <span className="json-placeholder">格式化或压缩后结果显示在此处</span>}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

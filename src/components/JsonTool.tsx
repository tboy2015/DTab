import { Check, ChevronDown, ChevronRight, Clipboard, ListFilter, Minimize2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

type JsonState =
  | { status: "idle" }
  | { status: "formatted"; output: string; stats: JsonStats }
  | { status: "minified"; output: string; stats: JsonStats }
  | { status: "simplified"; output: string; stats: JsonStats }
  | { status: "error"; message: string };

interface JsonStats {
  keys: number;
  size: string;
}

type JsonOutputState = Extract<JsonState, { output: string }>;

interface JsonTreeNodeProps {
  collapsedPaths: Set<string>;
  depth?: number;
  isLast?: boolean;
  label?: string;
  onToggle: (path: string) => void;
  path: string;
  value: unknown;
}

function isOutputState(state: JsonState): state is JsonOutputState {
  return state.status === "formatted" || state.status === "minified" || state.status === "simplified";
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

function simplifyLists(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? [simplifyLists(value[0])] : [];
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, simplifyLists(nestedValue)])
    );
  }
  return value;
}

function getPrimitiveText(value: unknown): string {
  const text = JSON.stringify(value);
  return text ?? String(value);
}

function getPathSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function JsonTreeNode({
  collapsedPaths,
  depth = 0,
  isLast = true,
  label,
  onToggle,
  path,
  value
}: JsonTreeNodeProps) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;
  const isExpandable = isArray || isObject;
  const indentStyle = { paddingLeft: `${depth * 18}px` };
  const suffix = isLast ? "" : ",";

  if (!isExpandable) {
    return (
      <div className="json-tree-line" style={indentStyle}>
        <span className="json-tree-spacer" />
        {label && <span className="json-tree-key">{JSON.stringify(label)}: </span>}
        <span className="json-tree-value">{getPrimitiveText(value)}</span>
        {suffix}
      </div>
    );
  }

  const entries = isArray
    ? value.map((nestedValue, index) => [String(index), nestedValue] as const)
    : Object.entries(value as Record<string, unknown>);
  const collapsed = collapsedPaths.has(path);
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";
  const summary = isArray ? `${entries.length} 项` : `${entries.length} 个键`;

  return (
    <>
      <div className="json-tree-line" style={indentStyle}>
        <button
          aria-label={collapsed ? "展开内容" : "折叠内容"}
          className="json-fold-toggle"
          onClick={() => onToggle(path)}
          type="button"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        {label && <span className="json-tree-key">{JSON.stringify(label)}: </span>}
        <button className="json-bracket-button" onClick={() => onToggle(path)} type="button">
          {openBracket}
          {collapsed && <span className="json-tree-summary"> ... {summary} ... </span>}
          {collapsed && closeBracket}
          {collapsed && suffix}
        </button>
      </div>

      {!collapsed && (
        <>
          {entries.map(([entryKey, nestedValue], index) => (
            <JsonTreeNode
              collapsedPaths={collapsedPaths}
              depth={depth + 1}
              isLast={index === entries.length - 1}
              key={`${path}/${getPathSegment(entryKey)}`}
              label={isArray ? undefined : entryKey}
              onToggle={onToggle}
              path={`${path}/${getPathSegment(entryKey)}`}
              value={nestedValue}
            />
          ))}
          <div className="json-tree-line" style={indentStyle}>
            <span className="json-tree-spacer" />
            <span>{closeBracket}</span>
            {suffix}
          </div>
        </>
      )}
    </>
  );
}

export function JsonTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<JsonState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  const outputRef = useRef<HTMLPreElement>(null);

  const setOutputState = useCallback((nextState: JsonOutputState) => {
    setCollapsedPaths(new Set());
    setState(nextState);
  }, []);

  const format = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input) as unknown;
      const output = JSON.stringify(parsed, null, 2);
      setOutputState({ status: "formatted", output, stats: buildStats(input) });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [input, setOutputState]);

  const minify = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input) as unknown;
      const output = JSON.stringify(parsed);
      setOutputState({ status: "minified", output, stats: buildStats(input) });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [input, setOutputState]);

  const simplify = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input) as unknown;
      const output = JSON.stringify(simplifyLists(parsed), null, 2);
      setOutputState({ status: "simplified", output, stats: buildStats(output) });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [input, setOutputState]);

  const copy = useCallback(async () => {
    const text = isOutputState(state) ? state.output : input;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [state, input]);

  const clear = useCallback(() => {
    setInput("");
    setCollapsedPaths(new Set());
    setState({ status: "idle" });
  }, []);

  const togglePath = useCallback((path: string) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const hasOutput = isOutputState(state);
  const stats = hasOutput ? state.stats : null;
  const outputText = hasOutput ? state.output : "";
  const outputValue = useMemo(() => {
    if (!outputText) return null;
    try {
      return JSON.parse(outputText) as unknown;
    } catch {
      return null;
    }
  }, [outputText]);

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
            <button className="json-btn" onClick={simplify} type="button">
              <ListFilter size={15} />
              简化
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
                setCollapsedPaths(new Set());
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
                  {state.status === "formatted" ? "已格式化" : state.status === "minified" ? "已压缩" : "已简化"} · {stats?.keys} 个键 · {stats?.size}
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
              outputValue !== null ? (
                <div className="json-output json-tree-output has-content">
                  <JsonTreeNode
                    collapsedPaths={collapsedPaths}
                    onToggle={togglePath}
                    path="$"
                    value={outputValue}
                  />
                </div>
              ) : (
                <pre
                  className={`json-output${hasOutput ? " has-content" : ""}`}
                  ref={outputRef}
                >
                  {hasOutput ? state.output : <span className="json-placeholder">格式化、压缩或简化后结果显示在此处</span>}
                </pre>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

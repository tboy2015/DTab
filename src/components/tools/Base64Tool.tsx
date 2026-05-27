import { ArrowLeftRight, Check, Clipboard, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";

type Mode = "encode" | "decode";

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = useCallback(() => {
    setError("");
    if (!input) {
      setOutput("");
      return;
    }
    try {
      if (mode === "encode") {
        // UTF-8 safe encoding
        const bytes = new TextEncoder().encode(input);
        const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
        setOutput(btoa(bin));
      } else {
        const bin = atob(input.trim());
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        setOutput(new TextDecoder().decode(bytes));
      }
    } catch (e) {
      setError((e as Error).message || "处理失败");
      setOutput("");
    }
  }, [input, mode]);

  const swap = useCallback(() => {
    setMode((m) => (m === "encode" ? "decode" : "encode"));
    setInput(output);
    setOutput(input);
    setError("");
  }, [input, output]);

  const copy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [output]);

  const clear = useCallback(() => {
    setInput("");
    setOutput("");
    setError("");
  }, []);

  return (
    <div className="panel json-tool-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Utility</span>
          <h2>Base64 编解码</h2>
        </div>
        <div className="json-tool-actions">
          <div className="segmented" role="tablist">
            <button
              className={mode === "encode" ? "active" : ""}
              onClick={() => setMode("encode")}
              type="button"
            >
              编码
            </button>
            <button
              className={mode === "decode" ? "active" : ""}
              onClick={() => setMode("decode")}
              type="button"
            >
              解码
            </button>
          </div>
          <button className="json-btn json-btn-primary" onClick={run} type="button">
            {mode === "encode" ? "编码" : "解码"}
          </button>
          <button className="json-btn" onClick={swap} title="交换并切换模式" type="button">
            <ArrowLeftRight size={15} />
            互换
          </button>
          <button className="json-btn" onClick={() => void copy()} type="button">
            {copied ? <Check size={15} /> : <Clipboard size={15} />}
            {copied ? "已复制" : "复制"}
          </button>
          <button className="json-btn json-btn-ghost" onClick={clear} type="button">
            <RotateCcw size={15} />
            清空
          </button>
        </div>
      </div>

      <div className="json-tool-body">
        <div className="json-pane">
          <div className="json-pane-label">{mode === "encode" ? "原文" : "Base64"}</div>
          <textarea
            className="json-textarea"
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "encode" ? "输入要编码的文本" : "输入 Base64 字符串"}
            spellCheck={false}
            value={input}
          />
        </div>

        <div className="json-pane">
          <div className="json-pane-label">
            <span>{mode === "encode" ? "Base64 结果" : "原文"}</span>
          </div>
          {error ? (
            <div className="json-error">
              <span className="json-error-label">处理错误</span>
              <code>{error}</code>
            </div>
          ) : (
            <pre className={`json-output${output ? " has-content" : ""}`}>
              {output || <span className="json-placeholder">处理结果显示在此处</span>}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

import { ArrowLeftRight, Check, Clipboard, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type Mode = "encode" | "decode";

interface ParsedUrl {
  protocol: string;
  host: string;
  pathname: string;
  params: Array<{ key: string; value: string }>;
}

function tryParseUrl(text: string): ParsedUrl | null {
  try {
    const url = new URL(text.trim());
    const params: Array<{ key: string; value: string }> = [];
    url.searchParams.forEach((value, key) => {
      params.push({ key, value });
    });
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      params
    };
  } catch {
    return null;
  }
}

export function UrlTool() {
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
        setOutput(encodeURIComponent(input));
      } else {
        setOutput(decodeURIComponent(input));
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

  const parsed = useMemo(() => tryParseUrl(input), [input]);

  return (
    <div className="panel json-tool-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Utility</span>
          <h2>URL 编解码</h2>
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
          <button className="json-btn" onClick={swap} type="button">
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
          <div className="json-pane-label">{mode === "encode" ? "原文 / URL" : "已编码字符串"}</div>
          <textarea
            className="json-textarea"
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "encode" ? "输入文本或完整 URL" : "输入 URL 编码后的字符串"}
            spellCheck={false}
            value={input}
          />
        </div>

        <div className="json-pane">
          <div className="json-pane-label">
            <span>{mode === "encode" ? "编码结果" : "解码结果"}</span>
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

      {parsed && (
        <div className="url-parsed">
          <div className="url-parsed-row">
            <span className="url-parsed-label">协议</span>
            <code>{parsed.protocol}</code>
          </div>
          <div className="url-parsed-row">
            <span className="url-parsed-label">主机</span>
            <code>{parsed.host}</code>
          </div>
          <div className="url-parsed-row">
            <span className="url-parsed-label">路径</span>
            <code>{parsed.pathname || "/"}</code>
          </div>
          {parsed.params.length > 0 && (
            <div className="url-parsed-params">
              <span className="url-parsed-label">查询参数</span>
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.params.map((p, i) => (
                    <tr key={`${p.key}-${i}`}>
                      <td>
                        <code>{p.key}</code>
                      </td>
                      <td>
                        <code>{p.value}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

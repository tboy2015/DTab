import {
  BookOpen,
  Bot,
  ChevronDown,
  Clipboard,
  Copy,
  FileText,
  Gift,
  Home,
  Image,
  Maximize2,
  MessageSquareText,
  RotateCcw,
  Settings,
  Sparkles,
  ThumbsUp,
  Video
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_TRANSLATION_PREFERENCES,
  SIDE_PANEL_PENDING_TRANSLATION_KEY,
  TRANSLATION_HISTORY_KEY,
  TRANSLATION_PREFERENCES_KEY,
  type PendingSidePanelTranslation,
  type RuntimeMessage,
  type RuntimeResponse,
  type TranslationHistoryItem,
  type TranslationPreferences,
  type TranslationTargetLanguage
} from "../lib/types";
import "./sidepanel.css";

type TranslateStatus = "idle" | "loading" | "ready" | "error";
type CopiedTarget = "result" | string | null;

const TOOLS = [
  { id: "text", label: "文本", icon: MessageSquareText },
  { id: "doc", label: "文档", icon: FileText },
  { id: "video", label: "视频", icon: Video },
  { id: "image", label: "图片", icon: Image },
  { id: "guide", label: "教程", icon: BookOpen }
] as const;

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse<string[]>> {
  return chrome.runtime.sendMessage(message);
}

function mergePreferences(value: unknown): TranslationPreferences {
  return {
    ...DEFAULT_TRANSLATION_PREFERENCES,
    ...(value && typeof value === "object" ? (value as Partial<TranslationPreferences>) : {})
  };
}

function historyId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function SidePanelApp() {
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [status, setStatus] = useState<TranslateStatus>("idle");
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState<TranslationPreferences>(
    DEFAULT_TRANSLATION_PREFERENCES
  );
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<CopiedTarget>(null);
  const translationRequestId = useRef(0);

  const canTranslate = useMemo(() => sourceText.trim().length > 0 && status !== "loading", [
    sourceText,
    status
  ]);

  const saveHistoryItem = useCallback(
    async (sourceTextValue: string, translatedTextValue: string) => {
      const item: TranslationHistoryItem = {
        id: historyId(),
        sourceText: sourceTextValue,
        translatedText: translatedTextValue,
        targetLanguage: preferences.targetLanguage,
        createdAt: new Date().toISOString()
      };
      const nextHistory = [item, ...history.filter((entry) => entry.sourceText !== sourceTextValue)].slice(
        0,
        20
      );

      setHistory(nextHistory);
      await chrome.storage.local.set({ [TRANSLATION_HISTORY_KEY]: nextHistory });
    },
    [history, preferences.targetLanguage]
  );

  const translateValue = useCallback(async (value: string) => {
    const text = value.trim();

    if (!text) {
      return;
    }

    const requestId = translationRequestId.current + 1;
    translationRequestId.current = requestId;
    setStatus("loading");
    setError("");

    try {
      const response = await sendRuntimeMessage({
        type: "TRANSLATE_TEXTS",
        texts: [text],
        targetLanguage: preferences.targetLanguage
      });

      if (!response.ok || !Array.isArray(response.data)) {
        throw new Error(response.error ?? "翻译失败");
      }

      if (translationRequestId.current === requestId) {
        const translated = response.data[0] ?? "";
        setTranslatedText(translated);
        setStatus("ready");
        if (translated) {
          void saveHistoryItem(text, translated);
        }
      }
    } catch (err) {
      if (translationRequestId.current === requestId) {
        setError(err instanceof Error ? err.message : "翻译失败");
        setStatus("error");
      }
    }
  }, [preferences.targetLanguage, saveHistoryItem]);

  useEffect(() => {
    chrome.storage.local
      .get([TRANSLATION_PREFERENCES_KEY, TRANSLATION_HISTORY_KEY])
      .then((storage) => {
        setPreferences(mergePreferences(storage[TRANSLATION_PREFERENCES_KEY]));
        setHistory(
          Array.isArray(storage[TRANSLATION_HISTORY_KEY]) ? storage[TRANSLATION_HISTORY_KEY] : []
        );
      });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[TRANSLATION_PREFERENCES_KEY]) {
        setPreferences(mergePreferences(changes[TRANSLATION_PREFERENCES_KEY].newValue));
      }

      if (changes[TRANSLATION_HISTORY_KEY] && Array.isArray(changes[TRANSLATION_HISTORY_KEY].newValue)) {
        setHistory(changes[TRANSLATION_HISTORY_KEY].newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    function applyPendingTranslation(value: unknown) {
      const pending = value as PendingSidePanelTranslation | undefined;
      const text = pending?.text?.trim();

      if (!text) {
        return;
      }

      setSourceText(text);
      setTranslatedText("");
      void translateValue(text);
      void chrome.storage.local.remove(SIDE_PANEL_PENDING_TRANSLATION_KEY);
    }

    chrome.storage.local.get(SIDE_PANEL_PENDING_TRANSLATION_KEY).then((storage) => {
      applyPendingTranslation(storage[SIDE_PANEL_PENDING_TRANSLATION_KEY]);
    });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local" || !changes[SIDE_PANEL_PENDING_TRANSLATION_KEY]) {
        return;
      }

      applyPendingTranslation(changes[SIDE_PANEL_PENDING_TRANSLATION_KEY].newValue);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [translateValue]);

  function translateText(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    void translateValue(sourceText);
  }

  async function updatePreferences(nextPreferences: TranslationPreferences) {
    setPreferences(nextPreferences);
    await chrome.storage.local.set({ [TRANSLATION_PREFERENCES_KEY]: nextPreferences });
  }

  function updateTargetLanguage(targetLanguage: TranslationTargetLanguage) {
    void updatePreferences({ ...preferences, targetLanguage });
  }

  async function copyText(text: string, target: CopiedTarget) {
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopiedTarget(target);
    window.setTimeout(() => setCopiedTarget(null), 1200);
  }

  function useHistoryItem(item: TranslationHistoryItem) {
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setStatus("ready");
    setError("");
  }

  async function clearHistory() {
    setHistory([]);
    await chrome.storage.local.set({ [TRANSLATION_HISTORY_KEY]: [] });
  }

  function clearText() {
    translationRequestId.current += 1;
    setSourceText("");
    setTranslatedText("");
    setStatus("idle");
    setError("");
  }

  return (
    <main className="sidepanel-shell">
      <section className="translator-pane" aria-label="翻译文本">
        <header className="panel-header">
          <div className="title-row">
            <h1>翻译文本</h1>
            <button className="icon-button ghost" type="button" title="展开">
              <Maximize2 size={16} />
            </button>
          </div>
          <div className="provider-row">
            <button className="provider-picker" type="button">
              <Bot size={16} />
              <span className="microsoft-mark" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <ChevronDown size={15} />
            </button>
            <button
              className={isSettingsOpen ? "icon-button active" : "icon-button"}
              onClick={() => setIsSettingsOpen((open) => !open)}
              type="button"
              title="设置"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        {isSettingsOpen ? (
          <section className="preferences-panel" aria-label="翻译偏好设置">
            <label>
              <span>划词气泡</span>
              <input
                checked={preferences.selectionBubbleEnabled}
                onChange={(event) =>
                  void updatePreferences({
                    ...preferences,
                    selectionBubbleEnabled: event.target.checked
                  })
                }
                type="checkbox"
              />
            </label>
            <label>
              <span>划词后自动翻译</span>
              <input
                checked={preferences.autoTranslateSelection}
                onChange={(event) =>
                  void updatePreferences({
                    ...preferences,
                    autoTranslateSelection: event.target.checked
                  })
                }
                type="checkbox"
              />
            </label>
            <label>
              <span>目标语言</span>
              <select
                value={preferences.targetLanguage}
                onChange={(event) => updateTargetLanguage(event.target.value as TranslationTargetLanguage)}
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁体中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </label>
            <label>
              <span>双语样式</span>
              <select
                value={preferences.bilingualStyle}
                onChange={(event) =>
                  void updatePreferences({
                    ...preferences,
                    bilingualStyle: event.target.value as TranslationPreferences["bilingualStyle"]
                  })
                }
              >
                <option value="subtle">轻量</option>
                <option value="highlight">高亮</option>
                <option value="compact">紧凑</option>
              </select>
            </label>
          </section>
        ) : null}

        <form className="translate-card" onSubmit={translateText}>
          <div className="language-row">
            <button type="button">
              自动检测
              <ChevronDown size={14} />
            </button>
            <RotateCcw className="swap-icon" size={15} />
            <button type="button">
              {preferences.targetLanguage === "zh-CN" ? "简体中文" : preferences.targetLanguage}
              <ChevronDown size={14} />
            </button>
          </div>

          <textarea
            aria-label="输入或粘贴文本"
            placeholder="请输入或粘贴文本..."
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
          />

          {translatedText ? (
            <div className="result-wrap">
              <output className="result-text">{translatedText}</output>
              <button
                className="copy-button"
                onClick={() => void copyText(translatedText, "result")}
                type="button"
              >
                <Copy size={14} />
                {copiedTarget === "result" ? "已复制" : "复制译文"}
              </button>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="card-actions">
            <button className="trash-button" onClick={clearText} type="button" title="清空">
              <RotateCcw size={15} />
            </button>
            <button className="translate-button" disabled={!canTranslate} type="submit">
              {status === "loading" ? "翻译中" : "翻译 ↵"}
            </button>
          </div>
        </form>

        <section className="history-panel" aria-label="翻译历史">
          <div className="history-header">
            <h2>
              <Clipboard size={16} />
              翻译历史
            </h2>
            <button disabled={history.length === 0} onClick={() => void clearHistory()} type="button">
              清空
            </button>
          </div>

          {history.length === 0 ? (
            <p className="history-empty">暂无翻译历史</p>
          ) : (
            <div className="history-list">
              {history.slice(0, 8).map((item) => (
                <article className="history-item" key={item.id}>
                  <button className="history-main" onClick={() => useHistoryItem(item)} type="button">
                    <strong>{item.sourceText}</strong>
                    <span>{item.translatedText}</span>
                  </button>
                  <button
                    className="history-copy"
                    onClick={() => void copyText(item.translatedText, item.id)}
                    type="button"
                  >
                    {copiedTarget === item.id ? "已复制" : "复制"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <aside className="side-rail" aria-label="侧边栏工具">
        <button className="rail-expand" type="button" title="展开">
          <Maximize2 size={15} />
        </button>

        <nav>
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button className={id === "text" ? "rail-item active" : "rail-item"} key={id} type="button">
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="rail-bottom">
          <button type="button" title="礼物">
            <Gift size={17} />
          </button>
          <button type="button" title="喜欢">
            <ThumbsUp size={17} />
          </button>
          <button type="button" title="首页">
            <Home size={17} />
          </button>
          <button type="button" title="设置">
            <Settings size={17} />
          </button>
          <button className="avatar-button" type="button" title="AI 助手">
            <Sparkles size={16} />
          </button>
        </div>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("sidepanel-root")!).render(<SidePanelApp />);

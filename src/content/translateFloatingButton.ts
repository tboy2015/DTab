import type { RuntimeMessage, RuntimeResponse, TranslationPreferences } from "../lib/types";

const ROOT_ID = "dtab-translate-floating-root";
const TRANSLATION_CLASS = "dtab-inline-translation";
const TRANSLATION_STYLE_ID = "dtab-inline-translation-style";
const STORAGE_KEY = "dtab.translateFloatingButton";
const TRANSLATION_PREFERENCES_KEY = "dtab.translation.preferences";
const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  selectionBubbleEnabled: true,
  autoTranslateSelection: false,
  targetLanguage: "zh-CN",
  bilingualStyle: "subtle"
};
const MAX_TEXT_NODES = 1200;
const TRANSLATE_BATCH_SIZE = 8;
const VIEWPORT_TRANSLATE_MARGIN = 700;
const MIN_TEXT_LENGTH = 2;
const EDGE_PEEK = 18;
const BUTTON_SIZE = 46;
const SIDEPANEL_BUTTON_SIZE = 34;
const SELECTION_BUBBLE_WIDTH = 280;
const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/;
const LATIN_TEXT_PATTERN = /[A-Za-z]/;
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "SVG",
  "CANVAS"
]);

type Edge = "left" | "right";
type TranslationInsertStrategy =
  | "heading"
  | "paragraph"
  | "inline-ui"
  | "list-card"
  | "link-list"
  | "side-card";

interface ButtonPosition {
  edge: Edge;
  y: number;
}

interface TextEntry {
  node: Text;
  original: string;
}

let position: ButtonPosition = {
  edge: "right",
  y: Math.round(window.innerHeight * 0.52)
};
let isTranslated = false;
let isBusy = false;
let hasMoved = false;
let floatingButton: HTMLButtonElement | null = null;
let selectionBubble: HTMLElement | null = null;
let selectedText = "";
let selectionRequestId = 0;
let isSelectionBubbleInteracting = false;
let autoTranslateTimer: number | undefined;
let observeTimer: number | undefined;
let mutationObserver: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let pageTranslationGeneration = 0;
const translatedNodes = new Map<Text, HTMLElement>();
const translatedContainers = new Set<HTMLElement>();
const processingContainers = new Set<HTMLElement>();
const loadingPlaceholders = new Map<HTMLElement, HTMLElement>();
const observedContainers = new Map<HTMLElement, TextBlock>();
const pendingIntersectionContainers = new Set<HTMLElement>();
const translationCache = new Map<string, string>();
let preferences: TranslationPreferences = DEFAULT_TRANSLATION_PREFERENCES;

interface TextBlock {
  anchor: Text;
  container: HTMLElement;
  original: string;
  strategy: TranslationInsertStrategy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function canUseExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse<string[]>> {
  return chrome.runtime.sendMessage(message);
}

function mergePreferences(value: unknown): TranslationPreferences {
  return {
    ...DEFAULT_TRANSLATION_PREFERENCES,
    ...(value && typeof value === "object" ? (value as Partial<TranslationPreferences>) : {})
  };
}

async function readTranslationPreferences(): Promise<void> {
  if (!canUseExtensionRuntime()) {
    return;
  }

  const stored = await chrome.storage.local.get(TRANSLATION_PREFERENCES_KEY);
  preferences = mergePreferences(stored[TRANSLATION_PREFERENCES_KEY]);
}

function translationCacheKey(text: string): string {
  return `${preferences.targetLanguage}:${text}`;
}

function shouldTranslateText(value: string): boolean {
  const text = value.trim();

  return (
    text.length >= MIN_TEXT_LENGTH &&
    LATIN_TEXT_PATTERN.test(text) &&
    !CHINESE_TEXT_PATTERN.test(text) &&
    !/^[A-Z0-9+_.-]{1,8}$/.test(text) &&
    !/^[\d\s\-+.,:;()[\]{}#/\\|]+$/.test(text)
  );
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isInteractiveTextContainer(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      'nav, header, footer, aside, menu, [role="navigation"], [role="tablist"], [role="menu"], [role="menubar"]'
    ) || element.closest("a, button, [role='button'], [role='tab'], [role='menuitem']")
  );
}

function isLikelyContentArea(element: HTMLElement): boolean {
  return Boolean(element.closest("article, main, [role='main'], [class*='content' i], [class*='post' i]"));
}

function isLikelySidebar(element: HTMLElement): boolean {
  return Boolean(
    element.closest("aside, [role='complementary'], [class*='sidebar' i], [class*='side-bar' i]")
  );
}

function isLikelyTableOfContents(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      '[aria-label*="contents" i], [class*="toc" i], [class*="table-of-contents" i], [id*="toc" i], [id*="table-of-contents" i]'
    )
  );
}

function hasOnlyLinkLikeText(container: HTMLElement, text: string): boolean {
  const links = Array.from(container.querySelectorAll("a"));

  if (links.length === 0) {
    return false;
  }

  const linkText = links.map((link) => link.textContent?.trim() ?? "").join(" ").replace(/\s+/g, " ");

  return linkText.length > 0 && linkText.length >= text.length * 0.72;
}

function inferInsertStrategy(container: HTMLElement, original: string): TranslationInsertStrategy {
  const tagName = container.tagName;
  const words = wordCount(original);
  const rect = container.getBoundingClientRect();

  if (/^H[1-6]$/.test(tagName)) {
    return "heading";
  }

  if (
    isLikelyTableOfContents(container) ||
    hasOnlyLinkLikeText(container, original) ||
    (tagName === "LI" && container.querySelector("a"))
  ) {
    return "link-list";
  }

  if (isInteractiveTextContainer(container) && original.length <= 80) {
    return "inline-ui";
  }

  if (isLikelySidebar(container) && original.length <= 180) {
    return "side-card";
  }

  if (
    ["LI", "DT", "DD", "TD", "TH"].includes(tagName) ||
    container.closest("article, [role='article'], [data-testid*='card' i], [class*='card' i]")
  ) {
    return words <= 18 ? "list-card" : "paragraph";
  }

  if (words <= 3 && original.length <= 32) {
    return "inline-ui";
  }

  if (rect.height <= 40 && original.length <= 72) {
    return "inline-ui";
  }

  return "paragraph";
}

function isVisibleTextNode(node: Text): boolean {
  const parent = node.parentElement;

  if (
    !parent ||
    SKIP_TAGS.has(parent.tagName) ||
    parent.closest(`#${ROOT_ID}`) ||
    parent.closest(`.${TRANSLATION_CLASS}`)
  ) {
    return false;
  }

  const style = window.getComputedStyle(parent);

  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  return parent.getClientRects().length > 0;
}

function collectTextNodes(): TextEntry[] {
  const entries: TextEntry[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || !isVisibleTextNode(node) || !shouldTranslateText(node.data)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (entries.length < MAX_TEXT_NODES) {
    const node = walker.nextNode();

    if (!node) {
      break;
    }

    entries.push({
      node: node as Text,
      original: (node as Text).data
    });
  }

  return entries;
}

function scheduleAutoTranslate(delay = 180): void {
  if (!isTranslated || !floatingButton) {
    return;
  }

  window.clearTimeout(autoTranslateTimer);
  autoTranslateTimer = window.setTimeout(() => {
    void translateVisiblePageBlocks(floatingButton!);
  }, delay);
}

function scheduleObserveTextBlocks(delay = 160): void {
  if (!isTranslated) {
    return;
  }

  window.clearTimeout(observeTimer);
  observeTimer = window.setTimeout(() => {
    observePendingTextBlocks();
  }, delay);
}

function findTextBlockContainer(node: Text): HTMLElement | null {
  let element = node.parentElement;
  const interactive = element?.closest<HTMLElement>("a, button, [role='button'], [role='tab'], [role='menuitem']");

  if (interactive?.closest("nav, header, footer, menu, [role='navigation'], [role='tablist']")) {
    return interactive;
  }

  while (element && element !== document.body && element !== document.documentElement) {
    const tagName = element.tagName;
    const display = window.getComputedStyle(element).display;

    if (
      [
        "BUTTON",
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "LI",
        "DT",
        "DD",
        "BLOCKQUOTE",
        "FIGCAPTION",
        "LABEL",
        "TD",
        "TH"
      ].includes(tagName) ||
      display === "list-item" ||
      display === "table-cell"
    ) {
      return element;
    }

    if (display === "block" && !isLikelyContentArea(element) && !interactive) {
      return element;
    }

    element = element.parentElement;
  }

  return interactive ?? node.parentElement;
}

function collectTextBlocks(): TextBlock[] {
  const entries = collectTextNodes();
  const blocks = new Map<HTMLElement, { anchor: Text; parts: string[] }>();

  entries.forEach((entry) => {
    const container = findTextBlockContainer(entry.node);

    if (!container) {
      return;
    }

    const text = entry.original.trim();
    const existing = blocks.get(container);

    if (!existing) {
      blocks.set(container, {
        anchor: entry.node,
        parts: [text]
      });
      return;
    }

    if (existing.parts.join(" ").length + text.length <= 1200) {
      existing.parts.push(text);
    }
  });

  return Array.from(blocks.entries())
    .map(([container, block]) => ({
      anchor: block.anchor,
      container,
      original: block.parts.join(" ").replace(/\s+/g, " ").trim()
    }))
    .filter((block) => shouldTranslateText(block.original))
    .map((block) => ({
      ...block,
      strategy: inferInsertStrategy(block.container, block.original)
    }))
    .slice(0, MAX_TEXT_NODES);
}

function collectPendingVisibleBlocks(): TextBlock[] {
  const blocks: TextBlock[] = [];

  pendingIntersectionContainers.forEach((container) => {
    const block = observedContainers.get(container);

    if (
      block &&
      !translatedContainers.has(container) &&
      !processingContainers.has(container)
    ) {
      blocks.push(block);
    }
  });

  return blocks;
}

async function readPosition(): Promise<void> {
  if (!canUseExtensionRuntime()) {
    return;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<ButtonPosition> | undefined;

  if (value?.edge === "left" || value?.edge === "right") {
    position.edge = value.edge;
  }

  if (typeof value?.y === "number") {
    position.y = value.y;
  }
}

function savePosition(): void {
  if (!canUseExtensionRuntime()) {
    return;
  }

  void chrome.storage.local.set({
    [STORAGE_KEY]: {
      edge: position.edge,
      y: position.y
    }
  });
}

function applyPosition(button: HTMLButtonElement): void {
  position.y = clamp(position.y, 24, window.innerHeight - BUTTON_SIZE - 24);
  button.style.top = `${position.y}px`;
  button.style.left = position.edge === "left" ? `${-EDGE_PEEK}px` : "";
  button.style.right = position.edge === "right" ? `${-EDGE_PEEK}px` : "";
}

function applyToolButtonPosition(button: HTMLButtonElement, offsetY: number): void {
  const top = clamp(position.y + offsetY, 14, window.innerHeight - SIDEPANEL_BUTTON_SIZE - 14);

  button.style.top = `${top}px`;
  button.style.left = position.edge === "left" ? "26px" : "";
  button.style.right = position.edge === "right" ? "26px" : "";
  button.dataset.edge = position.edge;
}

async function openTranslateSidePanel(): Promise<void> {
  if (!canUseExtensionRuntime()) {
    return;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "OPEN_TRANSLATE_SIDE_PANEL"
    } satisfies RuntimeMessage)) as RuntimeResponse<null>;

    if (!response?.ok) {
      throw new Error(response?.error ?? "打开侧边栏失败");
    }
  } catch (error) {
    console.warn("[translate] 打开翻译侧边栏失败:", error);
    window.open(
      chrome.runtime.getURL("sidepanel.html"),
      "dtab-translate-sidepanel",
      "popup,width=420,height=760"
    );
  }
}

function closeFloatingButton(): void {
  document.getElementById(ROOT_ID)?.remove();
  floatingButton = null;
}

function setStatus(button: HTMLButtonElement, status: "idle" | "busy" | "done" | "error"): void {
  button.dataset.status = status;
  button.title =
    status === "busy"
      ? "正在翻译"
      : status === "done"
        ? "已翻译，点击还原"
        : status === "error"
          ? "翻译失败，点击重试"
          : "译为简体中文";
}

function setSelectionBubbleState(status: "idle" | "loading" | "ready" | "error", message = ""): void {
  if (!selectionBubble) {
    return;
  }

  const action = selectionBubble.querySelector<HTMLButtonElement>(".selection-action");
  const copy = selectionBubble.querySelector<HTMLButtonElement>(".selection-copy");
  const result = selectionBubble.querySelector<HTMLElement>(".selection-result");

  selectionBubble.dataset.status = status;

  if (action) {
    action.disabled = status === "loading";
    action.textContent = status === "loading" ? "翻译中..." : "翻译";
  }

  if (copy) {
    copy.hidden = status !== "ready" || !message;
    copy.dataset.copyText = status === "ready" ? message : "";
    copy.textContent = "复制";
  }

  if (result) {
    result.textContent = message;
    result.hidden = !message;
  }
}

async function copySelectionTranslation(): Promise<void> {
  if (!selectionBubble) {
    return;
  }

  const copy = selectionBubble.querySelector<HTMLButtonElement>(".selection-copy");
  const text = copy?.dataset.copyText?.trim();

  if (!copy || !text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    copy.textContent = "已复制";
    window.setTimeout(() => {
      if (copy.dataset.copyText === text) {
        copy.textContent = "复制";
      }
    }, 1200);
  } catch (error) {
    copy.textContent = "复制失败";
    window.setTimeout(() => {
      copy.textContent = "复制";
    }, 1200);
  }
}

function hideSelectionBubble(): void {
  if (!selectionBubble) {
    return;
  }

  selectionBubble.hidden = true;
  selectedText = "";
  delete selectionBubble.dataset.selectedText;
  selectionRequestId += 1;
  setSelectionBubbleState("idle");
}

function holdSelectionBubbleInteraction(): void {
  isSelectionBubbleInteracting = true;
  window.setTimeout(() => {
    isSelectionBubbleInteracting = false;
  }, 300);
}

function getSelectedText(): string {
  const selection = document.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }

  return selection.toString().trim();
}

function getSelectionRect(): DOMRect | null {
  const selection = document.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );

  return rects[0] ?? null;
}

function positionSelectionBubble(rect: DOMRect): void {
  if (!selectionBubble) {
    return;
  }

  const left = clamp(
    rect.left + rect.width / 2 - SELECTION_BUBBLE_WIDTH / 2,
    10,
    window.innerWidth - SELECTION_BUBBLE_WIDTH - 10
  );
  const top = rect.top > 88 ? rect.top - 74 : rect.bottom + 10;

  selectionBubble.style.left = `${left}px`;
  selectionBubble.style.top = `${clamp(top, 10, window.innerHeight - 140)}px`;
}

function showSelectionBubble(): void {
  if (!preferences.selectionBubbleEnabled) {
    hideSelectionBubble();
    return;
  }

  const text = getSelectedText();
  const rect = getSelectionRect();

  if (!selectionBubble || !text || !rect || text.length < MIN_TEXT_LENGTH) {
    hideSelectionBubble();
    return;
  }

  selectedText = text;
  selectionBubble.dataset.selectedText = text;
  selectionBubble.hidden = false;
  positionSelectionBubble(rect);
  setSelectionBubbleState("idle");

  if (preferences.autoTranslateSelection) {
    void translateSelection();
  }
}

async function translateSelection(): Promise<void> {
  const text = (selectionBubble?.dataset.selectedText || selectedText).trim();

  if (!text || !selectionBubble || !canUseExtensionRuntime()) {
    return;
  }

  const requestId = selectionRequestId + 1;
  selectionRequestId = requestId;
  setSelectionBubbleState("loading");

  try {
    const cacheKey = translationCacheKey(text);
    const cached = translationCache.get(cacheKey);

    if (cached) {
      setSelectionBubbleState("ready", cached);
      return;
    }

    const response = await sendRuntimeMessage({
      type: "TRANSLATE_TEXTS",
      texts: [text],
      targetLanguage: preferences.targetLanguage
    });

    if (selectionRequestId !== requestId) {
      return;
    }

    if (!response.ok || !Array.isArray(response.data)) {
      throw new Error(response.error ?? "翻译失败");
    }

    const translated = response.data[0]?.trim();

    if (!translated) {
      throw new Error("没有获取到译文");
    }

    translationCache.set(cacheKey, translated);
    setSelectionBubbleState("ready", translated);
  } catch (error) {
    if (selectionRequestId === requestId) {
      setSelectionBubbleState("error", error instanceof Error ? error.message : "翻译失败");
    }
  }
}

function ensureTranslationStyle(): void {
  if (document.getElementById(TRANSLATION_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = TRANSLATION_STYLE_ID;
  style.textContent = `
    .${TRANSLATION_CLASS} {
      color: inherit;
      display: block;
      font-size: inherit;
      font-style: inherit;
      font-weight: inherit;
      line-height: inherit;
      letter-spacing: inherit;
      margin: 0;
      max-width: 100%;
      opacity: 1;
      pointer-events: none;
      white-space: normal;
    }

    .${TRANSLATION_CLASS}[data-strategy="paragraph"],
    .${TRANSLATION_CLASS}[data-strategy="heading"],
    .${TRANSLATION_CLASS}[data-strategy="list-card"],
    .${TRANSLATION_CLASS}[data-strategy="link-list"],
    .${TRANSLATION_CLASS}[data-strategy="side-card"] {
      margin-top: 0.28em;
    }

    .${TRANSLATION_CLASS}[data-tone="heading"] {
      font-size: inherit;
      font-weight: inherit;
      line-height: inherit;
    }

    .${TRANSLATION_CLASS}[data-strategy="inline-ui"] {
      display: inline;
      margin-left: 0.35em;
      white-space: normal;
    }

    .${TRANSLATION_CLASS}[data-strategy="inline-ui"]::before {
      content: "";
    }

    .${TRANSLATION_CLASS}[data-strategy="list-card"] {
      margin-top: 0;
    }

    .${TRANSLATION_CLASS}[data-strategy="link-list"] {
      display: block;
    }

    .${TRANSLATION_CLASS}[data-strategy="side-card"] {
      display: block;
    }

    .${TRANSLATION_CLASS}[data-style="highlight"] {
      background: transparent;
      border-left: 0;
      border-radius: 0;
      padding: 0;
    }

    .${TRANSLATION_CLASS}[data-style="compact"] {
      display: block;
    }

    .${TRANSLATION_CLASS}[data-style="compact"][data-strategy="inline-ui"] {
      display: inline;
      margin-left: 0.3em;
    }

    .${TRANSLATION_CLASS}[data-tone="heading"][data-style="compact"] {
      font-size: inherit;
    }

    .${TRANSLATION_CLASS}[data-status="loading"] {
      align-items: center;
      display: inline-flex;
      gap: 0.35em;
      min-height: 1em;
      opacity: 0.62;
    }

    .${TRANSLATION_CLASS}[data-status="loading"][data-strategy="paragraph"],
    .${TRANSLATION_CLASS}[data-status="loading"][data-strategy="heading"],
    .${TRANSLATION_CLASS}[data-status="loading"][data-strategy="list-card"] {
      display: flex;
      width: fit-content;
    }

    .${TRANSLATION_CLASS}[data-status="loading"]::before {
      animation: dtab-inline-spin 850ms linear infinite;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 999px;
      content: "";
      display: inline-block;
      height: 0.72em;
      opacity: 0.75;
      width: 0.72em;
    }

    @keyframes dtab-inline-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  document.head.append(style);
}

function parseRgbColor(value: string): [number, number, number, number] | null {
  const match = value.match(
    /rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?/
  );

  if (!match) {
    return null;
  }

  const alpha = match[4] === undefined ? 1 : Number(match[4]);

  if (alpha <= 0.05) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

function relativeLuminance([red, green, blue]: [number, number, number, number]): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function findVisibleBackgroundColor(element: HTMLElement): [number, number, number, number] | null {
  let current: HTMLElement | null = element;

  while (current && current !== document.documentElement) {
    const color = parseRgbColor(window.getComputedStyle(current).backgroundColor);

    if (color) {
      return color;
    }

    current = current.parentElement;
  }

  return parseRgbColor(window.getComputedStyle(document.body).backgroundColor);
}

function applyTranslationColors(element: HTMLElement, sourceElement: HTMLElement): void {
  const sourceColor = parseRgbColor(window.getComputedStyle(sourceElement).color);
  const backgroundColor = findVisibleBackgroundColor(sourceElement);
  const sourceLuminance = sourceColor ? relativeLuminance(sourceColor) : 0.7;
  const backgroundLuminance = backgroundColor ? relativeLuminance(backgroundColor) : 1;
  const isDarkBackground = backgroundLuminance < 0.42;
  const isLowContrastDarkText = isDarkBackground && sourceLuminance < 0.55;

  if (isLowContrastDarkText) {
    element.style.setProperty("--dtab-translation-color", "rgba(245, 247, 250, 0.82)");
    element.style.setProperty("--dtab-translation-bg", "rgba(255, 255, 255, 0.08)");
    return;
  }

  if (sourceColor) {
    element.style.setProperty(
      "--dtab-translation-color",
      `rgba(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]}, 0.82)`
    );
  }
}

function copyTextStyle(element: HTMLElement, sourceElement: HTMLElement): void {
  const style = window.getComputedStyle(sourceElement);
  const properties = [
    "color",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "fontStretch",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "textDecorationLine",
    "textDecorationStyle",
    "textDecorationColor",
    "textShadow",
    "wordSpacing",
    "direction",
    "textAlign"
  ] as const;

  properties.forEach((property) => {
    element.style[property] = style[property];
  });
}

function applyTranslationStyle(element: HTMLElement, sourceElement: HTMLElement): void {
  copyTextStyle(element, sourceElement);
}

function insertTranslation(entry: TextEntry, translated: string): void {
  const parent = entry.node.parentNode;

  if (!parent || translatedNodes.has(entry.node)) {
    return;
  }

  const element = document.createElement("span");
  element.className = TRANSLATION_CLASS;
  element.dataset.style = preferences.bilingualStyle;
  element.dataset.tone = "body";
  element.dataset.strategy = "paragraph";
  element.dataset.dtabTranslation = "true";
  element.textContent = translated;
  applyTranslationStyle(element, entry.node.parentElement ?? document.body);

  parent.insertBefore(element, entry.node.nextSibling);
  translatedNodes.set(entry.node, element);
}

function insertBlockTranslation(block: TextBlock, translated: string): void {
  const parent = block.container;

  if (!parent || translatedNodes.has(block.anchor)) {
    return;
  }

  if (parent === document.body || parent === document.documentElement) {
    insertTranslation({ node: block.anchor, original: block.original }, translated);
    translatedContainers.add(block.container);
    return;
  }

  const element = document.createElement("span");
  element.className = TRANSLATION_CLASS;
  element.dataset.style = preferences.bilingualStyle;
  element.dataset.tone = block.strategy === "heading" ? "heading" : "body";
  element.dataset.strategy = block.strategy;
  element.dataset.dtabTranslation = "true";
  element.textContent = translated;
  applyTranslationStyle(element, parent);

  if (block.strategy === "inline-ui") {
    parent.append(element);
  } else {
    parent.append(element);
  }

  translatedNodes.set(block.anchor, element);
  translatedContainers.add(block.container);
}

function createTranslationElement(
  block: TextBlock,
  text: string,
  status: "loading" | "ready"
): HTMLElement {
  const element = document.createElement("span");
  element.className = TRANSLATION_CLASS;
  element.dataset.style = preferences.bilingualStyle;
  element.dataset.tone = block.strategy === "heading" ? "heading" : "body";
  element.dataset.strategy = block.strategy;
  element.dataset.status = status;
  element.dataset.dtabTranslation = "true";
  element.textContent = text;
  applyTranslationStyle(element, block.container);

  return element;
}

function placeTranslationElement(block: TextBlock, element: HTMLElement): void {
  if (block.strategy === "inline-ui") {
    block.container.append(element);
    return;
  }

  block.container.append(element);
}

function insertLoadingPlaceholder(block: TextBlock): void {
  if (
    loadingPlaceholders.has(block.container) ||
    translatedContainers.has(block.container) ||
    block.container === document.body ||
    block.container === document.documentElement
  ) {
    return;
  }

  const element = createTranslationElement(block, "", "loading");
  placeTranslationElement(block, element);
  loadingPlaceholders.set(block.container, element);
  translatedNodes.set(block.anchor, element);
}

function finalizeBlockTranslation(block: TextBlock, translated: string): void {
  const placeholder = loadingPlaceholders.get(block.container);

  if (placeholder) {
    delete placeholder.dataset.status;
    placeholder.textContent = translated;
    loadingPlaceholders.delete(block.container);
    translatedContainers.add(block.container);
    return;
  }

  insertBlockTranslation(block, translated);
}

function removeLoadingPlaceholder(block: TextBlock): void {
  const placeholder = loadingPlaceholders.get(block.container);

  if (!placeholder) {
    return;
  }

  placeholder.remove();
  loadingPlaceholders.delete(block.container);
  translatedNodes.delete(block.anchor);
}

function removePageTranslations(): void {
  translatedNodes.forEach((element) => {
    element.remove();
  });
  translatedNodes.clear();
  translatedContainers.clear();
  processingContainers.clear();
  loadingPlaceholders.clear();
  isTranslated = false;
  pageTranslationGeneration += 1;

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }

  window.clearTimeout(autoTranslateTimer);
  window.clearTimeout(observeTimer);
  observedContainers.clear();
  pendingIntersectionContainers.clear();
}

async function translatePage(button: HTMLButtonElement): Promise<void> {
  if (isTranslated) {
    removePageTranslations();
    setStatus(button, "idle");
    return;
  }

  if (!canUseExtensionRuntime()) {
    setStatus(button, "error");
    return;
  }

  isTranslated = true;
  startAutoTranslateObservers();
  observePendingTextBlocks();
  await translateVisiblePageBlocks(button);
}

async function translateVisiblePageBlocks(button: HTMLButtonElement): Promise<void> {
  if (isBusy || !isTranslated) {
    return;
  }

  const blocks = collectPendingVisibleBlocks().slice(0, TRANSLATE_BATCH_SIZE);

  if (blocks.length === 0) {
    setStatus(button, translatedNodes.size > 0 ? "done" : "idle");
    return;
  }

  const generation = pageTranslationGeneration;
  isBusy = true;
  setStatus(button, "busy");
  ensureTranslationStyle();
  blocks.forEach((block) => {
    processingContainers.add(block.container);
    pendingIntersectionContainers.delete(block.container);
    intersectionObserver?.unobserve(block.container);
    insertLoadingPlaceholder(block);
  });

  const uniqueTexts = Array.from(new Set(blocks.map((block) => block.original.trim()))).filter(
    (text) => !translationCache.has(translationCacheKey(text))
  );

  try {
    if (uniqueTexts.length > 0) {
      const response = await sendRuntimeMessage({
        type: "TRANSLATE_TEXTS",
        texts: uniqueTexts,
        targetLanguage: preferences.targetLanguage
      });

      if (!response.ok || !Array.isArray(response.data)) {
        throw new Error(response.error ?? "翻译失败");
      }

      const translations = response.data;

      uniqueTexts.forEach((text, index) => {
        const translated = translations[index];

        if (typeof translated === "string" && translated.trim() && translated !== text) {
          translationCache.set(translationCacheKey(text), translated);
        }
      });
    }

    if (!isTranslated || generation !== pageTranslationGeneration) {
      return;
    }

    blocks.forEach((block) => {
      const key = block.original.trim();
      const translated = translationCache.get(translationCacheKey(key));
      processingContainers.delete(block.container);

      if (!translated || translated === block.original) {
        removeLoadingPlaceholder(block);
        translatedContainers.add(block.container);
        return;
      }

      finalizeBlockTranslation(block, translated);
    });

    setStatus(button, "done");
    scheduleAutoTranslate(80);
  } catch (error) {
    blocks.forEach((block) => {
      processingContainers.delete(block.container);
      removeLoadingPlaceholder(block);
    });
    console.warn("[translate] 页面翻译失败:", error);
    setStatus(button, "error");
  } finally {
    isBusy = false;
  }
}

function startAutoTranslateObservers(): void {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const container = entry.target as HTMLElement;

        if (entry.isIntersecting) {
          pendingIntersectionContainers.add(container);
          intersectionObserver?.unobserve(container);
        }
      });

      scheduleAutoTranslate(60);
    },
    {
      root: null,
      rootMargin: `${VIEWPORT_TRANSLATE_MARGIN}px 0px ${VIEWPORT_TRANSLATE_MARGIN}px 0px`,
      threshold: 0
    }
  );

  mutationObserver = new MutationObserver(() => scheduleObserveTextBlocks(260));
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function observePendingTextBlocks(): void {
  if (!intersectionObserver || !isTranslated) {
    return;
  }

  collectTextBlocks().forEach((block) => {
    const container = block.container;

    if (
      translatedContainers.has(container) ||
      processingContainers.has(container) ||
      observedContainers.has(container)
    ) {
      return;
    }

    observedContainers.set(container, block);
    intersectionObserver?.observe(container);
  });
}

async function retranslatePage(button: HTMLButtonElement): Promise<void> {
  if (isBusy) {
    return;
  }

  await readTranslationPreferences();
  removePageTranslations();
  translationCache.clear();
  await translatePage(button);
}

function createFloatingButton(): HTMLButtonElement {
  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color-scheme: light;
    }

    .floating-button {
      align-items: center;
      background: linear-gradient(135deg, #ff7aa5, #ef5b91);
      border: 0;
      border-radius: 999px;
      box-shadow: 0 10px 24px rgba(239, 91, 145, 0.32), 0 2px 10px rgba(18, 25, 38, 0.14);
      color: white;
      cursor: grab;
      display: flex;
      height: ${BUTTON_SIZE}px;
      justify-content: center;
      margin: 0;
      padding: 0;
      position: fixed;
      width: ${BUTTON_SIZE}px;
      z-index: 2147483647;
      transition: opacity 160ms ease, transform 160ms ease, box-shadow 160ms ease;
      -webkit-tap-highlight-color: transparent;
    }

    .floating-button::after {
      align-items: center;
      background: #12b76a;
      border: 2px solid #fff;
      border-radius: 999px;
      box-shadow: 0 3px 8px rgba(18, 183, 106, 0.28);
      box-sizing: border-box;
      color: #fff;
      content: "✓";
      display: flex;
      font: 800 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 16px;
      justify-content: center;
      opacity: 0;
      position: absolute;
      right: 2px;
      bottom: 2px;
      transform: scale(0.7);
      transition: opacity 140ms ease, transform 140ms ease;
      width: 16px;
    }

    .floating-button:hover,
    .floating-button:focus-visible {
      box-shadow: 0 12px 28px rgba(239, 91, 145, 0.38), 0 2px 12px rgba(18, 25, 38, 0.18);
      opacity: 1;
      outline: none;
      transform: translateX(var(--hover-shift, 0));
    }

    .floating-button[data-edge="left"] {
      --hover-shift: ${EDGE_PEEK}px;
    }

    .floating-button[data-edge="right"] {
      --hover-shift: -${EDGE_PEEK}px;
    }

    .floating-button:active {
      cursor: grabbing;
    }

    .floating-button[data-status="busy"] {
      cursor: progress;
      opacity: 0.86;
    }

    .floating-button[data-status="busy"] svg {
      animation: dtab-spin 900ms linear infinite;
    }

    .floating-button[data-status="done"] {
      background: linear-gradient(135deg, #2dbd7f, #0f9f78);
      box-shadow: 0 10px 24px rgba(15, 159, 120, 0.28), 0 2px 10px rgba(18, 25, 38, 0.14);
    }

    .floating-button[data-status="done"]::after {
      opacity: 1;
      transform: scale(1);
    }

    .floating-button[data-status="error"] {
      background: linear-gradient(135deg, #ff8a65, #e5484d);
    }

    .tool-button {
      align-items: center;
      background: #ffffff;
      border: 1px solid rgba(236, 90, 147, 0.24);
      border-radius: 999px;
      box-shadow: 0 10px 24px rgba(18, 25, 38, 0.14);
      color: #ec5a93;
      cursor: pointer;
      display: flex;
      height: ${SIDEPANEL_BUTTON_SIZE}px;
      justify-content: center;
      margin: 0;
      opacity: 0;
      padding: 0;
      pointer-events: none;
      position: fixed;
      transform: translateX(var(--tool-hidden-shift, 0)) scale(0.82);
      transition: opacity 160ms ease, transform 160ms ease, box-shadow 160ms ease;
      width: ${SIDEPANEL_BUTTON_SIZE}px;
      z-index: 2147483646;
      -webkit-tap-highlight-color: transparent;
    }

    :host(:hover) .tool-button,
    .tool-button:focus-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0) scale(1);
    }

    .tool-button:hover,
    .tool-button:focus-visible {
      box-shadow: 0 12px 28px rgba(236, 90, 147, 0.24);
      outline: none;
    }

    .tool-button[data-edge="left"] {
      --tool-hidden-shift: -8px;
    }

    .tool-button[data-edge="right"] {
      --tool-hidden-shift: 8px;
    }

    .close-button {
      background: #f3f4f6;
      border-color: #ffffff;
      color: #9ca3af;
    }

    svg {
      height: 24px;
      pointer-events: none;
      width: 24px;
    }

    .tool-button svg {
      height: 18px;
      width: 18px;
    }

    .tip {
      background: #0f1115;
      border-radius: 6px;
      color: #fff;
      font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      opacity: 0;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      top: calc(var(--button-top) + 7px);
      transition: opacity 140ms ease, transform 140ms ease;
      white-space: nowrap;
      z-index: 2147483646;
    }

    .tip[data-edge="left"] {
      left: 34px;
      transform: translateX(-4px);
    }

    .tip[data-edge="right"] {
      right: 34px;
      transform: translateX(4px);
    }

    .floating-button:hover + .tip,
    .floating-button:focus-visible + .tip {
      opacity: 1;
      transform: translateX(0);
    }

    .selection-bubble {
      background: #ffffff;
      border: 1px solid #e7edf4;
      border-radius: 10px;
      box-shadow: 0 16px 38px rgba(17, 24, 39, 0.18);
      color: #222936;
      display: grid;
      gap: 8px;
      left: 10px;
      max-width: calc(100vw - 20px);
      padding: 9px;
      position: fixed;
      top: 10px;
      width: ${SELECTION_BUBBLE_WIDTH}px;
      z-index: 2147483647;
    }

    .selection-bubble[hidden] {
      display: none;
    }

    .selection-row {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .selection-title {
      color: #5d6674;
      flex: 1 1 auto;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .selection-actions {
      align-items: center;
      display: flex;
      flex: 0 0 auto;
      gap: 6px;
    }

    .selection-action {
      background: #ec5a93;
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      cursor: pointer;
      flex: 0 0 auto;
      font: 800 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 30px;
      padding: 0 12px;
    }

    .selection-copy {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      color: #4b5563;
      cursor: pointer;
      flex: 0 0 auto;
      font: 800 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 30px;
      padding: 0 10px;
    }

    .selection-copy[hidden] {
      display: none;
    }

    .selection-action:disabled {
      cursor: progress;
      opacity: 0.72;
    }

    .selection-result {
      background: #f6f8fb;
      border-radius: 8px;
      color: #1f2937;
      font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-height: 180px;
      overflow: auto;
      padding: 9px 10px;
      white-space: pre-wrap;
    }

    .selection-bubble[data-status="error"] .selection-result {
      background: #fff4f3;
      color: #c03221;
    }

    @keyframes dtab-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "floating-button";
  button.ariaLabel = "译为简体中文";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5h8.8M8.4 3v2.5m2.8 0c-.8 3-2.8 5.2-6 6.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.2 8.4c1 1.8 2.2 3 3.8 3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M13.2 19.5l3.4-8 3.4 8m-5.6-3h4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const sidePanelButton = document.createElement("button");
  sidePanelButton.type = "button";
  sidePanelButton.className = "tool-button sidepanel-button";
  sidePanelButton.title = "打开翻译侧边栏";
  sidePanelButton.ariaLabel = "打开翻译侧边栏";
  sidePanelButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-13Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M14.5 4v16M7.5 8h4M7.5 11.5h4M7.5 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "tool-button close-button";
  closeButton.title = "关闭悬浮球";
  closeButton.ariaLabel = "关闭悬浮球";
  closeButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;

  const tip = document.createElement("span");
  tip.className = "tip";
  tip.textContent = "译为简体中文";

  const bubble = document.createElement("div");
  bubble.className = "selection-bubble";
  bubble.hidden = true;
  bubble.innerHTML = `
    <div class="selection-row">
      <span class="selection-title">选中文本</span>
      <span class="selection-actions">
        <button class="selection-copy" type="button" hidden>复制</button>
        <button class="selection-action" type="button">翻译</button>
      </span>
    </div>
    <div class="selection-result" hidden></div>
  `;
  bubble.addEventListener("pointerdown", (event) => {
    holdSelectionBubbleInteraction();
    event.preventDefault();
    event.stopPropagation();
  });
  bubble.addEventListener("pointerup", (event) => {
    holdSelectionBubbleInteraction();
    event.preventDefault();
    event.stopPropagation();
  });
  bubble.querySelector(".selection-action")?.addEventListener("click", (event) => {
    holdSelectionBubbleInteraction();
    event.preventDefault();
    event.stopPropagation();
    void translateSelection();
  });
  bubble.querySelector(".selection-copy")?.addEventListener("click", (event) => {
    holdSelectionBubbleInteraction();
    event.preventDefault();
    event.stopPropagation();
    void copySelectionTranslation();
  });

  shadow.append(style, button, tip, sidePanelButton, closeButton, bubble);
  selectionBubble = bubble;

  let startX = 0;
  let startY = 0;
  let startTop = 0;

  button.addEventListener("pointerdown", (event) => {
    hasMoved = false;
    startX = event.clientX;
    startY = event.clientY;
    startTop = position.y;
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (!button.hasPointerCapture(event.pointerId)) {
      return;
    }

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasMoved = true;
    }

    position.y = startTop + dy;
    position.edge = event.clientX < window.innerWidth / 2 ? "left" : "right";
    renderPosition(button, tip);
  });

  button.addEventListener("pointerup", (event) => {
    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    savePosition();
  });

  button.addEventListener("click", () => {
    if (hasMoved) {
      return;
    }

    void translatePage(button);
  });

  sidePanelButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openTranslateSidePanel();
  });

  closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeFloatingButton();
  });

  window.addEventListener("resize", () => renderPosition(button, tip));
  document.addEventListener("mouseup", () => {
    window.setTimeout(showSelectionBubble, 0);
  });
  document.addEventListener("selectionchange", () => {
    if (isSelectionBubbleInteracting) {
      return;
    }

    if (!document.getSelection()?.toString().trim()) {
      hideSelectionBubble();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSelectionBubble();
    }
  });
  window.addEventListener("scroll", hideSelectionBubble, true);
  setStatus(button, "idle");

  return button;
}

function renderPosition(button: HTMLButtonElement, tip?: HTMLElement): void {
  const root = button.getRootNode();
  const label =
    tip ?? (root instanceof ShadowRoot ? root.querySelector<HTMLElement>(".tip") : undefined);
  const sidePanelButton =
    root instanceof ShadowRoot
      ? root.querySelector<HTMLButtonElement>(".sidepanel-button")
      : undefined;
  const closeButton =
    root instanceof ShadowRoot ? root.querySelector<HTMLButtonElement>(".close-button") : undefined;

  applyPosition(button);
  button.dataset.edge = position.edge;
  button.style.setProperty("--button-top", `${position.y}px`);

  if (sidePanelButton) {
    applyToolButtonPosition(sidePanelButton, -42);
  }

  if (closeButton) {
    applyToolButtonPosition(closeButton, 42);
  }

  if (label) {
    label.dataset.edge = position.edge;
    label.style.setProperty("--button-top", `${position.y}px`);
  }
}

async function init() {
  if (!document.body || document.getElementById(ROOT_ID)) {
    return;
  }

  await readTranslationPreferences();
  await readPosition();
  floatingButton = createFloatingButton();
  renderPosition(floatingButton);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
} else {
  void init();
}

if (canUseExtensionRuntime()) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[TRANSLATION_PREFERENCES_KEY]) {
      return;
    }

    preferences = mergePreferences(changes[TRANSLATION_PREFERENCES_KEY].newValue);

    if (!preferences.selectionBubbleEnabled) {
      hideSelectionBubble();
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: RuntimeMessage,
      _sender,
      sendResponse: (response: RuntimeResponse<null>) => void
    ) => {
      if (message.type !== "TOGGLE_PAGE_TRANSLATION" && message.type !== "RETRANSLATE_PAGE") {
        return false;
      }

      if (!floatingButton) {
        sendResponse({ ok: false, error: "翻译按钮未初始化" });
        return false;
      }

      const action =
        message.type === "RETRANSLATE_PAGE"
          ? retranslatePage(floatingButton)
          : translatePage(floatingButton);

      action
        .then(() => sendResponse({ ok: true }))
        .catch((error) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "翻译失败" })
        );
      return true;
    }
  );
}

import type { RepoItem } from "./types";
import type { TranslationTargetLanguage } from "./types";

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
const TRANSLATE_REQUEST_TIMEOUT_MS = 10000;
const BATCH_SEPARATOR = "\n\n<<<DTAB_TRANSLATION_SEGMENT>>>\n\n";
const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/;
const LATIN_TEXT_PATTERN = /[A-Za-z]/;
const TEMPLATE_TEXT_PATTERN = /\{\{\s*(?:repoNameWithOwner|listsWithCount)\s*\}\}/;

function shouldTranslateDescription(description: string): boolean {
  const value = description.trim();

  return (
    value.length > 0 &&
    LATIN_TEXT_PATTERN.test(value) &&
    !CHINESE_TEXT_PATTERN.test(value) &&
    !TEMPLATE_TEXT_PATTERN.test(value)
  );
}

function hasBrokenTemplateDescription(description: string): boolean {
  return TEMPLATE_TEXT_PATTERN.test(description);
}

function readTranslatedText(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }

  return payload[0]
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
    .join("")
    .trim();
}

function readMyMemoryTranslatedText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const responseData = (payload as { responseData?: unknown }).responseData;

  if (!responseData || typeof responseData !== "object") {
    return "";
  }

  const translatedText = (responseData as { translatedText?: unknown }).translatedText;
  const responseStatus = (payload as { responseStatus?: unknown }).responseStatus;

  if (responseStatus === 429) {
    throw new Error("备用翻译接口额度已用完");
  }

  if (typeof translatedText !== "string") {
    return "";
  }

  if (/MYMEMORY WARNING|USAGELIMITS/i.test(translatedText)) {
    throw new Error("备用翻译接口额度已用完");
  }

  return translatedText.trim();
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSLATE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`翻译请求失败：${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("json")) {
      throw new Error("翻译接口返回了非 JSON 内容");
    }

    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("翻译请求超时");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function translateWithGoogle(
  text: string,
  targetLanguage: TranslationTargetLanguage
): Promise<string> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLanguage,
    dt: "t",
    q: text
  });

  return readTranslatedText(await fetchJsonWithTimeout(`${TRANSLATE_ENDPOINT}?${params.toString()}`));
}

async function translateWithMyMemory(
  text: string,
  targetLanguage: TranslationTargetLanguage
): Promise<string> {
  const params = new URLSearchParams({
    q: text,
    langpair: `en|${targetLanguage}`
  });

  return readMyMemoryTranslatedText(await fetchJsonWithTimeout(`${MYMEMORY_ENDPOINT}?${params.toString()}`));
}

export async function translateTextToChinese(
  text: string,
  targetLanguage: TranslationTargetLanguage = "zh-CN"
): Promise<string> {
  try {
    const translated = await translateWithGoogle(text, targetLanguage);

    if (translated) {
      return translated;
    }
  } catch (error) {
    console.warn("[translate] Google 翻译不可用，改用备用接口:", error);
  }

  return translateWithMyMemory(text, targetLanguage);
}

function splitBatchTranslation(translated: string, expectedCount: number): string[] {
  const parts = translated
    .split("<<<DTAB_TRANSLATION_SEGMENT>>>")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length === expectedCount ? parts : [];
}

export async function translateTextsToChinese(
  texts: string[],
  targetLanguage: TranslationTargetLanguage = "zh-CN"
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.length === 1) {
    return [await translateTextToChinese(texts[0], targetLanguage)];
  }

  const batchedText = texts.join(BATCH_SEPARATOR);

  try {
    const translated = await translateTextToChinese(batchedText, targetLanguage);
    const parts = splitBatchTranslation(translated, texts.length);

    if (parts.length === texts.length) {
      return parts;
    }
  } catch (error) {
    console.warn("[translate] 批量翻译失败，改用逐条翻译:", error);
  }

  return Promise.all(texts.map((text) => translateTextToChinese(text, targetLanguage)));
}

export async function translateRepoDescriptions(repos: RepoItem[]): Promise<RepoItem[]> {
  const translations = new Map<string, string>();
  const uniqueDescriptions = Array.from(
    new Set(repos.map((repo) => repo.description).filter(shouldTranslateDescription))
  );

  await Promise.allSettled(
    uniqueDescriptions.map(async (description) => {
      const translated = await translateTextToChinese(description);

      if (translated) {
        translations.set(description, translated);
      }
    })
  );

  return repos.map((repo) => {
    if (hasBrokenTemplateDescription(repo.description)) {
      return {
        ...repo,
        description: "",
        originalDescription: repo.originalDescription ?? repo.description
      };
    }

    const translated = translations.get(repo.description);

    if (!translated || translated === repo.description) {
      return repo;
    }

    return {
      ...repo,
      description: translated,
      originalDescription: repo.originalDescription ?? repo.description
    };
  });
}

export const translationInternals = {
  shouldTranslateDescription,
  hasBrokenTemplateDescription,
  readTranslatedText,
  readMyMemoryTranslatedText,
  splitBatchTranslation
};

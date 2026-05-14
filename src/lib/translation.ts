import type { RepoItem } from "./types";

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
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

async function translateTextToChinese(text: string): Promise<string> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: "zh-CN",
    dt: "t",
    q: text
  });
  const response = await fetch(`${TRANSLATE_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`翻译请求失败：${response.status}`);
  }

  return readTranslatedText(await response.json());
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
  readTranslatedText
};

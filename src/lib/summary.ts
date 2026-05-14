import type { RepoItem, RepoSummary } from "./types";

const LANGUAGE_LABELS: Record<string, string> = {
  TypeScript: "前端、全栈或工程化场景",
  JavaScript: "Web、自动化或轻量工具场景",
  Python: "AI、数据处理或自动化场景",
  Rust: "高性能工具、系统编程或 CLI 场景",
  Go: "后端服务、云原生或命令行工具场景",
  Shell: "终端工作流、运维脚本或开发效率场景",
  Swift: "Apple 平台应用或原生工具场景",
  "C++": "底层系统、推理框架或性能敏感场景",
  Java: "企业服务、后端平台或 Android 生态场景"
};

const TOPIC_HINTS: Array<[RegExp, string]> = [
  [/agent|agents|ai-agent|llm|gpt|chatgpt|claude|deepseek/i, "AI Agent 和大模型工作流"],
  [/cli|terminal|shell|command-line/i, "命令行效率工具"],
  [/browser|chrome|extension/i, "浏览器与扩展生态"],
  [/workflow|automation|productivity/i, "自动化和生产力工具"],
  [/data|database|analytics|search/i, "数据处理与检索"],
  [/ui|frontend|react|vue|desktop/i, "界面开发与客户端体验"],
  [/security|auth|privacy/i, "安全、隐私或权限治理"],
  [/devops|kubernetes|docker|cloud/i, "云原生与运维平台"]
];

function compactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
}

function normalizeSentence(value: string): string {
  const sentence = value.replace(/\s+/g, " ").trim();

  if (!sentence) {
    return "";
  }

  return sentence.length > 72 ? `${sentence.slice(0, 70)}...` : sentence;
}

function inferTopic(repo: RepoItem): string {
  const haystack = [repo.fullName, repo.description, repo.originalDescription, ...repo.topics].join(" ");
  const matched = TOPIC_HINTS.find(([pattern]) => pattern.test(haystack));

  return matched?.[1] ?? LANGUAGE_LABELS[repo.language] ?? "开源项目探索和技术选型";
}

function buildSignal(repo: RepoItem): string {
  if (repo.growth > 0) {
    return `近期增长 ${compactNumber(repo.growth)}，总 Star ${compactNumber(repo.stars)}`;
  }

  return `总 Star ${compactNumber(repo.stars)}，适合纳入候选清单`;
}

export function createRepoSummary(repo: RepoItem): RepoSummary {
  const description = normalizeSentence(repo.description);
  const topic = inferTopic(repo);
  const oneLine = description || `${repo.fullName} 是一个值得进一步查看的开源项目。`;

  return {
    oneLine,
    bestFor: `适合：${topic}`,
    signal: buildSignal(repo)
  };
}

export function attachRepoSummaries(repos: RepoItem[]): RepoItem[] {
  return repos.map((repo) => ({
    ...repo,
    summary: createRepoSummary(repo)
  }));
}


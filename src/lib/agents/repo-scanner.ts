import { getRepoScannerPrompt } from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import type { AgentStreamEvent } from "@/types";

export interface ScanResult {
  description: string;
  domain: string;
  serviceType: string;
  techStack: string;
  exposedApis: string[];
  dependencies: string[];
}

export interface ScanProgress {
  status: "scanning" | "done" | "error";
  message?: string;
  result?: ScanResult;
}

/**
 * Scan a repo using RepoAgent to extract service metadata.
 * Yields progress events and returns structured metadata.
 */
export async function* scanRepo(
  repoName: string,
  repoPath: string,
  provider?: AgentProvider,
): AsyncGenerator<AgentStreamEvent, ScanResult | null> {
  const effectiveProvider = provider || getDefaultProvider();

  const systemPrompt = getRepoScannerPrompt(repoName, repoPath);
  const message =
    "Analyze this repository and extract service metadata. Follow the analysis strategy in your system prompt.";

  let fullText = "";

  for await (const event of effectiveProvider.query({
    message,
    systemPrompt,
    tools: "Read,Glob,Grep,Bash",
    model: "sonnet",
    cwd: repoPath,
  })) {
    if (event.type === "text" && event.content) {
      fullText += event.content;
    }
    yield event;
  }

  // Parse the scan result
  const codeBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const rawJsonMatch = fullText.match(/\{[\s\S]*\}/);
  const jsonStr = codeBlockMatch?.[1] || rawJsonMatch?.[0];

  if (!jsonStr) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr) as ScanResult;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Scan a repo with additional document context.
 * Combines document content with code analysis for more accurate results.
 */
export async function* scanRepoWithDoc(
  repoName: string,
  repoPath: string,
  documentContent: string,
  provider?: AgentProvider,
): AsyncGenerator<AgentStreamEvent, ScanResult | null> {
  const effectiveProvider = provider || getDefaultProvider();

  const systemPrompt = getRepoScannerPrompt(repoName, repoPath);
  const message = `Analyze this repository and extract service metadata. You also have the following reference document to help with your analysis:

---
${documentContent}
---

Use both the code analysis and the document above to produce accurate metadata. Follow the analysis strategy in your system prompt.`;

  let fullText = "";

  for await (const event of effectiveProvider.query({
    message,
    systemPrompt,
    tools: "Read,Glob,Grep,Bash",
    model: "sonnet",
    cwd: repoPath,
  })) {
    if (event.type === "text" && event.content) {
      fullText += event.content;
    }
    yield event;
  }

  const codeBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const rawJsonMatch = fullText.match(/\{[\s\S]*\}/);
  const jsonStr = codeBlockMatch?.[1] || rawJsonMatch?.[0];

  if (!jsonStr) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr) as ScanResult;
    return parsed;
  } catch {
    return null;
  }
}

import { getOrchestratorSystemPrompt } from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import type { AgentStreamEvent } from "@/types";

interface RepoInfo {
  repoId: string;
  repoName: string;
  repoPath: string;
}

export interface OrchestratorConfig {
  repos: RepoInfo[];
  model?: string;
  maxBudgetUsd?: number;
  provider?: AgentProvider;
}

/**
 * OrchestratorAgent coordinates analysis across multiple repos.
 * Uses an AgentProvider with subagents for each repo.
 */
export class OrchestratorAgent {
  private config: OrchestratorConfig;
  private provider: AgentProvider;
  private sessionId: string | null = null;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.provider = config.provider || getDefaultProvider();
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  async *query(
    message: string,
    conversationSessionId?: string,
    model?: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const sid = conversationSessionId || this.sessionId;
    yield* this.runQuery(message, sid, model);
  }

  private async *runQuery(
    message: string,
    sessionId?: string | null,
    model?: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const repoDescriptions = this.config.repos
      .map((r) => `- **${r.repoName}**: ${r.repoPath}`)
      .join("\n");

    const systemPrompt = getOrchestratorSystemPrompt(repoDescriptions);

    const agentsObj: Record<string, { description: string; prompt: string }> =
      {};
    for (const repo of this.config.repos) {
      agentsObj[repo.repoName] = {
        description: `Analyzes the ${repo.repoName} repository at ${repo.repoPath}`,
        prompt: `You are a code analysis expert for the "${repo.repoName}" repository located at ${repo.repoPath}. Use Read, Glob, Grep, and Bash (read-only) to analyze the code and answer questions. Always provide specific file paths and line numbers. Respond in 繁體中文.`,
      };
    }

    let hasContent = false;
    let resumeFailed = false;

    for await (const event of this.provider.query({
      message,
      systemPrompt,
      model: model || this.config.model || "sonnet",
      maxBudgetUsd: this.config.maxBudgetUsd || 2.0,
      cwd: process.cwd(),
      sessionId,
      agents:
        this.config.repos.length > 0 ? agentsObj : undefined,
    })) {
      if (event.type === "text" && event.content) {
        hasContent = true;
      }

      if (event.sessionId) {
        this.sessionId = event.sessionId;
      }

      if (
        event.type === "error" &&
        sessionId &&
        !hasContent &&
        typeof event.error === "string" &&
        (event.error.includes("session") ||
          event.error.includes("resume") ||
          event.error.includes("exited with code"))
      ) {
        resumeFailed = true;
        continue;
      }

      if (event.type === "done" && resumeFailed && !hasContent) {
        console.warn(
          `[OrchestratorAgent] Session resume failed, retrying without session`
        );
        yield* this.runQuery(message, null, model);
        return;
      }

      yield event;
    }
  }
}

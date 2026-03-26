import { getRepoAgentSystemPrompt } from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import type { AgentStreamEvent } from "@/types";

export interface RepoAgentConfig {
  repoId: string;
  repoName: string;
  repoPath: string;
  model?: string;
  maxBudgetUsd?: number;
  provider?: AgentProvider;
  customPrompt?: string | null;
}

/**
 * RepoAgent wraps an AgentProvider to provide
 * streaming code analysis for a single repo.
 */
export class RepoAgent {
  private config: RepoAgentConfig;
  private provider: AgentProvider;
  private sessionId: string | null = null;

  constructor(config: RepoAgentConfig) {
    this.config = config;
    this.provider = config.provider || getDefaultProvider();
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Send a message to the agent and get a streaming response.
   * Yields AgentStreamEvent objects as they arrive.
   */
  async *query(
    message: string,
    conversationSessionId?: string,
    model?: string,
    outputStylePrompt?: string | null,
  ): AsyncGenerator<AgentStreamEvent> {
    const sid = conversationSessionId || this.sessionId;
    yield* this.runQuery(message, sid, model, outputStylePrompt);
  }

  private async *runQuery(
    message: string,
    sessionId?: string | null,
    model?: string,
    outputStylePrompt?: string | null,
  ): AsyncGenerator<AgentStreamEvent> {
    const systemPrompt = getRepoAgentSystemPrompt(
      this.config.repoName,
      this.config.repoPath,
      this.config.customPrompt,
      outputStylePrompt
    );

    let hasContent = false;
    let resumeFailed = false;

    for await (const event of this.provider.query({
      message,
      systemPrompt,
      tools: "Read,Glob,Grep,Bash",
      model: model || this.config.model || "sonnet",
      maxBudgetUsd: this.config.maxBudgetUsd,
      cwd: this.config.repoPath,
      sessionId,
    })) {
      if (event.type === "text" && event.content) {
        hasContent = true;
      }

      // Track session ID from provider
      if (event.sessionId) {
        this.sessionId = event.sessionId;
      }

      // Detect resume failure from error events
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
          `[RepoAgent:${this.config.repoName}] Session resume failed, retrying without session`
        );
        yield* this.runQuery(message, null, model, outputStylePrompt);
        return;
      }

      yield event;
    }
  }
}

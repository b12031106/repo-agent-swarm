import path from "path";
import { getOrchestratorDirectPrompt } from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import type { AgentStreamEvent } from "@/types";

export interface OrchestratorConfig {
  model?: string;
  maxBudgetUsd?: number;
  provider?: AgentProvider;
  customPrompt?: string | null;
  structuredOutput?: boolean;
}

/**
 * OrchestratorAgent runs a single Claude Code CLI from the repos parent directory,
 * letting Claude Code explore all repos as needed using its native tools.
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
    const systemPrompt = getOrchestratorDirectPrompt(this.config.customPrompt, {
      structuredOutput: this.config.structuredOutput,
      outputStylePrompt,
    });

    const reposDir = path.join(process.cwd(), "repos");

    let hasContent = false;
    let resumeFailed = false;

    for await (const event of this.provider.query({
      message,
      systemPrompt,
      tools: "Read,Glob,Grep,Bash",
      model: model || this.config.model || "sonnet",
      maxBudgetUsd: this.config.maxBudgetUsd,
      cwd: reposDir,
      sessionId,
    })) {
      if (event.type === "text" && event.content) {
        hasContent = true;
      }

      if (event.sessionId) {
        this.sessionId = event.sessionId;
      }

      // Detect session resume failure
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
        console.warn("[OrchestratorAgent] Session resume failed, retrying without session");
        yield* this.runQuery(message, null, model, outputStylePrompt);
        return;
      }

      yield event;
    }
  }
}

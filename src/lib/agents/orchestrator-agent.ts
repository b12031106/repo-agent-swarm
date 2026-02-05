import {
  getOrchestratorPlanningPrompt,
  getOrchestratorSynthesisPrompt,
} from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import { RepoAgent } from "./repo-agent";
import type { AgentStreamEvent } from "@/types";

interface RepoInfo {
  repoId: string;
  repoName: string;
  repoPath: string;
  customPrompt?: string | null;
}

interface PlanQuery {
  repoId: string;
  repoName: string;
  question: string;
}

interface PlanResult {
  reasoning: string;
  queries: PlanQuery[];
}

interface SubAgentResult {
  repoId: string;
  repoName: string;
  query: string;
  text: string;
  error?: string;
}

export interface OrchestratorConfig {
  repos: RepoInfo[];
  model?: string;
  maxBudgetUsd?: number;
  provider?: AgentProvider;
  customPrompt?: string | null;
}

const MAX_PARALLEL_AGENTS = 3;

/**
 * OrchestratorAgent coordinates analysis across multiple repos
 * using a three-phase approach: Planning → Execution → Synthesis.
 */
export class OrchestratorAgent {
  private config: OrchestratorConfig;
  private provider: AgentProvider;
  private sessionId: string | null = null;
  private activeProcesses: Set<RepoAgent> = new Set();

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
    const effectiveModel = model || this.config.model || "sonnet";

    // Phase 1: Planning
    yield { type: "phase_start", phase: "planning" };

    let plan: PlanResult;
    try {
      plan = yield* this.runPlanning(message, effectiveModel);
    } catch (err) {
      // Fallback: query all repos
      console.warn("[OrchestratorAgent] Planning failed, querying all repos:", err);
      plan = {
        reasoning: "Planning failed, querying all repos as fallback",
        queries: this.config.repos.map((r) => ({
          repoId: r.repoId,
          repoName: r.repoName,
          question: message,
        })),
      };
    }

    yield { type: "phase_end", phase: "planning" };

    // If no queries needed (general chat), go straight to synthesis
    let subAgentResults: SubAgentResult[] = [];

    if (plan.queries.length > 0) {
      // Phase 2: Parallel Execution
      yield { type: "phase_start", phase: "execution" };

      subAgentResults = yield* this.runExecution(plan.queries, effectiveModel);

      yield { type: "phase_end", phase: "execution" };
    }

    // Phase 3: Synthesis
    yield { type: "phase_start", phase: "synthesis" };

    yield* this.runSynthesis(message, subAgentResults, sid, effectiveModel);

    yield { type: "phase_end", phase: "synthesis" };
  }

  /**
   * Phase 1: Ask the LLM to analyze which repos to query.
   * Uses haiku for cost efficiency.
   */
  private async *runPlanning(
    message: string,
    _effectiveModel: string,
  ): AsyncGenerator<AgentStreamEvent, PlanResult> {
    const repoDescriptions = this.config.repos
      .map((r) => `- **${r.repoName}** (id: ${r.repoId}): ${r.repoPath}`)
      .join("\n");

    const systemPrompt = getOrchestratorPlanningPrompt(
      repoDescriptions,
      this.config.customPrompt,
    );

    let fullText = "";

    for await (const event of this.provider.query({
      message,
      systemPrompt,
      model: "haiku",
      maxBudgetUsd: 0.1,
      cwd: process.cwd(),
    })) {
      if (event.type === "text" && event.content) {
        fullText += event.content;
        yield { type: "text", content: event.content, phase: "planning" };
      }
    }

    // Extract JSON from response — try markdown code block first, then raw JSON
    const codeBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const rawJsonMatch = fullText.match(/\{[\s\S]*\}/);
    const jsonStr = codeBlockMatch?.[1] || rawJsonMatch?.[0];
    if (!jsonStr) {
      throw new Error("No JSON found in planning response");
    }

    const parsed = JSON.parse(jsonStr) as PlanResult;

    // Validate repo IDs
    const validRepoIds = new Set(this.config.repos.map((r) => r.repoId));
    parsed.queries = parsed.queries.filter((q) => validRepoIds.has(q.repoId));

    return parsed;
  }

  /**
   * Phase 2: Run RepoAgents in parallel, merging their streams.
   */
  private async *runExecution(
    queries: PlanQuery[],
    effectiveModel: string,
  ): AsyncGenerator<AgentStreamEvent, SubAgentResult[]> {
    const results: SubAgentResult[] = [];

    // Process in batches of MAX_PARALLEL_AGENTS
    for (let i = 0; i < queries.length; i += MAX_PARALLEL_AGENTS) {
      const batch = queries.slice(i, i + MAX_PARALLEL_AGENTS);

      // Emit subagent_start for each agent in the batch
      for (const q of batch) {
        yield {
          type: "subagent_start",
          subagentId: q.repoId,
          subagentName: q.repoName,
          subagentQuery: q.question,
        };
      }

      // Create RepoAgents and collect their generators
      const agentEntries: Array<{
        query: PlanQuery;
        agent: RepoAgent;
        gen: AsyncGenerator<AgentStreamEvent>;
        text: string;
        done: boolean;
        error?: string;
      }> = [];

      for (const q of batch) {
        const repoInfo = this.config.repos.find((r) => r.repoId === q.repoId);
        if (!repoInfo) continue;

        const agent = new RepoAgent({
          repoId: q.repoId,
          repoName: q.repoName,
          repoPath: repoInfo.repoPath,
          model: effectiveModel,
          maxBudgetUsd: 0.5,
          provider: this.provider,
          customPrompt: repoInfo.customPrompt,
        });

        this.activeProcesses.add(agent);
        const gen = agent.query(q.question);
        agentEntries.push({ query: q, agent, gen, text: "", done: false });
      }

      // Merge streams: maintain one pending promise per agent to avoid losing events
      const pendingMap = new Map<
        string,
        Promise<{ entry: (typeof agentEntries)[number]; result: IteratorResult<AgentStreamEvent> }>
      >();

      // Initialize first .next() for each agent
      for (const entry of agentEntries) {
        pendingMap.set(
          entry.query.repoId,
          entry.gen.next().then((result) => ({ entry, result }))
        );
      }

      while (pendingMap.size > 0) {
        const { entry, result } = await Promise.race(pendingMap.values());

        if (result.done) {
          entry.done = true;
          pendingMap.delete(entry.query.repoId);
          this.activeProcesses.delete(entry.agent);

          results.push({
            repoId: entry.query.repoId,
            repoName: entry.query.repoName,
            query: entry.query.question,
            text: entry.text,
            error: entry.error,
          });

          yield {
            type: "subagent_end",
            subagentId: entry.query.repoId,
            subagentName: entry.query.repoName,
            error: entry.error,
          };
          continue;
        }

        const event = result.value;

        // Accumulate text
        if (event.type === "text" && event.content) {
          entry.text += event.content;
        }

        // Track errors
        if (event.type === "error" && event.error) {
          entry.error = event.error;
        }

        // Wrap and yield as subagent_event
        yield {
          type: "subagent_event",
          subagentId: entry.query.repoId,
          subagentName: entry.query.repoName,
          innerEvent: event,
        };

        // Queue next .next() only for this consumed agent
        pendingMap.set(
          entry.query.repoId,
          entry.gen.next().then((r) => ({ entry, result: r }))
        );
      }
    }

    return results;
  }

  /**
   * Phase 3: Synthesize all results into a final response.
   * Uses --resume for multi-turn memory.
   */
  private async *runSynthesis(
    originalMessage: string,
    subAgentResults: SubAgentResult[],
    sessionId?: string | null,
    effectiveModel?: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const repoDescriptions = this.config.repos
      .map((r) => `- **${r.repoName}**: ${r.repoPath}`)
      .join("\n");

    const systemPrompt = getOrchestratorSynthesisPrompt(
      repoDescriptions,
      this.config.customPrompt,
    );

    // Build context message
    let contextMessage = `User question: ${originalMessage}\n\n`;

    if (subAgentResults.length > 0) {
      contextMessage += "## Repo Agent Analysis Results\n\n";
      for (const result of subAgentResults) {
        contextMessage += `### ${result.repoName}\n`;
        contextMessage += `**Query:** ${result.query}\n`;
        if (result.error) {
          contextMessage += `**Error:** ${result.error}\n`;
        }
        if (result.text) {
          contextMessage += `**Analysis:**\n${result.text}\n`;
        }
        contextMessage += "\n";
      }
      contextMessage +=
        "Please synthesize the above findings and provide a comprehensive response.";
    }

    let hasContent = false;
    let resumeFailed = false;

    for await (const event of this.provider.query({
      message: contextMessage,
      systemPrompt,
      model: effectiveModel || "sonnet",
      maxBudgetUsd: this.config.maxBudgetUsd || 2.0,
      cwd: process.cwd(),
      sessionId,
    })) {
      if (event.type === "text" && event.content) {
        hasContent = true;
      }

      if (event.sessionId) {
        this.sessionId = event.sessionId;
      }

      // Detect resume failure
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
          "[OrchestratorAgent] Synthesis session resume failed, retrying without session"
        );
        yield* this.runSynthesis(
          originalMessage,
          subAgentResults,
          null,
          effectiveModel,
        );
        return;
      }

      yield event;
    }
  }
}

import {
  getOrchestratorPlanningPrompt,
  getOrchestratorSynthesisPrompt,
  getOrchestratorReflectionPrompt,
  getIterativePlanningPrompt,
  buildRepoDescriptions,
  type RepoMetaForPrompt,
  type IterationContext,
} from "./prompts";
import { getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";
import { RepoAgent } from "./repo-agent";
import type { AgentStreamEvent } from "@/types";

interface RepoInfo extends RepoMetaForPrompt {
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

interface ReflectionResult {
  assessment: string;
  sufficient: boolean;
  additionalQueries: Array<PlanQuery & { reason?: string }>;
}

export interface OrchestratorConfig {
  repos: RepoInfo[];
  model?: string;
  maxBudgetUsd?: number;
  provider?: AgentProvider;
  customPrompt?: string | null;
  // Multi-iteration config
  maxIterations?: number;
  structuredOutput?: boolean;
  planningModel?: string;
  reflectionModel?: string;
  synthesisModel?: string;
}

const MAX_PARALLEL_AGENTS = 3;
const DEFAULT_MAX_ITERATIONS = 1;
const BUDGET_SAFETY_THRESHOLD = 0.8;

/**
 * OrchestratorAgent coordinates analysis across multiple repos
 * using a multi-phase approach: [Planning → Execution → Reflection]* → Synthesis.
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
    const maxIterations = this.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const totalBudget = this.config.maxBudgetUsd || 5.0;

    let allResults: SubAgentResult[] = [];
    let accumulatedCost = 0;
    let iteration = 0;
    let needsMoreInfo = true;

    const repoDescriptions = buildRepoDescriptions(this.config.repos);

    while (needsMoreInfo && iteration < maxIterations) {
      iteration++;

      // Emit iteration_start for multi-iteration runs
      if (maxIterations > 1) {
        yield {
          type: "iteration_start",
          iteration,
          maxIterations,
        };
      }

      // Phase 1: Planning
      yield { type: "phase_start", phase: "planning" };

      let plan: PlanResult;
      try {
        const iterContext: IterationContext = {
          iteration,
          previousResults: allResults.map((r) => ({
            repoName: r.repoName,
            summary: r.text.length > 500 ? r.text.slice(0, 500) + "..." : r.text,
          })),
        };

        plan = yield* this.runPlanning(
          message,
          repoDescriptions,
          iterContext,
        );
      } catch (err) {
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

      // If no queries needed (general chat), skip to synthesis
      if (plan.queries.length === 0) {
        needsMoreInfo = false;
        break;
      }

      // Phase 2: Parallel Execution
      yield { type: "phase_start", phase: "execution" };

      const batchResults = yield* this.runExecution(plan.queries, effectiveModel);
      allResults = [...allResults, ...batchResults];

      yield { type: "phase_end", phase: "execution" };

      // Check budget before reflection
      // Rough cost estimation: each iteration ~$0.5-1.5
      accumulatedCost += batchResults.length * 0.5 + 0.1; // rough estimate
      if (accumulatedCost >= totalBudget * BUDGET_SAFETY_THRESHOLD) {
        console.warn("[OrchestratorAgent] Budget threshold reached, ending iterations");
        needsMoreInfo = false;
        break;
      }

      // Phase 3: Reflection (only if maxIterations > 1 and not last iteration)
      if (maxIterations > 1 && iteration < maxIterations) {
        yield { type: "phase_start", phase: "reflection" };

        try {
          const reflectionResult = yield* this.runReflection(
            message,
            allResults,
            repoDescriptions,
          );

          if (reflectionResult.sufficient || reflectionResult.additionalQueries.length === 0) {
            needsMoreInfo = false;
          }
          // If not sufficient, the next iteration's planning will pick it up
        } catch (err) {
          console.warn("[OrchestratorAgent] Reflection failed, proceeding to synthesis:", err);
          needsMoreInfo = false;
        }

        yield { type: "phase_end", phase: "reflection" };
      } else {
        needsMoreInfo = false;
      }

      if (maxIterations > 1) {
        yield {
          type: "iteration_end",
          iteration,
          maxIterations,
        };
      }
    }

    // Phase 4: Synthesis
    yield { type: "phase_start", phase: "synthesis" };

    yield* this.runSynthesis(
      message,
      allResults,
      repoDescriptions,
      sid,
      effectiveModel,
    );

    yield { type: "phase_end", phase: "synthesis" };
  }

  /**
   * Phase 1: Ask the LLM to analyze which repos to query.
   */
  private async *runPlanning(
    message: string,
    repoDescriptions: string,
    iterContext?: IterationContext,
  ): AsyncGenerator<AgentStreamEvent, PlanResult> {
    const planningModel = this.config.planningModel || "haiku";

    const systemPrompt = iterContext && iterContext.iteration > 1
      ? getIterativePlanningPrompt(
          repoDescriptions,
          this.config.customPrompt,
          iterContext,
        )
      : getOrchestratorPlanningPrompt(
          repoDescriptions,
          this.config.customPrompt,
        );

    let fullText = "";

    for await (const event of this.provider.query({
      message,
      systemPrompt,
      model: planningModel,
      maxBudgetUsd: 0.1,
      cwd: process.cwd(),
    })) {
      if (event.type === "text" && event.content) {
        fullText += event.content;
        yield { type: "text", content: event.content, phase: "planning" };
      }
    }

    // Extract JSON from response
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

      // Merge streams: maintain one pending promise per agent
      const pendingMap = new Map<
        string,
        Promise<{ entry: (typeof agentEntries)[number]; result: IteratorResult<AgentStreamEvent> }>
      >();

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

        if (event.type === "text" && event.content) {
          entry.text += event.content;
        }

        if (event.type === "error" && event.error) {
          entry.error = event.error;
        }

        yield {
          type: "subagent_event",
          subagentId: entry.query.repoId,
          subagentName: entry.query.repoName,
          innerEvent: event,
        };

        pendingMap.set(
          entry.query.repoId,
          entry.gen.next().then((r) => ({ entry, result: r }))
        );
      }
    }

    return results;
  }

  /**
   * Phase 3: Reflection — evaluate if gathered information is sufficient.
   */
  private async *runReflection(
    originalMessage: string,
    subAgentResults: SubAgentResult[],
    repoDescriptions: string,
  ): AsyncGenerator<AgentStreamEvent, ReflectionResult> {
    const reflectionModel = this.config.reflectionModel || "haiku";

    const systemPrompt = getOrchestratorReflectionPrompt(
      repoDescriptions,
      this.config.customPrompt,
    );

    // Build context for reflection
    let contextMessage = `User question: ${originalMessage}\n\n`;
    contextMessage += "## Collected Analysis Results\n\n";
    for (const result of subAgentResults) {
      const summary = result.text.length > 800
        ? result.text.slice(0, 800) + "..."
        : result.text;
      contextMessage += `### ${result.repoName}\n`;
      contextMessage += `**Query:** ${result.query}\n`;
      if (result.error) contextMessage += `**Error:** ${result.error}\n`;
      contextMessage += `**Analysis:** ${summary}\n\n`;
    }
    contextMessage += "Please evaluate if this information is sufficient.";

    let fullText = "";

    for await (const event of this.provider.query({
      message: contextMessage,
      systemPrompt,
      model: reflectionModel,
      maxBudgetUsd: 0.1,
      cwd: process.cwd(),
    })) {
      if (event.type === "text" && event.content) {
        fullText += event.content;
        yield { type: "text", content: event.content, phase: "reflection" };
      }
    }

    // Parse reflection JSON
    const codeBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const rawJsonMatch = fullText.match(/\{[\s\S]*\}/);
    const jsonStr = codeBlockMatch?.[1] || rawJsonMatch?.[0];
    if (!jsonStr) {
      return { assessment: "Parse failed", sufficient: true, additionalQueries: [] };
    }

    try {
      const parsed = JSON.parse(jsonStr) as ReflectionResult;

      // Validate repo IDs in additional queries
      const validRepoIds = new Set(this.config.repos.map((r) => r.repoId));
      parsed.additionalQueries = (parsed.additionalQueries || []).filter(
        (q) => validRepoIds.has(q.repoId)
      );

      return parsed;
    } catch {
      return { assessment: "Parse failed", sufficient: true, additionalQueries: [] };
    }
  }

  /**
   * Phase 4: Synthesize all results into a final response.
   * Uses --resume for multi-turn memory.
   */
  private async *runSynthesis(
    originalMessage: string,
    subAgentResults: SubAgentResult[],
    repoDescriptions: string,
    sessionId?: string | null,
    effectiveModel?: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const synthesisModel = this.config.synthesisModel || effectiveModel || "sonnet";

    const systemPrompt = getOrchestratorSynthesisPrompt(
      repoDescriptions,
      this.config.customPrompt,
      { structuredOutput: this.config.structuredOutput },
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
      model: synthesisModel,
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
          repoDescriptions,
          null,
          effectiveModel,
        );
        return;
      }

      yield event;
    }
  }
}

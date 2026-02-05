import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { OrchestratorAgent } from "@/lib/agents/orchestrator-agent";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import type { AgentStreamEvent } from "@/types";

/** POST /api/chat/orchestrator - Send a message to the orchestrator */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, conversationId, model } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Get all ready repos
  const readyRepos = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.status, "ready"))
    .all();

  if (readyRepos.length === 0) {
    return new Response(
      JSON.stringify({ error: "No repos available. Register at least one repo first." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Get or create conversation
  let convId = conversationId;
  let sessionId: string | undefined;
  let convModel: string | undefined;

  if (convId) {
    const conv = db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, convId))
      .get();
    if (conv) {
      sessionId = conv.sessionId || undefined;
      convModel = conv.model || undefined;
    }
  }

  const effectiveModel = model || convModel || "sonnet";

  if (!convId) {
    convId = uuidv4();
    db.insert(schema.conversations)
      .values({
        id: convId,
        repoId: null,
        title: message.slice(0, 100),
        isOrchestrator: true,
        model: effectiveModel,
      })
      .run();
  } else if (model && model !== convModel) {
    db.update(schema.conversations)
      .set({ model })
      .where(eq(schema.conversations.id, convId))
      .run();
  }

  // Save user message
  db.insert(schema.messages)
    .values({
      id: uuidv4(),
      conversationId: convId,
      role: "user",
      content: message,
    })
    .run();

  // Read orchestrator custom prompt from settings
  const orchestratorPromptSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "orchestrator_custom_prompt"))
    .get();

  // Create orchestrator agent
  const orchestrator = new OrchestratorAgent({
    repos: readyRepos.map((r) => ({
      repoId: r.id,
      repoName: r.name,
      repoPath: r.localPath,
      customPrompt: r.customPrompt,
    })),
    customPrompt: orchestratorPromptSetting?.value || null,
  });

  if (sessionId) {
    orchestrator.setSessionId(sessionId);
  }

  const finalConvId = convId;

  // Track current phase to know when to accumulate text
  let currentPhase: string | null = null;

  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    let fullAssistantText = "";
    let resultSessionId: string | undefined;
    let totalUsage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

    for await (const event of orchestrator.query(message, sessionId, effectiveModel)) {
      // Track phase transitions
      if (event.type === "phase_start") {
        currentPhase = event.phase || null;
      } else if (event.type === "phase_end") {
        currentPhase = null;
      }

      // Only accumulate text from synthesis phase (the final response)
      if (event.type === "text" && event.content && currentPhase === "synthesis") {
        fullAssistantText += event.content;
      }

      if (event.sessionId) {
        resultSessionId = event.sessionId;
      }

      // Accumulate usage from all phases (done events from subagents too)
      if (event.type === "done" && event.usage) {
        totalUsage.input_tokens += event.usage.input_tokens;
        totalUsage.output_tokens += event.usage.output_tokens;
        totalUsage.cost_usd += event.usage.cost_usd;
      }

      // Also accumulate usage from subagent inner events
      if (
        event.type === "subagent_event" &&
        event.innerEvent?.type === "done" &&
        event.innerEvent.usage
      ) {
        totalUsage.input_tokens += event.innerEvent.usage.input_tokens;
        totalUsage.output_tokens += event.innerEvent.usage.output_tokens;
        totalUsage.cost_usd += event.innerEvent.usage.cost_usd;
      }

      yield { ...event, conversationId: finalConvId } as AgentStreamEvent & {
        conversationId: string;
      };
    }

    // Save aggregated usage
    if (totalUsage.input_tokens > 0 || totalUsage.output_tokens > 0) {
      db.insert(schema.usageRecords)
        .values({
          id: uuidv4(),
          conversationId: finalConvId,
          inputTokens: totalUsage.input_tokens,
          outputTokens: totalUsage.output_tokens,
          totalCostUsd: totalUsage.cost_usd,
        })
        .run();
    }

    if (fullAssistantText) {
      db.insert(schema.messages)
        .values({
          id: uuidv4(),
          conversationId: finalConvId,
          role: "assistant",
          content: fullAssistantText,
        })
        .run();
    }

    if (resultSessionId) {
      db.update(schema.conversations)
        .set({
          sessionId: resultSessionId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.conversations.id, finalConvId))
        .run();
    }
  }

  const stream = createSSEStream(streamWithPersistence(), {
    onCancel: (accumulatedText) => {
      // accumulatedText from SSE encoder includes ALL text events (planning + synthesis)
      // We only want synthesis text, but on cancel we save whatever we have
      if (accumulatedText) {
        db.insert(schema.messages)
          .values({
            id: uuidv4(),
            conversationId: finalConvId,
            role: "assistant",
            content: accumulatedText,
          })
          .run();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": convId,
    },
  });
}

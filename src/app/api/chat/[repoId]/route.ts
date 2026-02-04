import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { agentManager } from "@/lib/agents/agent-manager";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import type { AgentStreamEvent } from "@/types";

/** POST /api/chat/[repoId] - Send a message and get SSE stream response */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;
  const body = await request.json();
  const { message, conversationId, model } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Get repo
  const repo = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.id, repoId))
    .get();

  if (!repo) {
    return new Response(JSON.stringify({ error: "Repo not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (repo.status !== "ready") {
    return new Response(JSON.stringify({ error: "Repo is not ready" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  // Use request model, fallback to conversation model, then default
  const effectiveModel = model || convModel || "sonnet";

  if (!convId) {
    convId = uuidv4();
    db.insert(schema.conversations)
      .values({
        id: convId,
        repoId,
        title: message.slice(0, 100),
        isOrchestrator: false,
        model: effectiveModel,
      })
      .run();
  } else if (model && model !== convModel) {
    // Update model if changed
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

  // Get or create agent
  const agent = agentManager.getAgent({
    repoId,
    repoName: repo.name,
    repoPath: repo.localPath,
    customPrompt: repo.customPrompt,
  });

  // Shared state for cancel callback
  const finalConvId = convId;

  // Create the streaming generator with DB persistence
  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    let fullAssistantText = "";
    let resultSessionId: string | undefined;

    for await (const event of agent.query(message, sessionId, effectiveModel)) {
      // Accumulate assistant text
      if (event.type === "text" && event.content) {
        fullAssistantText += event.content;
      }

      // Capture session ID
      if (event.sessionId) {
        resultSessionId = event.sessionId;
      }

      // Record usage
      if (event.type === "done" && event.usage) {
        db.insert(schema.usageRecords)
          .values({
            id: uuidv4(),
            conversationId: finalConvId,
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
            totalCostUsd: event.usage.cost_usd,
          })
          .run();
      }

      // Include conversationId in first event
      yield { ...event, conversationId: finalConvId } as AgentStreamEvent & {
        conversationId: string;
      };
    }

    // Save assistant message
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

    // Update conversation with session ID
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
      // Client disconnected — persist whatever text was accumulated
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

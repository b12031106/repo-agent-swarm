import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { OrchestratorAgent } from "@/lib/agents/orchestrator-agent";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import { buildMessageWithAttachments } from "@/lib/uploads/message-builder";
import { getUploadedFile } from "@/lib/uploads";
import { masterClaudeMdExists, generateMasterClaudeMd } from "@/lib/claude-md";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";
import { checkGuestRateLimit } from "@/lib/auth/guest-rate-limit";
import type { AgentStreamEvent } from "@/types";

/** POST /api/chat/orchestrator - Send a message to the orchestrator */
export async function POST(request: NextRequest) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;
  const body = await request.json();
  const { message, conversationId, model, attachmentIds } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 訪客速率限制
  if (user.isGuest) {
    const limited = checkGuestRateLimit(user.id);
    if (limited) return limited;
  }

  const db = getDb();

  // Check that at least one repo exists
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

  // Ensure master CLAUDE.md exists
  if (!masterClaudeMdExists()) {
    await generateMasterClaudeMd(readyRepos);
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
        userId: user.id,
      })
      .run();
  } else if (model && model !== convModel) {
    db.update(schema.conversations)
      .set({ model })
      .where(eq(schema.conversations.id, convId))
      .run();
  }

  // Build enhanced message with full attachment content
  const enhancedMessage = buildMessageWithAttachments(message, attachmentIds);

  // Build attachments metadata for DB storage
  const attachmentsJsonStr = attachmentIds?.length
    ? JSON.stringify(
        attachmentIds
          .map((id: string) => {
            const a = getUploadedFile(id);
            return a
              ? { name: a.name, size: a.size, category: a.category }
              : null;
          })
          .filter(Boolean)
      )
    : undefined;

  // Save user message
  db.insert(schema.messages)
    .values({
      id: uuidv4(),
      conversationId: convId,
      role: "user",
      content: message,
      attachmentsJson: attachmentsJsonStr,
    })
    .run();

  // Read orchestrator custom prompt from settings
  const orchestratorPromptSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "orchestrator_custom_prompt"))
    .get();

  // Create orchestrator agent (no repos array needed — reads from disk)
  const orchestrator = new OrchestratorAgent({
    customPrompt: orchestratorPromptSetting?.value || null,
  });

  if (sessionId) {
    orchestrator.setSessionId(sessionId);
  }

  const finalConvId = convId;

  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    let fullAssistantText = "";
    let resultSessionId: string | undefined;
    const totalUsage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

    for await (const event of orchestrator.query(enhancedMessage, sessionId, effectiveModel)) {
      // Accumulate all text
      if (event.type === "text" && event.content) {
        fullAssistantText += event.content;
      }

      if (event.sessionId) {
        resultSessionId = event.sessionId;
      }

      // Accumulate usage from done event
      if (event.type === "done" && event.usage) {
        totalUsage.input_tokens += event.usage.input_tokens;
        totalUsage.output_tokens += event.usage.output_tokens;
        totalUsage.cost_usd += event.usage.cost_usd;
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
          userId: user.id,
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
          model: effectiveModel,
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
      if (accumulatedText) {
        db.insert(schema.messages)
          .values({
            id: uuidv4(),
            conversationId: finalConvId,
            role: "assistant",
            content: accumulatedText,
            model: effectiveModel,
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

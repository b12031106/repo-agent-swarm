import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { OrchestratorAgent } from "@/lib/agents/orchestrator-agent";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import { buildMessageWithAttachments, buildAttachmentMetadata } from "@/lib/uploads/message-builder";
import { getUploadedFile } from "@/lib/uploads";
import type { AgentStreamEvent } from "@/types";

/**
 * POST /api/chat/analysis - Requirement analysis mode
 * Forces structured output, multi-iteration, and stronger models.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, conversationId, model, attachmentIds } = body;

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

  if (convId) {
    const conv = db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, convId))
      .get();
    if (conv) {
      sessionId = conv.sessionId || undefined;
    }
  }

  if (!convId) {
    convId = uuidv4();
    db.insert(schema.conversations)
      .values({
        id: convId,
        repoId: null,
        title: `[分析] ${message.slice(0, 80)}`,
        isOrchestrator: true,
        model: model || "sonnet",
        type: "analysis",
      })
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

  // Read orchestrator custom prompt
  const orchestratorPromptSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "orchestrator_custom_prompt"))
    .get();

  // Create orchestrator agent with analysis-mode settings
  const orchestrator = new OrchestratorAgent({
    repos: readyRepos.map((r) => ({
      repoId: r.id,
      repoName: r.name,
      repoPath: r.localPath,
      customPrompt: r.customPrompt,
      description: r.description,
      domain: r.domain,
      serviceType: r.serviceType,
      dependenciesJson: r.dependenciesJson,
      exposedApisJson: r.exposedApisJson,
      techStack: r.techStack,
      teamOwner: r.teamOwner,
      profileStatus: r.profileStatus,
    })),
    customPrompt: orchestratorPromptSetting?.value || null,
    // Analysis mode: stronger models and multi-iteration
    maxIterations: 3,
    structuredOutput: true,
    planningModel: "sonnet",
    reflectionModel: "sonnet",
    synthesisModel: "opus",
    maxBudgetUsd: 5.0,
  });

  if (sessionId) {
    orchestrator.setSessionId(sessionId);
  }

  const finalConvId = convId;
  let currentPhase: string | null = null;

  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    let fullAssistantText = "";
    let resultSessionId: string | undefined;
    let totalUsage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

    for await (const event of orchestrator.query(enhancedMessage, sessionId, model || "sonnet")) {
      if (event.type === "phase_start") {
        currentPhase = event.phase || null;
      } else if (event.type === "phase_end") {
        currentPhase = null;
      }

      if (event.type === "text" && event.content && currentPhase === "synthesis") {
        fullAssistantText += event.content;
      }

      if (event.sessionId) {
        resultSessionId = event.sessionId;
      }

      if (event.type === "done" && event.usage) {
        totalUsage.input_tokens += event.usage.input_tokens;
        totalUsage.output_tokens += event.usage.output_tokens;
        totalUsage.cost_usd += event.usage.cost_usd;
      }

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

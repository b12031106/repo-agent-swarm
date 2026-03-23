import { spawn, type ChildProcess } from "child_process";
import path from "path";
import type { AgentStreamEvent } from "@/types";
import type { AgentProvider, AgentQueryOptions, ModelInfo } from "./types";

export class ClaudeCodeProvider implements AgentProvider {
  readonly name = "claude-code";

  async *query(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      options.model || "sonnet",
      "--system-prompt",
      options.systemPrompt,
      "--dangerously-skip-permissions",
    ];

    if (options.maxBudgetUsd) {
      args.push("--max-budget-usd", String(options.maxBudgetUsd));
    }

    if (options.tools !== undefined) {
      args.push("--tools", options.tools);
    }

    if (options.agents) {
      args.push("--agents", JSON.stringify(options.agents));
    }

    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    // Pass message via stdin to avoid ARG_MAX limits with long messages
    // (e.g. synthesis phase with all repo agent results)
    args.push("-");

    const claudePath = path.join(
      process.cwd(),
      "node_modules",
      ".bin",
      "claude"
    );

    const proc = spawn(claudePath, args, {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin.write(options.message);
    proc.stdin.end();

    yield* this.processStream(proc);
  }

  async isAvailable(): Promise<boolean> {
    const claudePath = path.join(
      process.cwd(),
      "node_modules",
      ".bin",
      "claude"
    );
    try {
      const { existsSync } = await import("fs");
      return existsSync(claudePath);
    } catch {
      return false;
    }
  }

  getSupportedModels(): ModelInfo[] {
    return [
      { id: "sonnet", label: "Sonnet", description: "平衡速度與品質" },
      { id: "haiku", label: "Haiku", description: "快速回應" },
      { id: "opus", label: "Opus", description: "最高品質" },
    ];
  }

  private async *processStream(
    proc: ChildProcess
  ): AsyncGenerator<AgentStreamEvent> {
    const stderrChunks: string[] = [];
    let hasYielded = false;
    let hasTextBefore = false;
    // Track the last tool_use id to correlate tool_results
    let lastToolUseId: string | null = null;
    let lastToolUseName: string | null = null;

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      console.error(`[ClaudeCodeProvider] stderr:`, text.trim());
    });

    let exitCode: number | null = null;
    const exitPromise = new Promise<number | null>((resolve) => {
      proc.on("close", (code) => {
        exitCode = code;
        resolve(code);
      });
    });

    try {
      for await (const line of this.createLineIterator(proc.stdout!)) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);
          const streamEvents = this.parseStreamEvents(event, lastToolUseId, lastToolUseName);

          for (const streamEvent of streamEvents) {
            if (event.type === "result" && event.session_id) {
              streamEvent.sessionId = event.session_id;
            }
            if (
              streamEvent.type === "text" &&
              streamEvent.content &&
              hasTextBefore
            ) {
              streamEvent.content = "\n\n" + streamEvent.content;
            }
            if (streamEvent.type === "text" && streamEvent.content) {
              hasTextBefore = true;
            }
            // Track tool_use for correlating results
            if (streamEvent.type === "tool_use") {
              lastToolUseId = (streamEvent as AgentStreamEvent & { _toolUseId?: string })._toolUseId || null;
              lastToolUseName = streamEvent.tool || null;
            }
            if (streamEvent.type === "tool_result") {
              lastToolUseId = null;
              lastToolUseName = null;
            }
            hasYielded = true;
            yield streamEvent;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error:
          stderrChunks.join("") ||
          (error instanceof Error ? error.message : "Unknown error"),
      };
      hasYielded = true;
    }

    await exitPromise;

    if (!hasYielded || (exitCode !== null && exitCode !== 0)) {
      const stderr = stderrChunks.join("").trim();
      if (stderr) {
        yield { type: "error", error: stderr };
      } else if (exitCode !== null && exitCode !== 0) {
        yield {
          type: "error",
          error: `Claude process exited with code ${exitCode}`,
        };
      }
    }

    yield { type: "done" };
  }

  /**
   * Parse a single CLI stream-json event into one or more AgentStreamEvents.
   *
   * CLI stream-json format:
   * - "assistant" events contain content blocks: text, tool_use, or both
   * - "user" events contain tool_use_result (tool results)
   * - "result" events signal completion with usage stats
   */
  private parseStreamEvents(
    event: Record<string, unknown>,
    _lastToolUseId: string | null,
    lastToolUseName: string | null,
  ): AgentStreamEvent[] {
    const results: AgentStreamEvent[] = [];

    switch (event.type) {
      case "assistant": {
        const contentBlocks = this.extractContentBlocks(event);
        for (const block of contentBlocks) {
          if (block.type === "text" && block.text) {
            results.push({ type: "text", content: block.text as string });
          } else if (block.type === "tool_use") {
            const toolEvent: AgentStreamEvent & { _toolUseId?: string } = {
              type: "tool_use",
              tool: (block.name as string) || "",
              toolInput: (block.input as Record<string, unknown>) || {},
            };
            toolEvent._toolUseId = block.id as string;
            results.push(toolEvent);
          }
        }

        // Attach session_id if present
        const sessionId = event.session_id as string | undefined;
        if (sessionId && results.length > 0) {
          results[results.length - 1].sessionId = sessionId;
        }
        break;
      }

      case "user": {
        // Tool results come as "user" events.
        // Text content is in message.content[].content (type: "tool_result")
        // Structured metadata is in tool_use_result (e.g. { filenames, durationMs })
        const msg = event.message as Record<string, unknown> | undefined;

        if (msg && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "tool_result") {
              const output = block.content || "";
              results.push({
                type: "tool_result",
                tool: lastToolUseName || "",
                toolResult: typeof output === "string" ? output : JSON.stringify(output),
              });
            }
          }
        }
        break;
      }

      case "content_block_delta":
        if (
          event.delta &&
          typeof event.delta === "object" &&
          "text" in (event.delta as Record<string, unknown>)
        ) {
          results.push({
            type: "text",
            content: (event.delta as { text: string }).text,
          });
        }
        break;

      // Legacy top-level tool events (for older CLI versions)
      case "tool_use":
        results.push({
          type: "tool_use",
          tool: (event.tool_name as string) || (event.name as string),
          toolInput: event.input as Record<string, unknown>,
        });
        break;

      case "tool_result":
        results.push({
          type: "tool_result",
          tool: event.tool_name as string,
          toolResult:
            typeof event.output === "string"
              ? event.output
              : JSON.stringify(event.output),
        });
        break;

      case "result": {
        const result: AgentStreamEvent = { type: "done" };

        // Extract usage from modelUsage (aggregated per-model costs) or fallback to top-level
        const modelUsage = event.modelUsage as Record<string, Record<string, number>> | undefined;
        const totalCostUsd = event.total_cost_usd as number | undefined;

        if (modelUsage) {
          let totalInput = 0;
          let totalOutput = 0;
          for (const model of Object.values(modelUsage)) {
            totalInput += (model.inputTokens || 0) + (model.cacheReadInputTokens || 0) + (model.cacheCreationInputTokens || 0);
            totalOutput += model.outputTokens || 0;
          }
          result.usage = {
            input_tokens: totalInput,
            output_tokens: totalOutput,
            cost_usd: totalCostUsd || 0,
          };
        } else if (event.cost_usd !== undefined || event.usage) {
          const usage = event.usage as Record<string, number> | undefined;
          result.usage = {
            input_tokens: usage?.input_tokens || 0,
            output_tokens: usage?.output_tokens || 0,
            cost_usd: (event.cost_usd as number) || 0,
          };
        }

        if (event.session_id) {
          result.sessionId = event.session_id as string;
        }

        // Flag budget exhaustion so the UI can warn the user
        if (event.subtype === "error_max_budget_usd") {
          result.budgetExhausted = true;
        }

        results.push(result);
        break;
      }
    }

    return results;
  }

  /** Extract content blocks from an assistant event's message */
  private extractContentBlocks(
    event: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    // Format: { message: { content: [...blocks] } }
    if (
      event.message &&
      typeof event.message === "object" &&
      "content" in (event.message as Record<string, unknown>)
    ) {
      const msg = event.message as Record<string, unknown>;
      if (Array.isArray(msg.content)) {
        return msg.content;
      }
    }
    // Format: { message: [...blocks] }
    if (Array.isArray(event.message)) {
      return event.message;
    }
    return [];
  }

  private async *createLineIterator(
    stream: NodeJS.ReadableStream
  ): AsyncGenerator<string> {
    let buffer = "";

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        yield line;
      }
    }

    if (buffer) {
      yield buffer;
    }
  }
}

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
      "--max-budget-usd",
      String(options.maxBudgetUsd || 0.5),
    ];

    if (options.tools) {
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
          const streamEvent = this.parseStreamEvent(event);
          if (streamEvent) {
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

  private parseStreamEvent(
    event: Record<string, unknown>
  ): AgentStreamEvent | null {
    switch (event.type) {
      case "assistant":
        if (Array.isArray(event.message)) {
          for (const block of event.message) {
            if (block.type === "text") {
              return { type: "text", content: block.text || block.content };
            }
          }
        }
        if (
          event.message &&
          typeof event.message === "object" &&
          "content" in (event.message as Record<string, unknown>)
        ) {
          const msg = event.message as Record<string, unknown>;
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text") {
                return { type: "text", content: block.text };
              }
            }
          }
        }
        return null;

      case "content_block_delta":
        if (
          event.delta &&
          typeof event.delta === "object" &&
          "text" in (event.delta as Record<string, unknown>)
        ) {
          return {
            type: "text",
            content: (event.delta as { text: string }).text,
          };
        }
        return null;

      case "tool_use":
        return {
          type: "tool_use",
          tool:
            (event.tool_name as string) || (event.name as string),
          toolInput: event.input as Record<string, unknown>,
        };

      case "tool_result":
        return {
          type: "tool_result",
          tool: event.tool_name as string,
          toolResult:
            typeof event.output === "string"
              ? event.output
              : JSON.stringify(event.output),
        };

      case "result": {
        const result: AgentStreamEvent = { type: "done" };
        if (event.cost_usd !== undefined || event.usage) {
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
        return result;
      }

      default:
        return null;
    }
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

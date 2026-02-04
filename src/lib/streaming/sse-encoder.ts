import type { AgentStreamEvent } from "@/types";

/** Encode an AgentStreamEvent as an SSE message */
export function encodeSSE(event: AgentStreamEvent): string {
  const data = JSON.stringify(event);
  return `data: ${data}\n\n`;
}

interface SSEStreamOptions {
  /** Called when the client disconnects before the stream finishes */
  onCancel?: (accumulatedText: string) => void;
}

/** Create a ReadableStream that yields SSE events from an async generator */
export function createSSEStream(
  generator: AsyncGenerator<AgentStreamEvent>,
  options?: SSEStreamOptions
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let accumulatedText = "";
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          if (cancelled) break;

          // Track accumulated text for cancel callback
          if (event.type === "text" && event.content) {
            accumulatedText += event.content;
          }

          const sseMessage = encodeSSE(event);
          controller.enqueue(encoder.encode(sseMessage));
        }
      } catch (error) {
        if (!cancelled) {
          const errorEvent: AgentStreamEvent = {
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          };
          controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
      if (options?.onCancel && accumulatedText) {
        options.onCancel(accumulatedText);
      }
    },
  });
}

"use client";

import { create } from "zustand";
import type { AgentStreamEvent, UploadedAttachment, AttachmentCategory } from "@/types";

export interface ToolActivity {
  id: string;
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done";
  timestamp: number;
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface SubAgentActivity {
  repoId: string;
  repoName: string;
  query: string;
  status: "running" | "done" | "error";
  textContent: string;
  toolActivities: ToolActivity[];
  error?: string;
}

export type OrchestratorPhaseType = "planning" | "execution" | "reflection" | "synthesis" | null;

export interface ChatMessageAttachment {
  name: string;
  size: number;
  category: AttachmentCategory;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isStreaming?: boolean;
  toolActivities?: ToolActivity[];
  usage?: UsageInfo;
  orchestratorPhase?: OrchestratorPhaseType;
  subAgentActivities?: SubAgentActivity[];
  attachments?: ChatMessageAttachment[];
  currentIteration?: number;
  maxIterations?: number;
  model?: string;
}

export interface ChatSession {
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  error: string | null;
  activeTools: string[];
  abortController: AbortController | null;
  conversationId: string | undefined;
  endpoint: string;
  historyLoaded: boolean;
  lastUserMessage: string | null;
  lastUserAttachments: UploadedAttachment[] | null;
  model: string;
  outputStyleId: string | null;
}

const MAX_CONCURRENT_STREAMS = 3;

function createEmptySession(
  endpoint: string,
  conversationId?: string,
  model?: string,
  outputStyleId?: string | null
): ChatSession {
  return {
    messages: [],
    isLoading: false,
    isLoadingHistory: false,
    error: null,
    activeTools: [],
    abortController: null,
    conversationId,
    endpoint,
    historyLoaded: false,
    lastUserMessage: null,
    lastUserAttachments: null,
    model: model || "sonnet",
    outputStyleId: outputStyleId || null,
  };
}

interface ChatStore {
  sessions: Map<string, ChatSession>;
  activeChatId: string | null;

  // Getters
  getSession: (chatId: string) => ChatSession | undefined;
  getActiveSession: () => ChatSession | undefined;

  // Actions
  initSession: (
    chatId: string,
    endpoint: string,
    conversationId?: string,
    model?: string,
    outputStyleId?: string | null
  ) => void;
  switchChat: (chatId: string) => void;
  removeSession: (chatId: string) => void;
  setSessionModel: (chatId: string, model: string) => void;
  setSessionOutputStyle: (chatId: string, styleId: string) => void;

  // Message actions (operate on store, not dependent on React lifecycle)
  sendMessage: (chatId: string, content: string, attachments?: UploadedAttachment[]) => void;
  cancelStream: (chatId: string) => void;
  retryLastMessage: (chatId: string) => void;
  clearMessages: (chatId: string) => void;
  loadHistory: (chatId: string, conversationId: string) => void;

  // Internal session updater
  _updateSession: (
    chatId: string,
    updater: (session: ChatSession) => Partial<ChatSession>
  ) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: new Map(),
  activeChatId: null,

  getSession: (chatId) => get().sessions.get(chatId),

  getActiveSession: () => {
    const { activeChatId, sessions } = get();
    if (!activeChatId) return undefined;
    return sessions.get(activeChatId);
  },

  _updateSession: (chatId, updater) => {
    set((state) => {
      const session = state.sessions.get(chatId);
      if (!session) return state;
      const updates = updater(session);
      const newSessions = new Map(state.sessions);
      newSessions.set(chatId, { ...session, ...updates });
      return { sessions: newSessions };
    });
  },

  initSession: (chatId, endpoint, conversationId, model, outputStyleId) => {
    set((state) => {
      if (state.sessions.has(chatId)) {
        // Session already exists, just switch to it
        return { activeChatId: chatId };
      }
      const newSessions = new Map(state.sessions);
      newSessions.set(
        chatId,
        createEmptySession(endpoint, conversationId, model, outputStyleId)
      );
      return { sessions: newSessions, activeChatId: chatId };
    });
  },

  switchChat: (chatId) => {
    set({ activeChatId: chatId });
  },

  removeSession: (chatId) => {
    const session = get().sessions.get(chatId);
    if (session?.abortController) {
      session.abortController.abort();
    }
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(chatId);
      const newActiveChatId =
        state.activeChatId === chatId ? null : state.activeChatId;
      return { sessions: newSessions, activeChatId: newActiveChatId };
    });
  },

  setSessionModel: (chatId, model) => {
    get()._updateSession(chatId, () => ({ model }));
  },

  setSessionOutputStyle: (chatId, styleId) => {
    get()._updateSession(chatId, () => ({ outputStyleId: styleId }));
  },

  loadHistory: async (chatId, conversationId) => {
    const session = get().sessions.get(chatId);
    if (!session || session.historyLoaded || session.isLoading) return;

    // Skip if session already has messages (e.g., from an active/completed background stream)
    if (session.messages.length > 0) {
      get()._updateSession(chatId, () => ({ historyLoaded: true }));
      return;
    }

    get()._updateSession(chatId, () => ({
      isLoadingHistory: true,
      historyLoaded: true,
    }));

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) return;

      const dbMessages: Array<{
        id: string;
        role: "user" | "assistant" | "tool";
        content: string;
        toolName: string | null;
        attachmentsJson: string | null;
        model: string | null;
        createdAt: string;
      }> = await res.json();

      const chatMessages: ChatMessage[] = dbMessages
        .filter((m) => m.role !== "tool")
        .map((m) => {
          let attachments: ChatMessageAttachment[] | undefined;
          if (m.attachmentsJson) {
            try {
              attachments = JSON.parse(m.attachmentsJson);
            } catch {
              // Ignore parse errors
            }
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            isStreaming: false,
            attachments,
            model: m.model || undefined,
          };
        });

      if (chatMessages.length > 0) {
        get()._updateSession(chatId, () => ({ messages: chatMessages }));
      }
    } catch {
      // Silently fail
    } finally {
      get()._updateSession(chatId, () => ({ isLoadingHistory: false }));
    }
  },

  sendMessage: async (chatId, content, attachments) => {
    const session = get().sessions.get(chatId);
    if (!session || session.isLoading) return;
    if (!content.trim() && (!attachments || attachments.length === 0)) return;

    // Enforce max concurrent streams
    const allSessions = get().sessions;
    let streamingCount = 0;
    let oldestStreamingId: string | null = null;
    let oldestStreamingTime = Infinity;

    for (const [id, s] of allSessions) {
      if (s.isLoading && id !== chatId) {
        streamingCount++;
        const lastMsg = s.messages.findLast((m) => m.role === "user");
        const msgTime = lastMsg
          ? parseInt(lastMsg.id.split("-")[1] || "0")
          : 0;
        if (msgTime < oldestStreamingTime) {
          oldestStreamingTime = msgTime;
          oldestStreamingId = id;
        }
      }
    }

    if (streamingCount >= MAX_CONCURRENT_STREAMS && oldestStreamingId) {
      get().cancelStream(oldestStreamingId);
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      attachments: attachments?.map((a) => ({
        name: a.name,
        size: a.size,
        category: a.category,
      })),
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      model: session.model,
    };

    const controller = new AbortController();

    get()._updateSession(chatId, (s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      isLoading: true,
      error: null,
      lastUserMessage: content,
      lastUserAttachments: attachments || null,
      abortController: controller,
    }));

    try {
      const currentSession = get().sessions.get(chatId)!;
      const response = await fetch(currentSession.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: currentSession.conversationId,
          model: currentSession.model,
          outputStyleId: currentSession.outputStyleId,
          attachmentIds: attachments?.map((a) => a.id),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(
          errBody?.error || `Request failed: ${response.status}`
        );
      }

      // Read conversation ID from header
      const convId = response.headers.get("X-Conversation-Id");
      if (convId) {
        get()._updateSession(chatId, () => ({ conversationId: convId }));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);

          try {
            const event: AgentStreamEvent & { conversationId?: string } =
              JSON.parse(jsonStr);

            if (event.conversationId) {
              get()._updateSession(chatId, (s) => ({
                conversationId: s.conversationId || event.conversationId,
              }));
            }

            switch (event.type) {
              case "text":
                get()._updateSession(chatId, (s) => ({
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + (event.content || "") }
                      : m
                  ),
                }));
                break;

              case "tool_use":
                if (event.tool) {
                  const activityId = `ta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  get()._updateSession(chatId, (s) => ({
                    activeTools: [...s.activeTools, event.tool!],
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            toolActivities: [
                              ...(m.toolActivities || []),
                              {
                                id: activityId,
                                tool: event.tool!,
                                input: event.toolInput,
                                status: "running" as const,
                                timestamp: Date.now(),
                              },
                            ],
                          }
                        : m
                    ),
                  }));
                }
                break;

              case "tool_result":
                if (event.tool) {
                  get()._updateSession(chatId, (s) => ({
                    activeTools: s.activeTools.filter(
                      (t) => t !== event.tool
                    ),
                    messages: s.messages.map((m) => {
                      if (m.id !== assistantId || !m.toolActivities) return m;
                      const activities = [...m.toolActivities];
                      for (let i = activities.length - 1; i >= 0; i--) {
                        if (
                          activities[i].tool === event.tool &&
                          activities[i].status === "running"
                        ) {
                          activities[i] = {
                            ...activities[i],
                            status: "done",
                            result: event.toolResult,
                          };
                          break;
                        }
                      }
                      return { ...m, toolActivities: activities };
                    }),
                  }));
                }
                break;

              case "phase_start":
                get()._updateSession(chatId, (s) => ({
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, orchestratorPhase: (event.phase as OrchestratorPhaseType) || null }
                      : m
                  ),
                }));
                break;

              case "phase_end":
                get()._updateSession(chatId, (s) => ({
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, orchestratorPhase: null }
                      : m
                  ),
                }));
                break;

              case "iteration_start":
                get()._updateSession(chatId, (s) => ({
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          currentIteration: (event as AgentStreamEvent & { iteration?: number }).iteration,
                          maxIterations: (event as AgentStreamEvent & { maxIterations?: number }).maxIterations,
                        }
                      : m
                  ),
                }));
                break;

              case "iteration_end":
                // No special handling needed, iteration counter already set by iteration_start
                break;

              case "subagent_start":
                if (event.subagentId) {
                  get()._updateSession(chatId, (s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            subAgentActivities: [
                              ...(m.subAgentActivities || []),
                              {
                                repoId: event.subagentId!,
                                repoName: event.subagentName || event.subagentId!,
                                query: event.subagentQuery || "",
                                status: "running" as const,
                                textContent: "",
                                toolActivities: [],
                              },
                            ],
                          }
                        : m
                    ),
                  }));
                }
                break;

              case "subagent_event":
                if (event.subagentId && event.innerEvent) {
                  const inner = event.innerEvent;
                  get()._updateSession(chatId, (s) => ({
                    messages: s.messages.map((m) => {
                      if (m.id !== assistantId || !m.subAgentActivities) return m;
                      const activities = m.subAgentActivities.map((sa) => {
                        if (sa.repoId !== event.subagentId) return sa;
                        const updated = { ...sa };

                        if (inner.type === "text" && inner.content) {
                          updated.textContent = sa.textContent + inner.content;
                        } else if (inner.type === "tool_use" && inner.tool) {
                          updated.toolActivities = [
                            ...sa.toolActivities,
                            {
                              id: `sa-ta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              tool: inner.tool,
                              input: inner.toolInput,
                              status: "running" as const,
                              timestamp: Date.now(),
                            },
                          ];
                        } else if (inner.type === "tool_result" && inner.tool) {
                          updated.toolActivities = sa.toolActivities.map((ta, idx, arr) => {
                            // Find last matching running tool
                            const isLastRunning =
                              ta.tool === inner.tool &&
                              ta.status === "running" &&
                              !arr.slice(idx + 1).some(
                                (t) => t.tool === inner.tool && t.status === "running"
                              );
                            if (isLastRunning) {
                              return { ...ta, status: "done" as const, result: inner.toolResult };
                            }
                            return ta;
                          });
                        } else if (inner.type === "error" && inner.error) {
                          updated.error = inner.error;
                        }

                        return updated;
                      });
                      return { ...m, subAgentActivities: activities };
                    }),
                  }));
                }
                break;

              case "subagent_end":
                if (event.subagentId) {
                  get()._updateSession(chatId, (s) => ({
                    messages: s.messages.map((m) => {
                      if (m.id !== assistantId || !m.subAgentActivities) return m;
                      const activities = m.subAgentActivities.map((sa) =>
                        sa.repoId === event.subagentId
                          ? {
                              ...sa,
                              status: (event.error ? "error" : "done") as SubAgentActivity["status"],
                              error: event.error || sa.error,
                            }
                          : sa
                      );
                      return { ...m, subAgentActivities: activities };
                    }),
                  }));
                }
                break;

              case "error":
                get()._updateSession(chatId, () => ({
                  error: event.error || "Unknown error",
                }));
                break;

              case "done":
                if (event.usage) {
                  get()._updateSession(chatId, (s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            usage: m.usage
                              ? {
                                  input_tokens: m.usage.input_tokens + event.usage!.input_tokens,
                                  output_tokens: m.usage.output_tokens + event.usage!.output_tokens,
                                  cost_usd: m.usage.cost_usd + event.usage!.cost_usd,
                                }
                              : event.usage,
                          }
                        : m
                    ),
                  }));
                }
                // Warn user when response was truncated due to budget exhaustion
                if ((event as AgentStreamEvent & { budgetExhausted?: boolean }).budgetExhausted) {
                  get()._updateSession(chatId, (s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: m.content + "\n\n⚠️ *回應因預算上限而被截斷，可能不完整。請重試或調整預算設定。*",
                          }
                        : m
                    ),
                  }));
                }
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Mark streaming as done
      get()._updateSession(chatId, (s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        ),
      }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — mark streaming as done but keep content
        get()._updateSession(chatId, (s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          ),
        }));
      } else {
        get()._updateSession(chatId, (s) => ({
          error: err instanceof Error ? err.message : "Unknown error",
          messages: s.messages.filter(
            (m) => m.id !== assistantId || m.content.length > 0
          ),
        }));
      }
    } finally {
      get()._updateSession(chatId, () => ({
        isLoading: false,
        activeTools: [],
        abortController: null,
      }));
    }
  },

  cancelStream: (chatId) => {
    const session = get().sessions.get(chatId);
    session?.abortController?.abort();
  },

  retryLastMessage: (chatId) => {
    const session = get().sessions.get(chatId);
    if (!session || !session.lastUserMessage || session.isLoading) return;

    const lastMsg = session.lastUserMessage;
    const lastAttachments = session.lastUserAttachments || undefined;

    get()._updateSession(chatId, (s) => {
      const msgs = [...s.messages];
      // Remove trailing assistant message
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
        msgs.pop();
      }
      // Remove the last user message
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
        msgs.pop();
      }
      return { messages: msgs, error: null };
    });

    // Re-send after state update
    setTimeout(() => get().sendMessage(chatId, lastMsg, lastAttachments), 0);
  },

  clearMessages: (chatId) => {
    get()._updateSession(chatId, () => ({
      messages: [],
      conversationId: undefined,
      historyLoaded: false,
      error: null,
    }));
  },
}));

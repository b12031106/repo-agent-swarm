"use client";

import { useEffect, useMemo, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import type { UploadedAttachment } from "@/types";

// Re-export types from store for backward compatibility
export type {
  ToolActivity,
  UsageInfo,
  ChatMessage,
  ChatMessageAttachment,
  SubAgentActivity,
  OrchestratorPhaseType,
} from "@/stores/chat-store";

interface UseChatOptions {
  /** API endpoint for chat */
  endpoint: string;
  /** Conversation ID for continuing a conversation */
  conversationId?: string;
  /** Called when conversation ID is established */
  onConversationId?: (id: string) => void;
  /** Model to use for the conversation */
  model?: string;
}

export function useChat(options: UseChatOptions) {
  // Stable chat ID: fixed on first mount (either conversationId or generated).
  // This MUST NOT change when conversationId is assigned mid-stream.
  const chatId = useMemo(
    () => options.conversationId || `new-${Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const store = useChatStore();

  // Initialize session on mount
  useEffect(() => {
    store.initSession(chatId, options.endpoint, options.conversationId, options.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Load history when conversationId is provided
  useEffect(() => {
    if (options.conversationId) {
      store.loadHistory(chatId, options.conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, options.conversationId]);

  // Watch for conversationId changes in session and notify parent
  const session = useChatStore((s) => s.sessions.get(chatId));
  useEffect(() => {
    if (session?.conversationId && options.onConversationId) {
      options.onConversationId(session.conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.conversationId]);

  // Note: We intentionally do NOT abort on unmount.
  // The stream continues in the store even when the component is unmounted.

  const sendMessage = useCallback(
    (content: string, attachments?: UploadedAttachment[]) =>
      store.sendMessage(chatId, content, attachments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  );

  const cancel = useCallback(
    () => store.cancelStream(chatId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  );

  const retry = useCallback(
    () => store.retryLastMessage(chatId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  );

  const clearMessages = useCallback(
    () => store.clearMessages(chatId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  );

  const setModel = useCallback(
    (model: string) => store.setSessionModel(chatId, model),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  );

  return {
    messages: session?.messages || [],
    isLoading: session?.isLoading || false,
    isLoadingHistory: session?.isLoadingHistory || false,
    error: session?.error || null,
    activeTools: session?.activeTools || [],
    sendMessage,
    cancel,
    retry,
    clearMessages,
    conversationId: session?.conversationId,
    model: session?.model || "sonnet",
    setModel,
    chatId,
  };
}

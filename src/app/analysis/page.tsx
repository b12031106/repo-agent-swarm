"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatContainer } from "@/components/chat/chat-container";
import { ConversationList } from "@/components/chat/conversation-list";
import { AnalysisInputForm } from "@/components/analysis/analysis-input-form";
import type { Conversation } from "@/types";
import type { UploadedAttachment } from "@/types";
import { Loader2, Plus, History } from "lucide-react";
import { DeleteConversationButton } from "@/components/chat/delete-conversation-button";
import { useChatStore } from "@/stores/chat-store";

function AnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(
    searchParams.get("conv") || undefined
  );
  const [chatKey, setChatKey] = useState(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [showInputForm, setShowInputForm] = useState(!searchParams.get("conv"));
  const isStreaming = useChatStore((s) =>
    activeConvId ? (s.sessions.get(activeConvId)?.isLoading ?? false) : false
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/conversations?type=analysis");
        if (!res.ok) return;
        const data: Conversation[] = await res.json();
        const analysisConvs = data.filter((c) => c.type === "analysis");
        setConversations(analysisConvs);
      } catch {
        // Silently fail
      }
    };
    load();
  }, []);

  const handleConversationId = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      setShowInputForm(false);
      router.replace(`/analysis?conv=${convId}`, { scroll: false });
      fetch("/api/conversations?type=analysis")
        .then((r) => r.json())
        .then((data: Conversation[]) =>
          setConversations(data.filter((c) => c.type === "analysis"))
        )
        .catch(() => {});
    },
    [router]
  );

  const startNewAnalysis = useCallback(() => {
    setActiveConvId(undefined);
    setChatKey(Date.now());
    setShowInputForm(true);
    router.replace("/analysis", { scroll: false });
    setShowHistory(false);
  }, [router]);

  const switchConversation = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      setChatKey(Date.now());
      setShowInputForm(false);
      router.replace(`/analysis?conv=${convId}`, { scroll: false });
      setShowHistory(false);
    },
    [router]
  );

  const handleDeleteConversation = useCallback(
    (convId: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (convId === activeConvId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          switchConversation(remaining[0].id);
        } else {
          startNewAnalysis();
        }
      }
    },
    [activeConvId, conversations, switchConversation, startNewAnalysis]
  );

  const handleAnalysisSubmit = useCallback(
    (message: string, attachments?: UploadedAttachment[]) => {
      // Switch to chat mode — the ChatContainer will handle the message
      setShowInputForm(false);
      setChatKey(Date.now());
      // We need to trigger sendMessage after ChatContainer mounts
      // Store the pending message temporarily
      setPendingMessage({ message, attachments });
    },
    []
  );

  const [pendingMessage, setPendingMessage] = useState<{
    message: string;
    attachments?: UploadedAttachment[];
  } | null>(null);

  // When ChatContainer mounts with pending message, send it
  const handleChatMounted = useCallback(() => {
    if (pendingMessage) {
      const chatId = activeConvId || `new-${chatKey}`;
      // Tiny delay to let the store initialize the session
      setTimeout(() => {
        useChatStore
          .getState()
          .sendMessage(chatId, pendingMessage.message, pendingMessage.attachments);
        setPendingMessage(null);
      }, 100);
    }
  }, [pendingMessage, activeConvId, chatKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="font-semibold flex-1">需求分析</h2>
        {activeConvId && !showInputForm && (
          <DeleteConversationButton
            conversationId={activeConvId}
            chatId={activeConvId}
            onDeleted={handleDeleteConversation}
            disabled={isStreaming}
          />
        )}
        <button
          onClick={startNewAnalysis}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新分析
        </button>
        {conversations.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            紀錄 ({conversations.length})
          </button>
        )}
      </div>

      {showHistory && (
        <ConversationList
          conversations={conversations}
          activeConvId={activeConvId}
          onSelect={switchConversation}
          onDelete={handleDeleteConversation}
        />
      )}

      <div className="flex-1 overflow-hidden">
        {showInputForm ? (
          <div className="flex h-full items-center justify-center p-8">
            <AnalysisInputForm
              onSubmit={handleAnalysisSubmit}
              isLoading={isStreaming}
            />
          </div>
        ) : (
          <ChatContainer
            key={chatKey}
            endpoint="/api/chat/analysis"
            conversationId={activeConvId}
            onConversationId={handleConversationId}
            onMounted={handleChatMounted}
            initialOutputStyleId={conversations.find((c) => c.id === activeConvId)?.outputStyleId}
          />
        )}
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatContainer } from "@/components/chat/chat-container";
import { ConversationList } from "@/components/chat/conversation-list";
import type { Conversation } from "@/types";
import { Loader2, Plus, History, Settings } from "lucide-react";
import { DeleteConversationButton } from "@/components/chat/delete-conversation-button";
import { useChatStore } from "@/stores/chat-store";
import { OrchestratorSettingsDialog } from "@/components/orchestrator/orchestrator-settings-dialog";

function OrchestratorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(
    searchParams.get("conv") || undefined
  );
  const [chatKey, setChatKey] = useState(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const isStreaming = useChatStore((s) =>
    activeConvId ? (s.sessions.get(activeConvId)?.isLoading ?? false) : false
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/conversations?orchestrator=true");
        if (!res.ok) return;
        const data: Conversation[] = await res.json();
        const orchConvs = data.filter((c) => c.isOrchestrator);
        setConversations(orchConvs);

        const urlConv = searchParams.get("conv");
        if (!urlConv && orchConvs.length > 0) {
          setActiveConvId(orchConvs[0].id);
          setChatKey(Date.now());
          router.replace(`/orchestrator?conv=${orchConvs[0].id}`, {
            scroll: false,
          });
        }
      } catch {
        // Silently fail
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConversationId = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      router.replace(`/orchestrator?conv=${convId}`, { scroll: false });
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((data: Conversation[]) =>
          setConversations(data.filter((c) => c.isOrchestrator))
        )
        .catch(() => {});
    },
    [router]
  );

  const startNewConversation = useCallback(() => {
    setActiveConvId(undefined);
    setChatKey(Date.now());
    router.replace("/orchestrator", { scroll: false });
    setShowHistory(false);
  }, [router]);

  const switchConversation = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      setChatKey(Date.now());
      router.replace(`/orchestrator?conv=${convId}`, { scroll: false });
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
          startNewConversation();
        }
      }
    },
    [activeConvId, conversations, switchConversation, startNewConversation]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="font-semibold flex-1">總顧問 (Orchestrator)</h2>
        {activeConvId && (
          <DeleteConversationButton
            conversationId={activeConvId}
            chatId={activeConvId}
            onDeleted={handleDeleteConversation}
            disabled={isStreaming}
          />
        )}
        <button
          onClick={startNewConversation}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新對話
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          設定
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
        <ChatContainer
          key={chatKey}
          endpoint="/api/chat/orchestrator"
          conversationId={activeConvId}
          onConversationId={handleConversationId}
          initialOutputStyleId={conversations.find((c) => c.id === activeConvId)?.outputStyleId}
        />
      </div>

      <OrchestratorSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
      />
    </div>
  );
}

export default function OrchestratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OrchestratorContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useState, useCallback, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatContainer } from "@/components/chat/chat-container";
import { ConversationList } from "@/components/chat/conversation-list";
import type { Repo, Conversation } from "@/types";
import { Loader2, AlertCircle, Plus, History } from "lucide-react";

function RepoChatContent({ repoId }: { repoId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(
    searchParams.get("conv") || undefined
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [repoRes, convRes] = await Promise.all([
          fetch(`/api/repos/${repoId}`),
          fetch(`/api/chat/${repoId}/history`),
        ]);

        if (!repoRes.ok) throw new Error("Repo not found");
        const repoData = await repoRes.json();
        setRepo(repoData);

        if (convRes.ok) {
          const convData: Conversation[] = await convRes.json();
          setConversations(convData);

          // If no conv in URL, auto-select the most recent one
          const urlConv = searchParams.get("conv");
          if (!urlConv && convData.length > 0) {
            setActiveConvId(convData[0].id);
            router.replace(`/repos/${repoId}?conv=${convData[0].id}`, {
              scroll: false,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConversationId = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      router.replace(`/repos/${repoId}?conv=${convId}`, { scroll: false });
      // Refresh conversation list
      fetch(`/api/chat/${repoId}/history`)
        .then((r) => r.json())
        .then(setConversations)
        .catch(() => {});
    },
    [repoId, router]
  );

  const startNewConversation = useCallback(() => {
    setActiveConvId(undefined);
    router.replace(`/repos/${repoId}`, { scroll: false });
    setShowHistory(false);
  }, [repoId, router]);

  const switchConversation = useCallback(
    (convId: string) => {
      setActiveConvId(convId);
      router.replace(`/repos/${repoId}?conv=${convId}`, { scroll: false });
      setShowHistory(false);
    },
    [repoId, router]
  );

  const handleDeleteConversation = useCallback(
    (convId: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      // If deleted the active conversation, switch to the next one or start new
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !repo) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm text-destructive">
            {error || "Repository 不存在"}
          </p>
        </div>
      </div>
    );
  }

  if (repo.status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Repository 正在{" "}
            {repo.status === "cloning" ? "Clone" : "同步"} 中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat header with conversation controls */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="font-semibold flex-1">{repo.name}</h2>
        <button
          onClick={startNewConversation}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="開新對話"
        >
          <Plus className="h-3.5 w-3.5" />
          新對話
        </button>
        {conversations.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="對話紀錄"
          >
            <History className="h-3.5 w-3.5" />
            紀錄 ({conversations.length})
          </button>
        )}
      </div>

      {/* Conversation history dropdown */}
      {showHistory && (
        <ConversationList
          conversations={conversations}
          activeConvId={activeConvId}
          onSelect={switchConversation}
          onDelete={handleDeleteConversation}
        />
      )}

      {/* Chat — no key remount, state lives in Zustand store */}
      <div className="flex-1 overflow-hidden">
        <ChatContainer
          endpoint={`/api/chat/${repoId}`}
          conversationId={activeConvId}
          onConversationId={handleConversationId}
        />
      </div>
    </div>
  );
}

export default function RepoChatPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RepoChatContent repoId={repoId} />
    </Suspense>
  );
}

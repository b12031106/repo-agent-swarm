"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Trash2,
  Share2,
  MessageSquare,
  Users,
  FileSearch,
  Clock,
  FolderGit2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShareDialog } from "@/components/chat/share-dialog";
import type { Conversation } from "@/types";

type FilterTab = "all" | "repo" | "orchestrator" | "analysis";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-TW");
}

function getConversationUrl(conv: Conversation): string {
  if (conv.type === "analysis") return `/analysis?conv=${conv.id}`;
  if (conv.isOrchestrator) return `/orchestrator?conv=${conv.id}`;
  if (conv.repoId) return `/repos/${conv.repoId}?conv=${conv.id}`;
  return `/orchestrator?conv=${conv.id}`;
}

function getTypeLabel(conv: Conversation): {
  label: string;
  variant: "default" | "secondary" | "outline";
  icon: React.ComponentType<{ className?: string }>;
} {
  if (conv.type === "analysis")
    return { label: "需求分析", variant: "outline", icon: FileSearch };
  if (conv.isOrchestrator)
    return { label: "總顧問", variant: "secondary", icon: Users };
  return { label: "Repo 對話", variant: "default", icon: MessageSquare };
}

function filterConversations(
  conversations: Conversation[],
  tab: FilterTab
): Conversation[] {
  switch (tab) {
    case "repo":
      return conversations.filter(
        (c) => !c.isOrchestrator && c.type !== "analysis"
      );
    case "orchestrator":
      return conversations.filter((c) => c.isOrchestrator);
    case "analysis":
      return conversations.filter((c) => c.type === "analysis");
    default:
      return conversations;
  }
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingConv, setSharingConv] = useState<Conversation | null>(null);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, convId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(convId);
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      }
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = filterConversations(conversations, activeTab);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">對話紀錄</h1>
        <p className="text-muted-foreground mt-1">
          瀏覽所有對話，快速跳轉繼續
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as FilterTab)}
      >
        <TabsList>
          <TabsTrigger value="all">全部 ({conversations.length})</TabsTrigger>
          <TabsTrigger value="repo">
            Repo 對話 (
            {filterConversations(conversations, "repo").length})
          </TabsTrigger>
          <TabsTrigger value="orchestrator">
            總顧問 (
            {filterConversations(conversations, "orchestrator").length})
          </TabsTrigger>
          <TabsTrigger value="analysis">
            需求分析 (
            {filterConversations(conversations, "analysis").length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">
            {conversations.length === 0
              ? "還沒有任何對話紀錄"
              : "此分類沒有對話"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => {
            const typeInfo = getTypeLabel(conv);
            const TypeIcon = typeInfo.icon;
            return (
              <Link
                key={conv.id}
                href={getConversationUrl(conv)}
                className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
              >
                <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate max-w-[400px]">
                      {conv.title}
                    </span>
                    <Badge variant={typeInfo.variant} className="text-[10px] px-1.5 py-0">
                      {typeInfo.label}
                    </Badge>
                    {conv.model && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {conv.model}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {conv.repoName && (
                      <span className="flex items-center gap-1">
                        <FolderGit2 className="h-3 w-3" />
                        {conv.repoName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSharingConv(conv);
                    }}
                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
                    title="分享對話"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                    title="刪除對話"
                  >
                    {deletingId === conv.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {sharingConv && (
        <ShareDialog
          conversationId={sharingConv.id}
          conversationTitle={sharingConv.title}
          open={true}
          onClose={() => setSharingConv(null)}
        />
      )}
    </div>
  );
}

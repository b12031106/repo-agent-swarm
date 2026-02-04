"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import type { Conversation } from "@/types";

interface ConversationListProps {
  conversations: Conversation[];
  activeConvId?: string;
  onSelect: (convId: string) => void;
  onDelete: (convId: string) => void;
}

export function ConversationList({
  conversations,
  activeConvId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (
    e: React.MouseEvent,
    convId: string
  ) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(convId);
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(convId);
      }
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border-b bg-muted/30 px-4 py-2 max-h-48 overflow-y-auto">
      <div className="space-y-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center rounded-md text-xs transition-colors ${
              conv.id === activeConvId
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <button
              onClick={() => onSelect(conv.id)}
              className="flex-1 min-w-0 text-left px-3 py-1.5"
            >
              <div className="truncate font-medium">{conv.title}</div>
              <div className="text-[10px] opacity-60">
                {new Date(conv.updatedAt).toLocaleString("zh-TW")}
              </div>
            </button>
            <button
              onClick={(e) => handleDelete(e, conv.id)}
              className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
              title="刪除對話"
            >
              {deletingId === conv.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

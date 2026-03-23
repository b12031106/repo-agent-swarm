"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Link, Trash2, Loader2 } from "lucide-react";
import type { Share } from "@/types";

interface ShareDialogProps {
  conversationId: string;
  conversationTitle: string;
  messageIds?: string[];
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({
  conversationId,
  conversationTitle,
  messageIds,
  open,
  onClose,
}: ShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(
    undefined
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/shares`
      );
      if (res.ok) {
        const data = await res.json();
        setShares(data);
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [conversationId]);

  // Fetch shares when dialog opens
  if (open && !loaded) {
    fetchShares();
  }

  const createShare = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messageIds: messageIds?.length ? messageIds : undefined,
          title: conversationTitle,
          expiresInDays,
        }),
      });
      if (res.ok) {
        const share = await res.json();
        setShares((prev) => [share, ...prev]);
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteShare = async (token: string) => {
    const res = await fetch(`/api/share/${token}`, { method: "DELETE" });
    if (res.ok) {
      setShares((prev) => prev.filter((s) => s.token !== token));
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">分享對話</h2>
          <button
            onClick={() => {
              onClose();
              setLoaded(false);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {/* Create new share */}
        <div className="mb-4 space-y-3">
          {messageIds && messageIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              將分享 {messageIds.length} 則訊息
            </p>
          )}

          <div className="flex items-center gap-2">
            <select
              value={expiresInDays || ""}
              onChange={(e) =>
                setExpiresInDays(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">永不過期</option>
              <option value="1">1 天</option>
              <option value="7">7 天</option>
              <option value="30">30 天</option>
              <option value="90">90 天</option>
            </select>

            <button
              onClick={createShare}
              disabled={creating}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link className="h-4 w-4" />
              )}
              建立連結
            </button>
          </div>
        </div>

        {/* Existing shares */}
        <div className="space-y-2">
          {loading && (
            <p className="text-sm text-muted-foreground">載入中...</p>
          )}
          {!loading && shares.length === 0 && loaded && (
            <p className="text-sm text-muted-foreground">
              尚未建立任何分享連結
            </p>
          )}
          {shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center gap-2 rounded-md border p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono truncate text-muted-foreground">
                  /share/{share.token}
                </p>
                <p className="text-xs text-muted-foreground">
                  {share.viewCount} 次查看
                  {share.expiresAt &&
                    ` · 到期：${new Date(share.expiresAt).toLocaleDateString("zh-TW")}`}
                </p>
              </div>
              <button
                onClick={() => copyLink(share.token)}
                className="p-1.5 rounded hover:bg-accent"
                title="複製連結"
              >
                {copied === share.token ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => deleteShare(share.token)}
                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                title="撤銷分享"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

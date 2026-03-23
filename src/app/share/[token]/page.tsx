"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ExternalLink, User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SharedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface SharedData {
  share: {
    title: string;
    createdAt: string;
    expiresAt: string | null;
  };
  conversation: {
    id: string;
    title: string;
    model: string | null;
    type: string | null;
    createdAt: string;
    messages: SharedMessage[];
  };
  sharer: {
    name: string | null;
    image: string | null;
  } | null;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShare() {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || "找不到此分享連結");
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("載入失敗");
      } finally {
        setLoading(false);
      }
    }
    fetchShare();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">載入中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">無法載入</h1>
          <p className="text-muted-foreground">{error || "找不到此分享連結"}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            前往 Repo Agent Swarm <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>來自 Repo Agent Swarm 的分享對話</span>
          {data.share.expiresAt && (
            <span>
              · 有效期至{" "}
              {new Date(data.share.expiresAt).toLocaleDateString("zh-TW")}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold">{data.share.title}</h1>
        {data.sharer?.name && (
          <p className="text-sm text-muted-foreground">
            由 {data.sharer.name} 分享
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-6">
        {data.conversation.messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              {msg.role === "user" ? (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <div className="h-7 w-7 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-violet-600" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {msg.role === "user" ? "使用者" : "助理"}
              </p>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="mt-12 border-t pt-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          在 Repo Agent Swarm 中開啟 <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

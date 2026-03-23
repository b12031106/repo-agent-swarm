"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  RefreshCw,
  Trash2,
  MessageSquare,
  Loader2,
  AlertCircle,
  Check,
  Settings,
} from "lucide-react";
import type { Repo } from "@/types";
import Link from "next/link";

interface RepoCardProps {
  repo: Repo;
  onSync?: (repoId: string) => void;
  onDelete?: (repoId: string) => void;
  onSettings?: (repoId: string) => void;
}

const statusConfig = {
  cloning: {
    label: "Clone 中",
    variant: "secondary" as const,
    icon: Loader2,
    animate: true,
  },
  ready: {
    label: "就緒",
    variant: "default" as const,
    icon: Check,
    animate: false,
  },
  error: {
    label: "錯誤",
    variant: "destructive" as const,
    icon: AlertCircle,
    animate: false,
  },
  syncing: {
    label: "同步中",
    variant: "secondary" as const,
    icon: RefreshCw,
    animate: true,
  },
};

export function RepoCard({ repo, onSync, onDelete, onSettings }: RepoCardProps) {
  const status = statusConfig[repo.status];
  const StatusIcon = status.icon;

  return (
    <div className="overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h3 className="truncate font-semibold">{repo.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {repo.customPrompt && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              自訂 Prompt
            </Badge>
          )}
          <Badge variant={status.variant} className="flex items-center gap-1">
            <StatusIcon
              className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`}
            />
            {status.label}
          </Badge>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground truncate">
        {repo.githubUrl}
      </p>

      {repo.lastSyncedAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          最後同步: {new Date(repo.lastSyncedAt).toLocaleString("zh-TW")}
        </p>
      )}

      {repo.errorMessage && (
        <p className="mt-1 text-xs text-destructive">{repo.errorMessage}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {repo.status === "ready" && (
          <>
            <Link href={`/repos/${repo.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare className="mr-1 h-3 w-3" />
                對話
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSync?.(repo.id)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              同步
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSettings?.(repo.id)}
            >
              <Settings className="mr-1 h-3 w-3" />
              設定
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete?.(repo.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

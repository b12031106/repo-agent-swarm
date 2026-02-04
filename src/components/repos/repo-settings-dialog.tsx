"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { DEFAULT_REPO_AGENT_ROLE } from "@/lib/constants/default-prompts";
import type { Repo } from "@/types";

interface RepoSettingsDialogProps {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (repo: Repo) => void;
}

const PROMPT_MAX_LENGTH = 2000;

export function RepoSettingsDialog({
  repo,
  open,
  onOpenChange,
  onSaved,
}: RepoSettingsDialogProps) {
  const [customPrompt, setCustomPrompt] = useState(repo.customPrompt || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCustomPrompt(repo.customPrompt || "");
      setError(null);
    }
  }, [open, repo.customPrompt]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/repos/${repo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customPrompt: customPrompt.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "儲存失敗");
      }

      const updated = await res.json();
      onSaved?.(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{repo.name} - Agent 設定</DialogTitle>
          <DialogDescription>
            自訂此 Repository 的 Agent 角色描述。核心安全約束（唯讀、工具限制）不可覆蓋。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={customPrompt}
            onChange={(e) =>
              setCustomPrompt(e.target.value.slice(0, PROMPT_MAX_LENGTH))
            }
            placeholder={DEFAULT_REPO_AGENT_ROLE}
            rows={8}
            disabled={saving}
            className="text-xs"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              留空則使用預設角色描述。
            </p>
            <span className="text-xs text-muted-foreground">
              {customPrompt.length}/{PROMPT_MAX_LENGTH}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

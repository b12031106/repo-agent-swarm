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
import { DEFAULT_ORCHESTRATOR_ROLE } from "@/lib/constants/default-prompts";

interface OrchestratorSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROMPT_MAX_LENGTH = 2000;

export function OrchestratorSettingsDialog({
  open,
  onOpenChange,
}: OrchestratorSettingsDialogProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    fetch("/api/settings?key=orchestrator_custom_prompt")
      .then((r) => r.json())
      .then((data) => {
        setCustomPrompt(data?.value || "");
      })
      .catch(() => {
        setCustomPrompt("");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "orchestrator_custom_prompt",
          value: customPrompt.trim() || "",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "儲存失敗");
      }

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
          <DialogTitle>總顧問 (Orchestrator) 設定</DialogTitle>
          <DialogDescription>
            自訂總顧問的角色描述。核心約束（Repo 清單、委派規則）不可覆蓋。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={customPrompt}
              onChange={(e) =>
                setCustomPrompt(e.target.value.slice(0, PROMPT_MAX_LENGTH))
              }
              placeholder={DEFAULT_ORCHESTRATOR_ROLE}
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
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

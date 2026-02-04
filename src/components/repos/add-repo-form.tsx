"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { DEFAULT_REPO_AGENT_ROLE } from "@/lib/constants/default-prompts";

interface AddRepoFormProps {
  onAdded?: () => void;
}

const PROMPT_MAX_LENGTH = 2000;

export function AddRepoForm({ onAdded }: AddRepoFormProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUrl: url.trim(),
          name: name.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add repo");
      }

      setUrl("");
      setName("");
      setCustomPrompt("");
      setShowAdvanced(false);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="flex-1"
          disabled={isSubmitting}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名稱 (選填)"
          className="w-40"
          disabled={isSubmitting}
        />
        <Button type="submit" disabled={!url.trim() || isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          新增
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        進階設定
      </button>

      {showAdvanced && (
        <div className="space-y-2">
          <Textarea
            value={customPrompt}
            onChange={(e) =>
              setCustomPrompt(e.target.value.slice(0, PROMPT_MAX_LENGTH))
            }
            placeholder={DEFAULT_REPO_AGENT_ROLE}
            rows={4}
            disabled={isSubmitting}
            className="text-xs"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              自訂 Agent 角色描述。留空則使用預設。核心安全約束（唯讀、工具限制）不可覆蓋。
            </p>
            <span className="text-xs text-muted-foreground">
              {customPrompt.length}/{PROMPT_MAX_LENGTH}
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

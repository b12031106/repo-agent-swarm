"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ScanSearch,
  Check,
  AlertCircle,
  X,
  Plus,
} from "lucide-react";
import { DEFAULT_REPO_AGENT_ROLE } from "@/lib/constants/default-prompts";
import type { Repo, ProfileStatus, RepoDependency } from "@/types";

interface RepoSettingsDialogProps {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (repo: Repo) => void;
  allRepos?: Repo[];
}

const PROMPT_MAX_LENGTH = 2000;
const SERVICE_TYPES = ["frontend", "bff", "backend", "shared-lib", "other"] as const;

export function RepoSettingsDialog({
  repo,
  open,
  onOpenChange,
  onSaved,
  allRepos = [],
}: RepoSettingsDialogProps) {
  // Agent settings
  const [customPrompt, setCustomPrompt] = useState(repo.customPrompt || "");

  // Service metadata
  const [description, setDescription] = useState(repo.description || "");
  const [domain, setDomain] = useState(repo.domain || "");
  const [serviceType, setServiceType] = useState(repo.serviceType || "");
  const [techStack, setTechStack] = useState(repo.techStack || "");
  const [teamOwner, setTeamOwner] = useState(repo.teamOwner || "");
  const [exposedApis, setExposedApis] = useState("");
  const [dependencies, setDependencies] = useState<RepoDependency[]>([]);
  const [newDepName, setNewDepName] = useState("");
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>(
    (repo.profileStatus as ProfileStatus) || "empty"
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCustomPrompt(repo.customPrompt || "");
      setDescription(repo.description || "");
      setDomain(repo.domain || "");
      setServiceType(repo.serviceType || "");
      setTechStack(repo.techStack || "");
      setTeamOwner(repo.teamOwner || "");
      setProfileStatus((repo.profileStatus as ProfileStatus) || "empty");
      setError(null);
      setScanMessage(null);

      // Parse JSON fields
      try {
        const apis = repo.exposedApisJson ? JSON.parse(repo.exposedApisJson) : [];
        setExposedApis(Array.isArray(apis) ? apis.join("\n") : "");
      } catch {
        setExposedApis("");
      }

      try {
        const deps = repo.dependenciesJson ? JSON.parse(repo.dependenciesJson) : [];
        setDependencies(Array.isArray(deps) ? deps : []);
      } catch {
        setDependencies([]);
      }
    }
  }, [open, repo]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanMessage("掃描中...");
    setError(null);

    try {
      const res = await fetch(`/api/repos/${repo.id}/scan`, { method: "POST" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "掃描失敗");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "tool_use") {
              setScanMessage(`掃描中... (${event.tool})`);
            }
            if (event.type === "done" && event.content) {
              const result = JSON.parse(event.content);
              // Update form fields with scan results
              if (result.description) setDescription(result.description);
              if (result.domain) setDomain(result.domain);
              if (result.serviceType) setServiceType(result.serviceType);
              if (result.techStack) setTechStack(result.techStack);
              if (result.exposedApis) {
                setExposedApis(result.exposedApis.join("\n"));
              }
              if (result.dependencies) {
                setDependencies(
                  result.dependencies.map((d: string) => {
                    // Try to match with existing repos
                    const matchedRepo = allRepos.find(
                      (r) =>
                        r.name.toLowerCase().includes(d.toLowerCase()) ||
                        d.toLowerCase().includes(r.name.toLowerCase())
                    );
                    return matchedRepo
                      ? { repoId: matchedRepo.id, name: d }
                      : { name: d };
                  })
                );
              }
              setProfileStatus("draft");
              setScanMessage("掃描完成！請審閱結果。");
            }
            if (event.type === "error") {
              throw new Error(event.error || "掃描失敗");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "掃描失敗") {
              // Skip parse errors from partial JSON
            } else {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "掃描失敗");
      setScanMessage(null);
    } finally {
      setScanning(false);
    }
  }, [repo.id, allRepos]);

  const handleSave = async (newStatus?: ProfileStatus) => {
    setSaving(true);
    setError(null);

    const apisArray = exposedApis
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/repos/${repo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customPrompt: customPrompt.trim() || null,
          description: description.trim() || null,
          domain: domain.trim() || null,
          serviceType: serviceType.trim() || null,
          techStack: techStack.trim() || null,
          teamOwner: teamOwner.trim() || null,
          exposedApisJson: JSON.stringify(apisArray),
          dependenciesJson: JSON.stringify(dependencies),
          profileStatus: newStatus || profileStatus,
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

  const addDependency = () => {
    if (!newDepName.trim()) return;

    // Check if it matches an existing repo
    const matchedRepo = allRepos.find(
      (r) => r.name.toLowerCase() === newDepName.trim().toLowerCase()
    );

    setDependencies([
      ...dependencies,
      matchedRepo
        ? { repoId: matchedRepo.id, name: newDepName.trim() }
        : { name: newDepName.trim() },
    ]);
    setNewDepName("");
  };

  const removeDependency = (index: number) => {
    setDependencies(dependencies.filter((_, i) => i !== index));
  };

  const statusBadge = profileStatus === "confirmed"
    ? { label: "已確認", color: "text-green-600 bg-green-500/10" }
    : profileStatus === "draft"
      ? { label: "草稿", color: "text-amber-600 bg-amber-500/10" }
      : { label: "無資料", color: "text-muted-foreground bg-muted" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{repo.name} - 服務概況</DialogTitle>
          <DialogDescription>
            管理此 Repository 的服務元資料和 Agent 設定。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">基本資訊</TabsTrigger>
            <TabsTrigger value="agent" className="flex-1">Agent 設定</TabsTrigger>
          </TabsList>

          {/* Tab: 基本資訊 */}
          <TabsContent value="profile" className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={scanning || saving || repo.status !== "ready"}
                className="text-xs"
              >
                {scanning ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <ScanSearch className="mr-1 h-3 w-3" />
                )}
                自動掃描
              </Button>
              <span className="flex-1 text-xs text-muted-foreground">
                {scanMessage || "使用 AI 分析程式碼自動填入元資料"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>

            {/* Form fields */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">服務描述</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例：負責商品評論的 CRUD、評分統計"
                  rows={2}
                  disabled={saving || scanning}
                  className="mt-1 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">業務領域</label>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="例：review, product, order"
                    disabled={saving || scanning}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">服務類型</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    disabled={saving || scanning}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">選擇類型</option>
                    {SERVICE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">技術棧</label>
                  <Input
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value)}
                    placeholder="例：Node.js, Express, PostgreSQL"
                    disabled={saving || scanning}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">負責團隊</label>
                  <Input
                    value={teamOwner}
                    onChange={(e) => setTeamOwner(e.target.value)}
                    placeholder="例：商品團隊"
                    disabled={saving || scanning}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  主要 API（每行一個）
                </label>
                <Textarea
                  value={exposedApis}
                  onChange={(e) => setExposedApis(e.target.value)}
                  placeholder={"/api/reviews\n/api/ratings"}
                  rows={3}
                  disabled={saving || scanning}
                  className="mt-1 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">依賴服務</label>
                <div className="mt-1 space-y-1.5">
                  {dependencies.map((dep, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                    >
                      <span className="flex-1">
                        {dep.name}
                        {dep.repoId && (
                          <span className="ml-1 text-[10px] text-green-600">（已關聯）</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDependency(i)}
                        className="text-muted-foreground hover:text-destructive"
                        disabled={saving || scanning}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newDepName}
                      onChange={(e) => setNewDepName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing || e.key === "Process") return;
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addDependency();
                        }
                      }}
                      placeholder="輸入服務名稱或選擇已註冊 Repo"
                      disabled={saving || scanning}
                      className="text-xs flex-1"
                      list="repo-suggestions"
                    />
                    <datalist id="repo-suggestions">
                      {allRepos
                        .filter((r) => r.id !== repo.id)
                        .map((r) => (
                          <option key={r.id} value={r.name} />
                        ))}
                    </datalist>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDependency}
                      disabled={!newDepName.trim() || saving || scanning}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Agent 設定 */}
          <TabsContent value="agent" className="space-y-2">
            <p className="text-xs text-muted-foreground">
              自訂此 Repository 的 Agent 角色描述。核心安全約束（唯讀、工具限制）不可覆蓋。
            </p>
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
          </TabsContent>
        </Tabs>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || scanning}
          >
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={saving || scanning}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            儲存為草稿
          </Button>
          <Button
            onClick={() => handleSave("confirmed")}
            disabled={saving || scanning}
          >
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            確認並儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

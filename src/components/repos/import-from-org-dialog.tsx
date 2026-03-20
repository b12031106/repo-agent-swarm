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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Building2, Check, AlertCircle } from "lucide-react";

interface Installation {
  id: number;
  account: { login: string; avatar_url: string; type: string };
  repositories_count: number;
}

interface OrgRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  clone_url: string;
  description: string | null;
  language: string | null;
  imported: boolean;
}

interface ImportFromOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportFromOrgDialog({
  open,
  onOpenChange,
  onImported,
}: ImportFromOrgDialogProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null);
  const [repos, setRepos] = useState<OrgRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingInstallations, setLoadingInstallations] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check configuration status on open
  useEffect(() => {
    if (!open) return;
    setLoadingStatus(true);
    setError(null);
    fetch("/api/github/status")
      .then((res) => res.json())
      .then((data) => {
        setConfigured(data.configured);
        if (data.configured) {
          setLoadingInstallations(true);
          return fetch("/api/github/installations")
            .then((res) => res.json())
            .then((data) => {
              if (Array.isArray(data)) {
                setInstallations(data);
              } else {
                setError(data.error || "無法取得組織列表");
              }
            });
        }
      })
      .catch(() => setError("無法連線至伺服器"))
      .finally(() => {
        setLoadingStatus(false);
        setLoadingInstallations(false);
      });
  }, [open]);

  // Load repos when installation selected
  useEffect(() => {
    if (!selectedInstallation) return;
    setLoadingRepos(true);
    setRepos([]);
    setSelectedRepos(new Set());
    setError(null);
    fetch(`/api/github/installations/${selectedInstallation}/repos`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRepos(data);
        } else {
          setError(data.error || "無法取得 Repository 列表");
        }
      })
      .catch(() => setError("無法取得 Repository 列表"))
      .finally(() => setLoadingRepos(false));
  }, [selectedInstallation]);

  const toggleRepo = (id: number) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedInstallation || selectedRepos.size === 0) return;
    setImporting(true);
    setError(null);

    const reposToImport = repos
      .filter((r) => selectedRepos.has(r.id))
      .map((r) => ({ name: r.name, githubUrl: r.clone_url }));

    try {
      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: selectedInstallation,
          repos: reposToImport,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "匯入失敗");
      }

      onImported();
      onOpenChange(false);
      // Reset state
      setSelectedInstallation(null);
      setRepos([]);
      setSelectedRepos(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯入失敗");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedInstallation(null);
      setRepos([]);
      setSelectedRepos(new Set());
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>從組織匯入 Repository</DialogTitle>
          <DialogDescription>
            透過 GitHub App 瀏覽組織內的 Repository 並批次匯入
          </DialogDescription>
        </DialogHeader>

        {loadingStatus ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : configured === false ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-8 w-8" />
            <p className="font-medium">GitHub App 尚未設定</p>
            <p className="mt-1">
              請在環境變數中設定 <code className="rounded bg-muted px-1">GITHUB_APP_ID</code> 和{" "}
              <code className="rounded bg-muted px-1">GITHUB_PRIVATE_KEY</code>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Installation selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">選擇組織</label>
              {loadingInstallations ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : installations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  尚無安裝此 GitHub App 的組織
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {installations.map((inst) => (
                    <Button
                      key={inst.id}
                      variant={selectedInstallation === inst.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedInstallation(inst.id)}
                    >
                      <Building2 className="mr-1 h-3.5 w-3.5" />
                      {inst.account.login}
                      <Badge variant="secondary" className="ml-1.5">
                        {inst.repositories_count}
                      </Badge>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Repos list */}
            {selectedInstallation && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  選擇 Repository
                  {selectedRepos.size > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      （已選 {selectedRepos.size} 個）
                    </span>
                  )}
                </label>
                {loadingRepos ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : repos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">此組織沒有可存取的 Repository</p>
                ) : (
                  <ScrollArea className="h-[300px] rounded-md border">
                    <div className="divide-y">
                      {repos.map((repo) => (
                        <label
                          key={repo.id}
                          className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 ${
                            repo.imported ? "cursor-default opacity-50" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={selectedRepos.has(repo.id)}
                            disabled={repo.imported}
                            onChange={() => toggleRepo(repo.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {repo.name}
                              </span>
                              {repo.private && (
                                <Badge variant="outline" className="text-xs">
                                  Private
                                </Badge>
                              )}
                              {repo.imported && (
                                <Badge variant="secondary" className="text-xs">
                                  <Check className="mr-0.5 h-3 w-3" />
                                  已匯入
                                </Badge>
                              )}
                              {repo.language && (
                                <span className="text-xs text-muted-foreground">
                                  {repo.language}
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="truncate text-xs text-muted-foreground">
                                {repo.description}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            取消
          </Button>
          {configured && (
            <Button
              onClick={handleImport}
              disabled={importing || selectedRepos.size === 0}
            >
              {importing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              匯入 {selectedRepos.size > 0 ? `(${selectedRepos.size})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

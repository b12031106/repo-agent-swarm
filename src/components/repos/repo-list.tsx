"use client";

import { useState, useEffect, useCallback } from "react";
import { RepoCard } from "./repo-card";
import { AddRepoForm } from "./add-repo-form";
import { RepoSettingsDialog } from "./repo-settings-dialog";
import { Button } from "@/components/ui/button";
import type { Repo } from "@/types";
import { Loader2, RefreshCw } from "lucide-react";

function notifySidebar() {
  window.dispatchEvent(new CustomEvent("repos-changed"));
}

export function RepoList() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsRepoId, setSettingsRepoId] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      setRepos(data);
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // Auto-poll while any repo is in a pending state (cloning/syncing)
  const hasPendingRepos = repos.some(
    (r) => r.status === "cloning" || r.status === "syncing"
  );

  useEffect(() => {
    if (!hasPendingRepos) return;
    const interval = setInterval(() => {
      fetchRepos().then(() => notifySidebar());
    }, 3000);
    return () => clearInterval(interval);
  }, [hasPendingRepos, fetchRepos]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRepos().then(() => notifySidebar());
  };

  const handleAdded = () => {
    fetchRepos().then(() => notifySidebar());
  };

  const handleSync = async (repoId: string) => {
    await fetch(`/api/repos/${repoId}/sync`, { method: "POST" });
    fetchRepos();
  };

  const handleDelete = async (repoId: string) => {
    if (!confirm("確定要移除此 Repository?")) return;
    await fetch(`/api/repos/${repoId}`, { method: "DELETE" });
    fetchRepos().then(() => notifySidebar());
  };

  const handleSettings = (repoId: string) => {
    setSettingsRepoId(repoId);
  };

  const handleSettingsSaved = (updatedRepo: Repo) => {
    setRepos((prev) =>
      prev.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
    );
  };

  const settingsRepo = repos.find((r) => r.id === settingsRepoId);

  return (
    <div className="space-y-6">
      <AddRepoForm onAdded={handleAdded} />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {repos.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={`mr-1 h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                />
                重新整理
              </Button>
            </div>
          )}

          {repos.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              尚無 Repository，請在上方輸入 GitHub URL 來新增
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {repos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  onSync={handleSync}
                  onDelete={handleDelete}
                  onSettings={handleSettings}
                />
              ))}
            </div>
          )}
        </>
      )}

      {settingsRepo && (
        <RepoSettingsDialog
          repo={settingsRepo}
          open={!!settingsRepoId}
          onOpenChange={(open) => {
            if (!open) setSettingsRepoId(null);
          }}
          onSaved={handleSettingsSaved}
        />
      )}
    </div>
  );
}

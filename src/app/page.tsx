"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, MessageSquare, Users, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Repo } from "@/types";

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reposRes, convsRes] = await Promise.all([
          fetch("/api/repos"),
          fetch("/api/conversations"),
        ]);
        const reposData = await reposRes.json();
        const convsData = await convsRes.json();

        setRepos(reposData);
        setTotalConversations(convsData.length);
      } catch {
        // silently fail
      }
    };
    fetchData();
  }, []);

  const readyRepos = repos.filter((r) => r.status === "ready").length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Repo Agent Swarm - 多 Repo AI 程式碼分析平台
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={GitBranch}
          label="Repositories"
          value={`${readyRepos} / ${repos.length}`}
          description="就緒 / 總數"
        />
        <StatCard
          icon={MessageSquare}
          label="對話"
          value={String(totalConversations)}
          description="歷史對話數"
        />
        <StatCard
          icon={Activity}
          label="狀態"
          value={readyRepos > 0 ? "運作中" : "待設定"}
          description={
            readyRepos > 0
              ? `${readyRepos} 個 Agent 就緒`
              : "請先新增 Repository"
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">快速操作</h2>
        <div className="flex gap-3">
          <Link href="/repos">
            <Button variant="outline">
              <GitBranch className="mr-2 h-4 w-4" />
              管理 Repositories
            </Button>
          </Link>
          {readyRepos > 0 && (
            <Link href="/orchestrator">
              <Button>
                <Users className="mr-2 h-4 w-4" />
                啟動總顧問
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Recent repos */}
      {repos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Repositories</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {repos.slice(0, 6).map((repo) => (
              <Link
                key={repo.id}
                href={
                  repo.status === "ready" ? `/repos/${repo.id}` : "/repos"
                }
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <GitBranch className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{repo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {repo.status === "ready"
                      ? "點擊開始對話"
                      : repo.status}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

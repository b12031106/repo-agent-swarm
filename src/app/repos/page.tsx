"use client";

import { RepoList } from "@/components/repos/repo-list";

export default function ReposPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Repositories</h1>
        <p className="text-muted-foreground mt-1">
          管理你的 Git Repositories，每個 repo 會自動建立對應的 AI Agent
        </p>
      </div>
      <RepoList />
    </div>
  );
}

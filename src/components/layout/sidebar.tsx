"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  LayoutDashboard,
  Users,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FontSizeToggle } from "@/components/font-size-toggle";
import type { Repo } from "@/types";

export function Sidebar() {
  const pathname = usePathname();
  const [repos, setRepos] = useState<Repo[]>([]);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      setRepos(data.filter((r: Repo) => r.status === "ready"));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchRepos();

    // Listen for custom event when repos change (emitted by repo-list on add/delete/sync)
    const handler = () => fetchRepos();
    window.addEventListener("repos-changed", handler);
    return () => window.removeEventListener("repos-changed", handler);
  }, [fetchRepos]);

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          RA
        </div>
        <span className="font-semibold">Repo Agent Swarm</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        <NavItem
          href="/"
          icon={LayoutDashboard}
          label="Dashboard"
          active={pathname === "/"}
        />
        <NavItem
          href="/repos"
          icon={GitBranch}
          label="Repositories"
          active={pathname === "/repos"}
        />
        <NavItem
          href="/orchestrator"
          icon={Users}
          label="總顧問"
          active={pathname === "/orchestrator"}
        />

        {/* Repo list */}
        {repos.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase">
              Repos
            </p>
            {repos.map((repo) => (
              <NavItem
                key={repo.id}
                href={`/repos/${repo.id}`}
                icon={MessageSquare}
                label={repo.name}
                active={pathname === `/repos/${repo.id}`}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Theme toggle */}
      <div className="border-t p-2 space-y-1">
        <ThemeToggle />
        <FontSizeToggle />
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate flex-1">{label}</span>
      {active && <ChevronRight className="h-3 w-3" />}
    </Link>
  );
}

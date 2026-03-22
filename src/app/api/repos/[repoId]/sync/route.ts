import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { syncRepo } from "@/lib/git/clone";
import { getInstallationToken } from "@/lib/github/auth";
import {
  computeClaudeMdHash,
  getRepoDescriptionSource,
  updateMasterClaudeMdForRepo,
} from "@/lib/claude-md";

/** POST /api/repos/[repoId]/sync - Trigger git pull */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;
  const db = getDb();

  const repo = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.id, repoId))
    .get();

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  if (repo.status !== "ready") {
    return NextResponse.json(
      { error: "Repo is not ready for sync" },
      { status: 400 }
    );
  }

  // Mark as syncing
  db.update(schema.repos)
    .set({ status: "syncing" })
    .where(eq(schema.repos.id, repoId))
    .run();

  // Get auth token if repo has installationId
  const syncOptions: { githubUrl?: string; authToken?: string } = {};
  if (repo.installationId) {
    try {
      syncOptions.authToken = await getInstallationToken(repo.installationId);
      syncOptions.githubUrl = repo.githubUrl;
    } catch {
      // Fall back to unauthenticated sync
    }
  }

  // Sync in background
  syncRepo(repo.localPath, syncOptions)
    .then(async () => {
      db.update(schema.repos)
        .set({
          status: "ready",
          lastSyncedAt: new Date().toISOString(),
        })
        .where(eq(schema.repos.id, repoId))
        .run();

      // Check if CLAUDE.md (or equivalent) has changed
      const newHash = computeClaudeMdHash(repo.localPath);
      if (newHash !== repo.claudeMdHash) {
        // If a real CLAUDE.md appeared, clean up .generated-claude.md
        const source = getRepoDescriptionSource(repo.localPath);
        if (source && source.source !== ".generated-claude.md") {
          const generatedPath = path.join(repo.localPath, ".generated-claude.md");
          if (fs.existsSync(generatedPath)) {
            fs.rmSync(generatedPath, { force: true });
          }
        }

        db.update(schema.repos)
          .set({ claudeMdHash: newHash })
          .where(eq(schema.repos.id, repoId))
          .run();

        const allReady = db.select().from(schema.repos).where(eq(schema.repos.status, "ready")).all();
        updateMasterClaudeMdForRepo(repo, allReady).catch((err) =>
          console.error("[sync] Failed to update master CLAUDE.md:", err)
        );
      }
    })
    .catch((error) => {
      db.update(schema.repos)
        .set({
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "Sync failed",
        })
        .where(eq(schema.repos.id, repoId))
        .run();
    });

  return NextResponse.json({ success: true, status: "syncing" });
}

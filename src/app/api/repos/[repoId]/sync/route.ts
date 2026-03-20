import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { syncRepo } from "@/lib/git/clone";
import { getInstallationToken } from "@/lib/github/auth";

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
    .then(() => {
      db.update(schema.repos)
        .set({
          status: "ready",
          lastSyncedAt: new Date().toISOString(),
        })
        .where(eq(schema.repos.id, repoId))
        .run();
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

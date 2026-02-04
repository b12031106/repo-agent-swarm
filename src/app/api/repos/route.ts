import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import {
  cloneRepo,
  extractRepoName,
  getRepoLocalPath,
} from "@/lib/git/clone";

/** GET /api/repos - List all repos */
export async function GET() {
  const db = getDb();
  const allRepos = db.select().from(schema.repos).all();
  return NextResponse.json(allRepos);
}

/** POST /api/repos - Register and clone a new repo */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { githubUrl, name, customPrompt } = body;

  if (!githubUrl) {
    return NextResponse.json(
      { error: "githubUrl is required" },
      { status: 400 }
    );
  }

  const repoId = uuidv4();
  const repoName = name || extractRepoName(githubUrl);
  const localPath = getRepoLocalPath(repoId, repoName);

  const db = getDb();

  // Insert repo record with cloning status
  db.insert(schema.repos)
    .values({
      id: repoId,
      name: repoName,
      githubUrl,
      localPath,
      status: "cloning",
      customPrompt: customPrompt?.trim() || null,
    })
    .run();

  // Start cloning in background
  cloneRepo(githubUrl, localPath)
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
            error instanceof Error ? error.message : "Clone failed",
        })
        .where(eq(schema.repos.id, repoId))
        .run();
    });

  const repo = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.id, repoId))
    .get();

  return NextResponse.json(repo, { status: 201 });
}

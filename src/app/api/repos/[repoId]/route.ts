import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { removeRepo } from "@/lib/git/clone";
import { agentManager } from "@/lib/agents/agent-manager";

/** GET /api/repos/[repoId] - Get a single repo */
export async function GET(
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

  return NextResponse.json(repo);
}

/** PATCH /api/repos/[repoId] - Update repo settings */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;
  const body = await request.json();
  const { customPrompt, name } = body;

  const db = getDb();

  const repo = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.id, repoId))
    .get();

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (customPrompt !== undefined) {
    updates.customPrompt = customPrompt?.trim() || null;
  }
  if (name !== undefined && name.trim()) {
    updates.name = name.trim();
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.repos)
      .set(updates)
      .where(eq(schema.repos.id, repoId))
      .run();
  }

  // Clear agent cache so next conversation uses updated prompt
  agentManager.removeAgent(repoId);

  const updated = db
    .select()
    .from(schema.repos)
    .where(eq(schema.repos.id, repoId))
    .get();

  return NextResponse.json(updated);
}

/** DELETE /api/repos/[repoId] - Remove a repo */
export async function DELETE(
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

  // Remove from disk
  removeRepo(repo.localPath);

  // Remove agent instance
  agentManager.removeAgent(repoId);

  // Delete from DB (cascades to conversations, messages, usage)
  db.delete(schema.repos).where(eq(schema.repos.id, repoId)).run();

  return NextResponse.json({ success: true });
}

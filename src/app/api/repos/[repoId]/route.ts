import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { removeRepo } from "@/lib/git/clone";
import { agentManager } from "@/lib/agents/agent-manager";
import { removeRepoFromMasterClaudeMd } from "@/lib/claude-md";
import { getRequiredUser, getRequiredAuthUser, isAuthError } from "@/lib/auth/get-user";

/** GET /api/repos/[repoId] - Get a single repo */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
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

/** PATCH /api/repos/[repoId] - Update repo settings (requires real account) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const _authCheck = await getRequiredAuthUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const { repoId } = await params;
  const body = await request.json();
  const {
    customPrompt, name, description, domain, serviceType,
    dependenciesJson, exposedApisJson, techStack, teamOwner, profileStatus,
  } = body;

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
  if (description !== undefined) updates.description = description?.trim() || null;
  if (domain !== undefined) updates.domain = domain?.trim() || null;
  if (serviceType !== undefined) updates.serviceType = serviceType?.trim() || null;
  if (dependenciesJson !== undefined) updates.dependenciesJson = typeof dependenciesJson === "string" ? dependenciesJson : JSON.stringify(dependenciesJson);
  if (exposedApisJson !== undefined) updates.exposedApisJson = typeof exposedApisJson === "string" ? exposedApisJson : JSON.stringify(exposedApisJson);
  if (techStack !== undefined) updates.techStack = techStack?.trim() || null;
  if (teamOwner !== undefined) updates.teamOwner = teamOwner?.trim() || null;
  if (profileStatus !== undefined) updates.profileStatus = profileStatus;

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

/** DELETE /api/repos/[repoId] - Remove a repo (requires real account) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const _authCheck2 = await getRequiredAuthUser();
  if (isAuthError(_authCheck2)) return _authCheck2;
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

  // Remove from master CLAUDE.md index before deleting
  removeRepoFromMasterClaudeMd(repo.name, repo.localPath);

  // Remove from disk
  removeRepo(repo.localPath);

  // Remove agent instance
  agentManager.removeAgent(repoId);

  // Delete from DB (cascades to conversations, messages, usage)
  db.delete(schema.repos).where(eq(schema.repos.id, repoId)).run();

  return NextResponse.json({ success: true });
}

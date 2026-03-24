import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import {
  cloneRepo,
  extractRepoName,
  getRepoLocalPath,
} from "@/lib/git/clone";
import { getInstallationToken } from "@/lib/github/auth";
import {
  getRepoDescriptionSource,
  generateRepoClaudeMd,
  computeClaudeMdHash,
  debouncedGenerateMasterClaudeMd,
} from "@/lib/claude-md";
import { getRequiredUser, getRequiredAuthUser, isAuthError } from "@/lib/auth/get-user";

/** GET /api/repos - List all repos */
export async function GET() {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const db = getDb();
  const allRepos = db.select().from(schema.repos).all();
  return NextResponse.json(allRepos);
}

/** POST /api/repos - Register and clone a new repo (requires real account) */
export async function POST(request: NextRequest) {
  const _authCheck = await getRequiredAuthUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const body = await request.json();
  const { githubUrl, name, customPrompt, description, domain, serviceType, techStack, teamOwner, installationId } = body;

  if (!githubUrl) {
    return NextResponse.json(
      { error: "githubUrl is required" },
      { status: 400 }
    );
  }

  const repoId = uuidv4();
  const repoName = name || extractRepoName(githubUrl);
  const localPath = getRepoLocalPath(githubUrl);

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
      description: description?.trim() || null,
      domain: domain?.trim() || null,
      serviceType: serviceType?.trim() || null,
      techStack: techStack?.trim() || null,
      teamOwner: teamOwner?.trim() || null,
      profileStatus: description || domain || serviceType ? "draft" : "empty",
      installationId: installationId ?? null,
    })
    .run();

  // Get auth token if installationId is provided
  const cloneOptions: { authToken?: string } = {};
  if (installationId) {
    try {
      cloneOptions.authToken = await getInstallationToken(installationId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to get installation token" },
        { status: 500 }
      );
    }
  }

  // Start cloning in background
  cloneRepo(githubUrl, localPath, cloneOptions)
    .then(async () => {
      db.update(schema.repos)
        .set({
          status: "ready",
          lastSyncedAt: new Date().toISOString(),
        })
        .where(eq(schema.repos.id, repoId))
        .run();

      // Generate .generated-claude.md if repo has no description file
      const source = getRepoDescriptionSource(localPath);
      if (!source) {
        await generateRepoClaudeMd(localPath, repoName).catch((err) =>
          console.error("[repos] Failed to generate repo CLAUDE.md:", err)
        );
      }

      // Compute and store hash, then update master index
      const hash = computeClaudeMdHash(localPath);
      db.update(schema.repos)
        .set({ claudeMdHash: hash })
        .where(eq(schema.repos.id, repoId))
        .run();

      const allReady = db.select().from(schema.repos).where(eq(schema.repos.status, "ready")).all();
      debouncedGenerateMasterClaudeMd(allReady);
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

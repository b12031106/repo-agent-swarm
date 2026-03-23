import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/github/api";
import { getInstallationToken } from "@/lib/github/auth";
import { getDb, schema } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { cloneRepo, extractRepoName, getRepoLocalPath } from "@/lib/git/clone";
import {
  getRepoDescriptionSource,
  generateRepoClaudeMd,
  computeClaudeMdHash,
  debouncedGenerateMasterClaudeMd,
} from "@/lib/claude-md";
import { getRequiredUser } from "@/lib/auth/get-user";

interface ImportRepoItem {
  name: string;
  githubUrl: string;
}

export async function POST(request: NextRequest) {
  await getRequiredUser();
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "GitHub App not configured" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { installationId, repos } = body as {
    installationId: number;
    repos: ImportRepoItem[];
  };

  if (!installationId || !repos?.length) {
    return NextResponse.json(
      { error: "installationId and repos are required" },
      { status: 400 }
    );
  }

  let token: string;
  try {
    token = await getInstallationToken(installationId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get token" },
      { status: 500 }
    );
  }

  const db = getDb();
  const results: { name: string; id: string; status: string }[] = [];

  for (const repo of repos) {
    const repoId = uuidv4();
    const repoName = repo.name || extractRepoName(repo.githubUrl);
    const localPath = getRepoLocalPath(repo.githubUrl);

    db.insert(schema.repos)
      .values({
        id: repoId,
        name: repoName,
        githubUrl: repo.githubUrl,
        localPath,
        status: "cloning",
        installationId: installationId,
      })
      .run();

    // Clone in background with auth token
    cloneRepo(repo.githubUrl, localPath, { authToken: token })
      .then(async () => {
        db.update(schema.repos)
          .set({ status: "ready", lastSyncedAt: new Date().toISOString() })
          .where(eq(schema.repos.id, repoId))
          .run();

        // Generate .generated-claude.md if repo has no description file
        const source = getRepoDescriptionSource(localPath);
        if (!source) {
          await generateRepoClaudeMd(localPath, repoName).catch((err) =>
            console.error("[github-import] Failed to generate repo CLAUDE.md:", err)
          );
        }

        // Compute and store hash
        const hash = computeClaudeMdHash(localPath);
        db.update(schema.repos)
          .set({ claudeMdHash: hash })
          .where(eq(schema.repos.id, repoId))
          .run();

        // Update master index
        const allReady = db.select().from(schema.repos).where(eq(schema.repos.status, "ready")).all();
        debouncedGenerateMasterClaudeMd(allReady);
      })
      .catch((error) => {
        db.update(schema.repos)
          .set({
            status: "error",
            errorMessage: error instanceof Error ? error.message : "Clone failed",
          })
          .where(eq(schema.repos.id, repoId))
          .run();
      });

    results.push({ name: repoName, id: repoId, status: "cloning" });
  }

  return NextResponse.json({ imported: results }, { status: 201 });
}

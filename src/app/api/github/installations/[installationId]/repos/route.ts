import { NextRequest, NextResponse } from "next/server";
import { isConfigured, listInstallationRepos } from "@/lib/github/api";
import { getDb, schema } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "GitHub App not configured" },
      { status: 400 }
    );
  }

  const { installationId } = await params;
  const id = parseInt(installationId, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Invalid installation ID" },
      { status: 400 }
    );
  }

  try {
    const repos = await listInstallationRepos(id);

    // Mark already-imported repos
    const db = getDb();
    const existingRepos = db.select().from(schema.repos).all();
    const importedUrls = new Set(existingRepos.map((r) => r.githubUrl));

    const result = repos.map((repo) => ({
      ...repo,
      imported: importedUrls.has(repo.clone_url) ||
        importedUrls.has(`https://github.com/${repo.full_name}`) ||
        importedUrls.has(`https://github.com/${repo.full_name}.git`),
    }));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list repos" },
      { status: 500 }
    );
  }
}

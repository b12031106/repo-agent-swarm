import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { scanRepo, type ScanResult } from "@/lib/agents/repo-scanner";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import type { AgentStreamEvent } from "@/types";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

/** POST /api/repos/[repoId]/scan - Trigger auto-scan for service metadata */
export async function POST(
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
    return new Response(JSON.stringify({ error: "Repo not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (repo.status !== "ready") {
    return new Response(JSON.stringify({ error: "Repo is not ready" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const repoName = repo.name;
  const repoPath = repo.localPath;

  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    const gen = scanRepo(repoName, repoPath);
    let scanResult: ScanResult | null = null;

    // Manually iterate the generator to capture the return value
    let iterResult = await gen.next();
    while (!iterResult.done) {
      yield iterResult.value;
      iterResult = await gen.next();
    }
    // iterResult.value is the return value of the generator
    scanResult = iterResult.value ?? null;

    if (scanResult) {
      // Save scan results to DB
      db.update(schema.repos)
        .set({
          description: scanResult.description || null,
          domain: scanResult.domain || null,
          serviceType: scanResult.serviceType || null,
          techStack: scanResult.techStack || null,
          exposedApisJson: JSON.stringify(scanResult.exposedApis || []),
          dependenciesJson: JSON.stringify(
            (scanResult.dependencies || []).map((d) => ({ name: d }))
          ),
          profileStatus: "draft",
        })
        .where(eq(schema.repos.id, repoId))
        .run();

      yield {
        type: "done",
        content: JSON.stringify(scanResult),
      };
    } else {
      yield {
        type: "error",
        error: "Failed to parse scan results",
      };
    }
  }

  const stream = createSSEStream(streamWithPersistence());

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

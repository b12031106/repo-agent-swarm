import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { scanRepoWithDoc, type ScanResult } from "@/lib/agents/repo-scanner";
import { createSSEStream } from "@/lib/streaming/sse-encoder";
import { getUploadedFile } from "@/lib/uploads";
import fs from "fs";
import type { AgentStreamEvent } from "@/types";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

/** POST /api/repos/[repoId]/scan-with-doc - Scan with document assistance */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const { repoId } = await params;
  const body = await request.json();
  const { attachmentId, documentText } = body;

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

  // Get document content from attachment or direct text
  let docContent = documentText || "";
  if (attachmentId && !docContent) {
    const uploaded = getUploadedFile(attachmentId);
    if (uploaded && uploaded.category === "text") {
      try {
        docContent = fs.readFileSync(uploaded.serverPath, "utf-8").slice(0, 50000);
      } catch { /* ignore */ }
    }
  }

  if (!docContent) {
    return new Response(
      JSON.stringify({ error: "No document content provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const repoName = repo.name;
  const repoPath = repo.localPath;

  async function* streamWithPersistence(): AsyncGenerator<AgentStreamEvent> {
    const gen = scanRepoWithDoc(repoName, repoPath, docContent);
    let scanResult: ScanResult | null = null;

    let iterResult = await gen.next();
    while (!iterResult.done) {
      yield iterResult.value;
      iterResult = await gen.next();
    }
    scanResult = iterResult.value ?? null;

    if (scanResult) {
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

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

/** GET /api/chat/[repoId]/history - Get conversation history */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;
  const db = getDb();

  const conversations = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.repoId, repoId))
    .orderBy(desc(schema.conversations.updatedAt))
    .all();

  return NextResponse.json(conversations);
}

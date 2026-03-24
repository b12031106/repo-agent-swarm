import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc, and } from "drizzle-orm";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

/** GET /api/chat/[repoId]/history - Get conversation history */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;
  const { repoId } = await params;
  const db = getDb();

  const conversations = db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.repoId, repoId), eq(schema.conversations.userId, user.id)))
    .orderBy(desc(schema.conversations.updatedAt))
    .all();

  return NextResponse.json(conversations);
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc, and } from "drizzle-orm";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

/** GET /api/conversations - List all conversations */
export async function GET(request: NextRequest) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;
  const searchParams = request.nextUrl.searchParams;
  const repoId = searchParams.get("repoId");
  const type = searchParams.get("type");

  const db = getDb();

  const baseQuery = db
    .select({
      id: schema.conversations.id,
      repoId: schema.conversations.repoId,
      sessionId: schema.conversations.sessionId,
      title: schema.conversations.title,
      isOrchestrator: schema.conversations.isOrchestrator,
      model: schema.conversations.model,
      type: schema.conversations.type,
      userId: schema.conversations.userId,
      createdAt: schema.conversations.createdAt,
      updatedAt: schema.conversations.updatedAt,
      repoName: schema.repos.name,
    })
    .from(schema.conversations)
    .leftJoin(schema.repos, eq(schema.conversations.repoId, schema.repos.id));

  let conversations;

  if (repoId) {
    conversations = baseQuery
      .where(and(eq(schema.conversations.repoId, repoId), eq(schema.conversations.userId, user.id)))
      .orderBy(desc(schema.conversations.updatedAt))
      .all();
  } else if (type) {
    conversations = baseQuery
      .where(and(eq(schema.conversations.type, type as "chat" | "analysis"), eq(schema.conversations.userId, user.id)))
      .orderBy(desc(schema.conversations.updatedAt))
      .all();
  } else {
    conversations = baseQuery
      .where(eq(schema.conversations.userId, user.id))
      .orderBy(desc(schema.conversations.updatedAt))
      .all();
  }

  return NextResponse.json(conversations);
}

/** GET /api/conversations/[id]/messages */
export async function POST(request: NextRequest) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;
  const body = await request.json();
  const { conversationId } = body;

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify conversation belongs to this user
  const conv = db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, user.id)))
    .get();

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const msgs = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .all();

  return NextResponse.json(msgs);
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

/** GET /api/conversations - List all conversations */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const repoId = searchParams.get("repoId");

  const db = getDb();

  let query = db.select().from(schema.conversations);

  const conversations = repoId
    ? query.where(eq(schema.conversations.repoId, repoId)).orderBy(desc(schema.conversations.updatedAt)).all()
    : query.orderBy(desc(schema.conversations.updatedAt)).all();

  return NextResponse.json(conversations);
}

/** GET /api/conversations/[id]/messages */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { conversationId } = body;

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  const msgs = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .all();

  return NextResponse.json(msgs);
}

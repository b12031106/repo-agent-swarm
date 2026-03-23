import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { getRequiredUser } from "@/lib/auth/get-user";

// POST: Create a share link
export async function POST(request: NextRequest) {
  const user = await getRequiredUser();
  const body = await request.json();
  const { conversationId, messageIds, title, expiresInDays } = body as {
    conversationId: string;
    messageIds?: string[];
    title?: string;
    expiresInDays?: number;
  };

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify conversation belongs to user
  const conversation = db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.userId, user.id)
      )
    )
    .get();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Validate messageIds if provided
  if (messageIds && messageIds.length > 0) {
    const messages = db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .all();
    const validIds = new Set(messages.map((m) => m.id));
    const invalid = messageIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Invalid message IDs", invalidIds: invalid },
        { status: 400 }
      );
    }
  }

  const token = crypto.randomBytes(16).toString("base64url");
  const id = uuid();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;

  db.insert(schema.shares)
    .values({
      id,
      token,
      conversationId,
      userId: user.id,
      messageIds: messageIds ? JSON.stringify(messageIds) : null,
      title: title || conversation.title,
      expiresAt,
    })
    .run();

  const share = db
    .select()
    .from(schema.shares)
    .where(eq(schema.shares.id, id))
    .get();

  return NextResponse.json(share, { status: 201 });
}

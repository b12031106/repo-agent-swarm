import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getRequiredUser } from "@/lib/auth/get-user";

// GET: Read shared conversation (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = getDb();

  const share = db
    .select()
    .from(schema.shares)
    .where(eq(schema.shares.token, token))
    .get();

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  // Check expiration
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share has expired" }, { status: 404 });
  }

  // Increment view count
  db.update(schema.shares)
    .set({ viewCount: sql`${schema.shares.viewCount} + 1` })
    .where(eq(schema.shares.id, share.id))
    .run();

  // Get conversation info
  const conversation = db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      model: schema.conversations.model,
      type: schema.conversations.type,
      createdAt: schema.conversations.createdAt,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, share.conversationId))
    .get();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation no longer exists" },
      { status: 404 }
    );
  }

  // Get messages - filter by messageIds if specified, only show user/assistant messages
  let messages;
  const parsedMessageIds: string[] | null = share.messageIds
    ? JSON.parse(share.messageIds)
    : null;

  if (parsedMessageIds && parsedMessageIds.length > 0) {
    messages = db
      .select({
        id: schema.messages.id,
        role: schema.messages.role,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, share.conversationId),
          inArray(schema.messages.id, parsedMessageIds)
        )
      )
      .all();
  } else {
    messages = db
      .select({
        id: schema.messages.id,
        role: schema.messages.role,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, share.conversationId))
      .all();
  }

  // Filter out tool messages for security (may contain repo paths)
  const safeMessages = messages.filter((m) => m.role !== "tool");

  // Get sharer info
  const sharer = db
    .select({ name: schema.users.name, image: schema.users.image })
    .from(schema.users)
    .where(eq(schema.users.id, share.userId))
    .get();

  return NextResponse.json({
    share: {
      title: share.title,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    },
    conversation: {
      ...conversation,
      messages: safeMessages,
    },
    sharer: sharer || null,
  });
}

// DELETE: Revoke share (requires auth, must be owner)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await getRequiredUser();
  const { token } = await params;
  const db = getDb();

  const share = db
    .select()
    .from(schema.shares)
    .where(
      and(eq(schema.shares.token, token), eq(schema.shares.userId, user.id))
    )
    .get();

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  db.delete(schema.shares).where(eq(schema.shares.id, share.id)).run();

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getRequiredUser } from "@/lib/auth/get-user";

/** DELETE /api/conversations/[conversationId] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getRequiredUser();
  const { conversationId } = await params;
  const db = getDb();

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

  // Delete messages and usage records first (cascade should handle it,
  // but explicit delete is safer with SQLite)
  db.delete(schema.usageRecords)
    .where(eq(schema.usageRecords.conversationId, conversationId))
    .run();

  db.delete(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .run();

  db.delete(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .run();

  return NextResponse.json({ ok: true });
}

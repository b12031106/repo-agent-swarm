import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

// GET: List shares for a conversation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;
  const { conversationId } = await params;
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

  const shares = db
    .select()
    .from(schema.shares)
    .where(eq(schema.shares.conversationId, conversationId))
    .all();

  return NextResponse.json(shares);
}

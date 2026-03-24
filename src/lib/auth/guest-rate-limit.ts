import { getDb, schema } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { GUEST_QUERY_LIMIT } from "./guest";

/**
 * 檢查訪客是否已達查詢上限
 * 計算該 guestId 發送的 user 訊息總數
 * @returns null 如果未超過上限，否則返回 Response（429）
 */
export function checkGuestRateLimit(userId: string): Response | null {
  const db = getDb();

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      eq(schema.messages.conversationId, schema.conversations.id)
    )
    .where(
      and(
        eq(schema.conversations.userId, userId),
        eq(schema.messages.role, "user")
      )
    )
    .get();

  const count = result?.count ?? 0;

  if (count >= GUEST_QUERY_LIMIT) {
    return new Response(
      JSON.stringify({
        error: `訪客查詢次數已達上限（${GUEST_QUERY_LIMIT} 則），請登入以繼續使用`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  return null;
}

import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { sql, eq } from "drizzle-orm";
import { getRequiredUser } from "@/lib/auth/get-user";

/** GET /api/usage - Get aggregated usage stats */
export async function GET() {
  const user = await getRequiredUser();
  const db = getDb();

  const stats = db
    .select({
      totalInputTokens: sql<number>`SUM(${schema.usageRecords.inputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.usageRecords.outputTokens})`,
      totalCostUsd: sql<number>`SUM(${schema.usageRecords.totalCostUsd})`,
      totalQueries: sql<number>`COUNT(*)`,
    })
    .from(schema.usageRecords)
    .where(eq(schema.usageRecords.userId, user.id))
    .get();

  const recentUsage = db
    .select()
    .from(schema.usageRecords)
    .where(eq(schema.usageRecords.userId, user.id))
    .orderBy(sql`${schema.usageRecords.createdAt} DESC`)
    .limit(50)
    .all();

  return NextResponse.json({
    summary: {
      totalInputTokens: stats?.totalInputTokens || 0,
      totalOutputTokens: stats?.totalOutputTokens || 0,
      totalCostUsd: stats?.totalCostUsd || 0,
      totalQueries: stats?.totalQueries || 0,
    },
    recent: recentUsage,
  });
}

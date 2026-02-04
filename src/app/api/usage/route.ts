import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

/** GET /api/usage - Get aggregated usage stats */
export async function GET() {
  const db = getDb();

  const stats = db
    .select({
      totalInputTokens: sql<number>`SUM(${schema.usageRecords.inputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.usageRecords.outputTokens})`,
      totalCostUsd: sql<number>`SUM(${schema.usageRecords.totalCostUsd})`,
      totalQueries: sql<number>`COUNT(*)`,
    })
    .from(schema.usageRecords)
    .get();

  const recentUsage = db
    .select()
    .from(schema.usageRecords)
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

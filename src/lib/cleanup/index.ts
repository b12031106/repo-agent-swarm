import { getDb, schema } from "@/lib/db";
import { sql, lt, and, isNotNull } from "drizzle-orm";
import { getActiveStreamIds } from "@/lib/streaming/active-streams";
import { cleanupExpiredUploads } from "@/lib/uploads";

export interface CleanupOptions {
  conversationMaxAgeDays?: number;
  usageMaxAgeDays?: number;
  vacuum?: boolean;
}

export interface CleanupResult {
  expiredConversations: number;
  expiredCache: number;
  expiredAuthSessions: number;
  expiredShares: number;
  expiredUsageRecords: number;
  vacuumed: boolean;
  uploadsCleaned: boolean;
}

export function runCleanup(options?: CleanupOptions): CleanupResult {
  const db = getDb();
  const convMaxAge = options?.conversationMaxAgeDays ?? 90;
  const usageMaxAge = options?.usageMaxAgeDays ?? 180;
  const shouldVacuum = options?.vacuum ?? false;
  const now = new Date();

  const result: CleanupResult = {
    expiredConversations: 0,
    expiredCache: 0,
    expiredAuthSessions: 0,
    expiredShares: 0,
    expiredUsageRecords: 0,
    vacuumed: false,
    uploadsCleaned: false,
  };

  // 1. Clean expired cache entries
  const cacheDeleted = db
    .delete(schema.cache)
    .where(lt(schema.cache.expiresAt, Math.floor(Date.now() / 1000)))
    .run();
  result.expiredCache = cacheDeleted.changes;

  // 2. Clean expired auth sessions
  const sessionsDeleted = db
    .delete(schema.authSessions)
    .where(lt(schema.authSessions.expires, now.toISOString()))
    .run();
  result.expiredAuthSessions = sessionsDeleted.changes;

  // 3. Clean expired shares (30 days after expiration)
  const shareGracePeriod = new Date(
    now.getTime() - 30 * 86400000
  ).toISOString();
  const sharesDeleted = db
    .delete(schema.shares)
    .where(
      and(
        isNotNull(schema.shares.expiresAt),
        lt(schema.shares.expiresAt, shareGracePeriod)
      )
    )
    .run();
  result.expiredShares = sharesDeleted.changes;

  // 4. Clean expired conversations (excluding active streams)
  const convCutoff = new Date(
    now.getTime() - convMaxAge * 86400000
  ).toISOString();
  const activeIds = getActiveStreamIds();

  const candidates = db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(lt(schema.conversations.updatedAt, convCutoff))
    .all();

  const toDelete = candidates.filter((c) => !activeIds.has(c.id));

  for (const conv of toDelete) {
    db.delete(schema.conversations)
      .where(sql`${schema.conversations.id} = ${conv.id}`)
      .run();
  }
  result.expiredConversations = toDelete.length;

  // 5. Clean orphan usage records (older than usageMaxAge)
  const usageCutoff = new Date(
    now.getTime() - usageMaxAge * 86400000
  ).toISOString();
  const usageDeleted = db
    .delete(schema.usageRecords)
    .where(lt(schema.usageRecords.createdAt, usageCutoff))
    .run();
  result.expiredUsageRecords = usageDeleted.changes;

  // 6. Clean expired uploads
  cleanupExpiredUploads();
  result.uploadsCleaned = true;

  // 7. SQLite incremental vacuum (lightweight)
  if (shouldVacuum) {
    try {
      db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
      db.run(sql`PRAGMA incremental_vacuum(100)`);
      result.vacuumed = true;
    } catch (err) {
      console.error("[cleanup] VACUUM failed:", err);
    }
  }

  return result;
}

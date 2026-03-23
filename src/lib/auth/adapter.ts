/**
 * Custom NextAuth adapter for better-sqlite3 (synchronous driver).
 * The official @auth/drizzle-adapter expects async drivers, so we implement our own.
 */
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession } from "next-auth/adapters";

function toAdapterUser(row: typeof schema.users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified ? new Date(Number(row.emailVerified) * 1000) : null,
    image: row.image,
  };
}

export const sqliteAdapter: Adapter = {
  createUser(data) {
    const db = getDb();
    const id = uuid();
    db.insert(schema.users)
      .values({
        id,
        name: data.name ?? null,
        email: data.email,
        emailVerified: data.emailVerified
          ? Math.floor(data.emailVerified.getTime() / 1000)
          : null,
        image: data.image ?? null,
      })
      .run();
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();
    return toAdapterUser(user!);
  },

  getUser(id) {
    const db = getDb();
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();
    return user ? toAdapterUser(user) : null;
  },

  getUserByEmail(email) {
    const db = getDb();
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();
    return user ? toAdapterUser(user) : null;
  },

  getUserByAccount({ provider, providerAccountId }) {
    const db = getDb();
    const account = db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, provider),
          eq(schema.accounts.providerAccountId, providerAccountId)
        )
      )
      .get();
    if (!account) return null;
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, account.userId))
      .get();
    return user ? toAdapterUser(user) : null;
  },

  updateUser(data) {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.email !== undefined) updates.email = data.email;
    if (data.image !== undefined) updates.image = data.image;
    if (data.emailVerified !== undefined) {
      updates.emailVerified = data.emailVerified
        ? Math.floor(data.emailVerified.getTime() / 1000)
        : null;
    }

    if (Object.keys(updates).length > 0) {
      db.update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, data.id!))
        .run();
    }

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.id!))
      .get();
    return toAdapterUser(user!);
  },

  deleteUser(id) {
    const db = getDb();
    db.delete(schema.users).where(eq(schema.users.id, id)).run();
    return null;
  },

  linkAccount(data) {
    const db = getDb();
    const id = uuid();
    db.insert(schema.accounts)
      .values({
        id,
        userId: data.userId,
        type: data.type,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        refreshToken: (data as AdapterAccount & { refresh_token?: string }).refresh_token ?? null,
        accessToken: (data as AdapterAccount & { access_token?: string }).access_token ?? null,
        expiresAt: (data as AdapterAccount & { expires_at?: number }).expires_at ?? null,
        tokenType: (data as AdapterAccount & { token_type?: string }).token_type ?? null,
        scope: data.scope ?? null,
        idToken: (data as AdapterAccount & { id_token?: string }).id_token ?? null,
      })
      .run();
    return data;
  },

  unlinkAccount({ provider, providerAccountId }) {
    const db = getDb();
    db.delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, provider),
          eq(schema.accounts.providerAccountId, providerAccountId)
        )
      )
      .run();
    return undefined;
  },

  createSession(data) {
    const db = getDb();
    const id = uuid();
    db.insert(schema.authSessions)
      .values({
        id,
        sessionToken: data.sessionToken,
        userId: data.userId,
        expires: data.expires.toISOString(),
      })
      .run();
    return {
      sessionToken: data.sessionToken,
      userId: data.userId,
      expires: data.expires,
    };
  },

  getSessionAndUser(sessionToken) {
    const db = getDb();
    const session = db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.sessionToken, sessionToken))
      .get();
    if (!session) return null;

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .get();
    if (!user) return null;

    return {
      session: {
        sessionToken: session.sessionToken,
        userId: session.userId,
        expires: new Date(session.expires),
      } as AdapterSession,
      user: toAdapterUser(user),
    };
  },

  updateSession(data) {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    if (data.expires) updates.expires = data.expires.toISOString();
    if (data.userId) updates.userId = data.userId;

    if (Object.keys(updates).length > 0) {
      db.update(schema.authSessions)
        .set(updates)
        .where(eq(schema.authSessions.sessionToken, data.sessionToken))
        .run();
    }

    const session = db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.sessionToken, data.sessionToken))
      .get();
    if (!session) return null;

    return {
      sessionToken: session.sessionToken,
      userId: session.userId,
      expires: new Date(session.expires),
    } as AdapterSession;
  },

  deleteSession(sessionToken) {
    const db = getDb();
    db.delete(schema.authSessions)
      .where(eq(schema.authSessions.sessionToken, sessionToken))
      .run();
    return null;
  },
};

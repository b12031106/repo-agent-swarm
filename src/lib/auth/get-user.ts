import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "./guest";
import { verifyGuestCookie } from "./guest-session";

export type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  isGuest: boolean;
};

/**
 * Type guard: 檢查 auth 結果是否為錯誤 Response
 */
export function isAuthError(result: User | Response): result is Response {
  return result instanceof Response;
}

/**
 * Get the authenticated user from the current request.
 * Returns the user object or null if not authenticated.
 */
export async function getUser() {
  const session = await auth();
  return session?.user
    ? ({
        ...session.user,
        isGuest: false,
      } as User)
    : null;
}

/**
 * Get the guest user from the signed guest-session cookie.
 * Verifies HMAC signature before accepting.
 */
export async function getGuestUser() {
  try {
    const cookieStore = await cookies();
    const signedCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;
    if (!signedCookie) return null;

    const guestId = verifyGuestCookie(signedCookie);
    if (!guestId) return null;

    return { id: guestId, isGuest: true } as User;
  } catch {
    return null;
  }
}

/**
 * 當已登入使用者仍有 guest cookie 時，遷移訪客對話到真實帳號
 */
async function migrateGuestConversations(realUserId: string) {
  try {
    const cookieStore = await cookies();
    const signedCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;
    if (!signedCookie) return;

    const guestId = verifyGuestCookie(signedCookie);
    if (!guestId) return;

    const { getDb, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    db.update(schema.conversations)
      .set({ userId: realUserId })
      .where(eq(schema.conversations.userId, guestId))
      .run();

    db.update(schema.usageRecords)
      .set({ userId: realUserId })
      .where(eq(schema.usageRecords.userId, guestId))
      .run();

    cookieStore.delete(GUEST_COOKIE_NAME);
  } catch {
    // 遷移失敗不阻擋主流程
  }
}

/**
 * Get the authenticated user (OAuth or guest).
 * Returns User on success, or Response (401) on failure.
 * Callers must check with `isAuthError()` before using the result.
 */
export async function getRequiredUser(): Promise<User | Response> {
  const user = await getUser();
  if (user?.id) {
    await migrateGuestConversations(user.id);
    return user;
  }

  const guest = await getGuestUser();
  if (guest) return guest;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Get a real (non-guest) authenticated user.
 * Returns User on success, or Response (401/403) on failure.
 */
export async function getRequiredAuthUser(): Promise<User | Response> {
  const result = await getRequiredUser();
  if (isAuthError(result)) return result;

  if (result.isGuest) {
    return NextResponse.json(
      { error: "此功能需要登入帳號" },
      { status: 403 }
    );
  }
  return result;
}

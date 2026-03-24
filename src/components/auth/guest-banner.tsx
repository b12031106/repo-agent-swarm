import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { GUEST_COOKIE_NAME, isValidSignedGuestCookie, GUEST_QUERY_LIMIT } from '@/lib/auth/guest';
import Link from 'next/link';

/**
 * Guest Banner - Server Component
 * 只在訪客模式下渲染，已登入使用者不顯示
 */
export async function GuestBanner() {
  // 先檢查是否已有 OAuth session（已登入使用者不顯示 banner）
  const session = await auth();
  if (session?.user) return null;

  // 再檢查是否有 guest cookie
  const cookieStore = await cookies();
  const guestCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (!guestCookie || !isValidSignedGuestCookie(guestCookie)) {
    return null;
  }

  return (
    <div className="w-full border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span>
            訪客模式：對話將在 24 小時後自動刪除，最多可發送 {GUEST_QUERY_LIMIT} 則訊息。
            回訪時對話可能已被清除。
          </span>
        </span>
        <Link
          href="/login"
          className="whitespace-nowrap rounded px-3 py-1 font-medium text-amber-700 hover:bg-amber-100 transition-colors dark:text-amber-200 dark:hover:bg-amber-900"
        >
          登入以永久保存
        </Link>
      </div>
    </div>
  );
}

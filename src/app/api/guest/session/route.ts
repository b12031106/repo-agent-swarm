import { NextRequest, NextResponse } from 'next/server';
import { GUEST_COOKIE_NAME, GUEST_COOKIE_MAX_AGE } from '@/lib/auth/guest';
import { createSignedGuestCookie, signGuestCookie, verifyGuestCookie } from '@/lib/auth/guest-session';

/**
 * POST /api/guest/session
 * 建立或更新訪客 session cookie（HMAC 簽名）
 * 如果已有有效的 guest-session cookie，則刷新有效期
 * 否則建立新的訪客 ID
 */
export async function POST(request: NextRequest) {
  try {
    const existingCookie = request.cookies.get(GUEST_COOKIE_NAME)?.value;

    let guestId: string;
    let signedValue: string;

    // 驗證既有 cookie 的簽名
    if (existingCookie) {
      const verified = verifyGuestCookie(existingCookie);
      if (verified) {
        guestId = verified;
        signedValue = signGuestCookie(guestId);
      } else {
        // 簽名無效，建立新的
        const created = createSignedGuestCookie();
        guestId = created.guestId;
        signedValue = created.signedValue;
      }
    } else {
      const created = createSignedGuestCookie();
      guestId = created.guestId;
      signedValue = created.signedValue;
    }

    const response = NextResponse.json({ guestId });

    response.cookies.set({
      name: GUEST_COOKIE_NAME,
      value: signedValue,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: GUEST_COOKIE_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Failed to create guest session:', error);
    return NextResponse.json(
      { error: 'Failed to create guest session' },
      { status: 500 }
    );
  }
}

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import { GUEST_COOKIE_NAME, isValidSignedGuestCookie } from "@/lib/auth/guest";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow auth routes, share pages, login, guest API, and static assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/share/") ||
    pathname.startsWith("/api/guest/") ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for guest session cookie (format check only; HMAC verified in API routes)
  const guestCookie = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (guestCookie && isValidSignedGuestCookie(guestCookie)) {
    return NextResponse.next();
  }

  // Unauthenticated requests
  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

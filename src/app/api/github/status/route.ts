import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/github/api";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

export async function GET() {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
  return NextResponse.json({ configured: isConfigured() });
}

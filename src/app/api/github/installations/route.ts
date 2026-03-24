import { NextResponse } from "next/server";
import { isConfigured, listInstallations } from "@/lib/github/api";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

export async function GET() {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "GitHub App not configured" },
      { status: 400 }
    );
  }

  try {
    const installations = await listInstallations();
    return NextResponse.json(installations);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list installations" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { isConfigured, listInstallations } from "@/lib/github/api";
import { getRequiredUser } from "@/lib/auth/get-user";

export async function GET() {
  await getRequiredUser();
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

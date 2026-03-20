import { NextResponse } from "next/server";
import { isConfigured, listInstallations } from "@/lib/github/api";

export async function GET() {
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

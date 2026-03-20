import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/github/api";

export async function GET() {
  return NextResponse.json({ configured: isConfigured() });
}

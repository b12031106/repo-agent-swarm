import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/github/api";
import { getRequiredUser } from "@/lib/auth/get-user";

export async function GET() {
  await getRequiredUser();
  return NextResponse.json({ configured: isConfigured() });
}

import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/cleanup";
import { getRequiredUser } from "@/lib/auth/get-user";

export async function POST(request: NextRequest) {
  await getRequiredUser();

  const body = await request.json().catch(() => ({}));
  const result = runCleanup({
    conversationMaxAgeDays: body.conversationMaxAgeDays,
    usageMaxAgeDays: body.usageMaxAgeDays,
    vacuum: body.vacuum ?? true,
  });

  return NextResponse.json(result);
}

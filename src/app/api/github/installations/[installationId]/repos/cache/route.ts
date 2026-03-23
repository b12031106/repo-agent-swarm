import { NextRequest, NextResponse } from "next/server";
import { invalidateRepoCache } from "@/lib/github/api";
import { getRequiredUser } from "@/lib/auth/get-user";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  await getRequiredUser();
  const { installationId } = await params;
  const id = parseInt(installationId, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Invalid installation ID" },
      { status: 400 }
    );
  }

  invalidateRepoCache(id);
  return NextResponse.json({ ok: true });
}

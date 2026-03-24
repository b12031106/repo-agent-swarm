import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getRequiredUser, getRequiredAuthUser, isAuthError } from "@/lib/auth/get-user";

/** GET /api/settings?key=xxx - Read a setting */
export async function GET(request: NextRequest) {
  const _authCheck = await getRequiredUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json(
      { error: "key query parameter is required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const setting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();

  if (!setting) {
    return NextResponse.json(null);
  }

  return NextResponse.json(setting);
}

/** PUT /api/settings - Upsert a setting (requires real account) */
export async function PUT(request: NextRequest) {
  const _authCheck = await getRequiredAuthUser();
  if (isAuthError(_authCheck)) return _authCheck;
  const body = await request.json();
  const { key, value } = body;

  if (!key) {
    return NextResponse.json(
      { error: "key is required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();

  if (existing) {
    db.update(schema.settings)
      .set({ value: value ?? "", updatedAt: now })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key, value: value ?? "", updatedAt: now })
      .run();
  }

  const updated = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();

  return NextResponse.json(updated);
}

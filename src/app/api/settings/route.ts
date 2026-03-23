import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getRequiredUser } from "@/lib/auth/get-user";

/** GET /api/settings?key=xxx - Read a setting */
export async function GET(request: NextRequest) {
  await getRequiredUser();
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

/** PUT /api/settings - Upsert a setting */
export async function PUT(request: NextRequest) {
  await getRequiredUser();
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

import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, or, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

const MAX_CUSTOM_STYLES = 10;
const PROMPT_TEXT_MAX_LENGTH = 500;

/** GET /api/output-styles - List system presets + current user's custom styles */
export async function GET() {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;

  const db = getDb();
  const styles = db
    .select()
    .from(schema.outputStyles)
    .where(or(isNull(schema.outputStyles.userId), eq(schema.outputStyles.userId, user.id)))
    .all();

  // Sort: system presets first, then user customs by creation date
  styles.sort((a, b) => {
    if (!a.userId && b.userId) return -1;
    if (a.userId && !b.userId) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return Response.json(styles);
}

/** POST /api/output-styles - Create a custom style */
export async function POST(request: NextRequest) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;

  if (user.isGuest) {
    return Response.json({ error: "訪客無法建立自訂風格" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, promptText } = body;

  if (!name?.trim()) {
    return Response.json({ error: "名稱為必填" }, { status: 400 });
  }

  if (promptText && promptText.length > PROMPT_TEXT_MAX_LENGTH) {
    return Response.json({ error: `提示文字不可超過 ${PROMPT_TEXT_MAX_LENGTH} 字` }, { status: 400 });
  }

  const db = getDb();

  // Check user's custom style count
  const existing = db
    .select()
    .from(schema.outputStyles)
    .where(eq(schema.outputStyles.userId, user.id))
    .all();

  if (existing.length >= MAX_CUSTOM_STYLES) {
    return Response.json({ error: `最多只能建立 ${MAX_CUSTOM_STYLES} 個自訂風格` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const style = {
    id: uuidv4(),
    userId: user.id,
    name: name.trim(),
    description: description?.trim() || null,
    promptText: promptText?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.outputStyles).values(style).run();

  return Response.json(style, { status: 201 });
}

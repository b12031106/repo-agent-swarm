import { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getRequiredUser, isAuthError } from "@/lib/auth/get-user";

const PROMPT_TEXT_MAX_LENGTH = 500;

/** PUT /api/output-styles/[styleId] - Update a custom style */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ styleId: string }> }
) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;

  const { styleId } = await params;
  const db = getDb();

  const style = db
    .select()
    .from(schema.outputStyles)
    .where(eq(schema.outputStyles.id, styleId))
    .get();

  if (!style) {
    return Response.json({ error: "找不到該風格" }, { status: 404 });
  }

  if (!style.userId) {
    return Response.json({ error: "系統預設風格不可修改" }, { status: 403 });
  }

  if (style.userId !== user.id) {
    return Response.json({ error: "無權限修改此風格" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, promptText } = body;

  if (!name?.trim()) {
    return Response.json({ error: "名稱為必填" }, { status: 400 });
  }

  if (promptText && promptText.length > PROMPT_TEXT_MAX_LENGTH) {
    return Response.json({ error: `提示文字不可超過 ${PROMPT_TEXT_MAX_LENGTH} 字` }, { status: 400 });
  }

  const updated = {
    name: name.trim(),
    description: description?.trim() || null,
    promptText: promptText?.trim() || null,
    updatedAt: new Date().toISOString(),
  };

  db.update(schema.outputStyles)
    .set(updated)
    .where(eq(schema.outputStyles.id, styleId))
    .run();

  return Response.json({ ...style, ...updated });
}

/** DELETE /api/output-styles/[styleId] - Delete a custom style */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ styleId: string }> }
) {
  const user = await getRequiredUser();
  if (isAuthError(user)) return user;

  const { styleId } = await params;
  const db = getDb();

  const style = db
    .select()
    .from(schema.outputStyles)
    .where(eq(schema.outputStyles.id, styleId))
    .get();

  if (!style) {
    return Response.json({ error: "找不到該風格" }, { status: 404 });
  }

  if (!style.userId) {
    return Response.json({ error: "系統預設風格不可刪除" }, { status: 403 });
  }

  if (style.userId !== user.id) {
    return Response.json({ error: "無權限刪除此風格" }, { status: 403 });
  }

  db.delete(schema.outputStyles)
    .where(eq(schema.outputStyles.id, styleId))
    .run();

  return Response.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import {
  validateFile,
  saveUploadedFile,
  cleanupExpiredUploads,
} from "@/lib/uploads";
import type { UploadedAttachment } from "@/types";

/** POST /api/upload - Upload files (multipart/form-data) */
export async function POST(request: NextRequest) {
  try {
    // Cleanup expired uploads in background
    cleanupExpiredUploads();

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "沒有收到任何檔案" },
        { status: 400 }
      );
    }

    const results: UploadedAttachment[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!(file instanceof File) || !file.name) {
        errors.push("無效的檔案");
        continue;
      }

      const validation = validateFile(file.name, file.size);
      if (!validation.valid) {
        errors.push(validation.error!);
        continue;
      }

      const attachment = await saveUploadedFile(file);
      results.push(attachment);
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    return NextResponse.json({
      attachments: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "上傳失敗" },
      { status: 500 }
    );
  }
}

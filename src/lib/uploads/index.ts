import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { AttachmentCategory, UploadedAttachment } from "@/types";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

const ALLOWED_EXTENSIONS: Record<string, AttachmentCategory> = {
  // Image
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  // PDF
  ".pdf": "pdf",
  // Text / Code
  ".ts": "text",
  ".js": "text",
  ".jsx": "text",
  ".tsx": "text",
  ".py": "text",
  ".json": "text",
  ".md": "text",
  ".txt": "text",
  ".csv": "text",
  ".xml": "text",
  ".yaml": "text",
  ".yml": "text",
  ".html": "text",
  ".css": "text",
  ".scss": "text",
  ".sql": "text",
  ".sh": "text",
  ".go": "text",
  ".rs": "text",
  ".java": "text",
  ".c": "text",
  ".cpp": "text",
  ".h": "text",
  ".rb": "text",
  ".php": "text",
  ".swift": "text",
  ".kt": "text",
  ".ipynb": "text",
};

const SIZE_LIMITS: Record<AttachmentCategory, number> = {
  image: 10 * 1024 * 1024, // 10MB
  pdf: 20 * 1024 * 1024, // 20MB
  text: 1 * 1024 * 1024, // 1MB
};

export function getCategoryForExtension(
  ext: string
): AttachmentCategory | null {
  return ALLOWED_EXTENSIONS[ext.toLowerCase()] || null;
}

export function validateFile(
  name: string,
  size: number
): { valid: boolean; error?: string; category?: AttachmentCategory } {
  const ext = path.extname(name).toLowerCase();
  const category = getCategoryForExtension(ext);

  if (!category) {
    return { valid: false, error: `不支援的檔案格式：${ext}` };
  }

  const limit = SIZE_LIMITS[category];
  if (size > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return { valid: false, error: `檔案過大（上限 ${limitMB}MB）：${name}` };
  }

  return { valid: true, category };
}

export async function saveUploadedFile(
  file: File
): Promise<UploadedAttachment> {
  const id = uuidv4();
  const dir = path.join(UPLOADS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(dir, file.name);
  fs.writeFileSync(filePath, buffer);

  const ext = path.extname(file.name).toLowerCase();
  const category = getCategoryForExtension(ext)!;

  const meta: UploadedAttachment = {
    id,
    name: file.name,
    size: file.size,
    category,
    serverPath: filePath,
  };

  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  return meta;
}

export function getUploadedFile(id: string): UploadedAttachment | null {
  const metaPath = path.join(UPLOADS_DIR, id, "meta.json");
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadedAttachment;
  } catch {
    return null;
  }
}

export function cleanupExpiredUploads(maxAgeMs = 24 * 60 * 60 * 1000): void {
  if (!fs.existsSync(UPLOADS_DIR)) return;

  const now = Date.now();
  const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(UPLOADS_DIR, entry.name);
    try {
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Skip if cannot stat
    }
  }
}

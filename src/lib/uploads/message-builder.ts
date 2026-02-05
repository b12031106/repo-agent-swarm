import fs from "fs";
import path from "path";
import { getUploadedFile } from "./index";
import type { UploadedAttachment } from "@/types";

const MAX_INLINE_CHARS = 50_000;

/**
 * Build an enhanced message that includes attachment content/references.
 * - text files: read content and inline as code blocks
 * - image/pdf files: provide absolute path and instruct agent to use Read tool
 */
export function buildMessageWithAttachments(
  message: string,
  attachmentIds?: string[]
): string {
  if (!attachmentIds || attachmentIds.length === 0) return message;

  const attachments = attachmentIds
    .map((id) => getUploadedFile(id))
    .filter((a): a is UploadedAttachment => a !== null);

  if (attachments.length === 0) return message;

  const parts: string[] = [message];

  for (const attachment of attachments) {
    switch (attachment.category) {
      case "text": {
        const content = readTextFile(attachment.serverPath);
        const ext = path.extname(attachment.name).replace(".", "");
        parts.push(
          `\n\n--- 附件：${attachment.name} ---\n\`\`\`${ext}\n${content}\n\`\`\``
        );
        break;
      }
      case "image": {
        parts.push(
          `\n\n--- 附件：${attachment.name}（圖片）---\n` +
            `這是使用者上傳的圖片檔案，存放在：${attachment.serverPath}\n` +
            `請使用 Read 工具查看此檔案以了解圖片內容。`
        );
        break;
      }
      case "pdf": {
        parts.push(
          `\n\n--- 附件：${attachment.name}（PDF）---\n` +
            `這是使用者上傳的 PDF 檔案，存放在：${attachment.serverPath}\n` +
            `請使用 Read 工具查看此檔案以了解 PDF 內容。`
        );
        break;
      }
    }
  }

  return parts.join("");
}

/**
 * Build a short metadata description for attachments (used in orchestrator planning phase).
 */
export function buildAttachmentMetadata(
  attachmentIds?: string[]
): string {
  if (!attachmentIds || attachmentIds.length === 0) return "";

  const attachments = attachmentIds
    .map((id) => getUploadedFile(id))
    .filter((a): a is UploadedAttachment => a !== null);

  if (attachments.length === 0) return "";

  const descriptions = attachments.map(
    (a) => `- ${a.name} (${a.category}, ${formatSize(a.size)})`
  );

  return `\n\n使用者附件：\n${descriptions.join("\n")}`;
}

function readTextFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (content.length > MAX_INLINE_CHARS) {
      return (
        content.slice(0, MAX_INLINE_CHARS) +
        `\n\n... (已截斷，完整檔案共 ${content.length} 字元)`
      );
    }
    return content;
  } catch {
    return "(無法讀取檔案內容)";
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + "KB";
  return bytes + "B";
}

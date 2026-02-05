"use client";

import { X, FileText, Image as ImageIcon, FileIcon, Loader2 } from "lucide-react";
import type { AttachmentCategory } from "@/types";

export interface AttachmentItem {
  id?: string;
  name: string;
  size: number;
  category: AttachmentCategory;
  previewUrl?: string;
  isUploading?: boolean;
}

interface AttachmentPreviewProps {
  attachments: AttachmentItem[];
  onRemove?: (index: number) => void;
  compact?: boolean;
}

export function AttachmentPreview({
  attachments,
  onRemove,
  compact = false,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id || `${attachment.name}-${index}`}
          className={`relative flex items-center gap-2 rounded-lg border bg-muted/50 ${
            compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          {/* Upload spinner overlay */}
          {attachment.isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}

          {/* Thumbnail or icon */}
          {attachment.category === "image" && attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className={`rounded object-cover ${
                compact ? "h-6 w-6" : "h-8 w-8"
              }`}
            />
          ) : (
            <AttachmentIcon category={attachment.category} compact={compact} />
          )}

          {/* File info */}
          <div className="min-w-0">
            <div className="truncate max-w-[120px]" title={attachment.name}>
              {attachment.name}
            </div>
            {!compact && (
              <div className="text-[10px] text-muted-foreground">
                {formatSize(attachment.size)}
              </div>
            )}
          </div>

          {/* Remove button */}
          {onRemove && (
            <button
              onClick={() => onRemove(index)}
              className="ml-1 rounded-full p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="移除附件"
            >
              <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AttachmentIcon({
  category,
  compact,
}: {
  category: AttachmentCategory;
  compact: boolean;
}) {
  const size = compact ? "h-4 w-4" : "h-5 w-5";

  switch (category) {
    case "image":
      return <ImageIcon className={`${size} text-blue-500`} />;
    case "pdf":
      return <FileIcon className={`${size} text-red-500`} />;
    case "text":
      return <FileText className={`${size} text-green-500`} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

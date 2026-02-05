"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Square, ArrowUpDown, Paperclip } from "lucide-react";
import { AttachmentPreview, type AttachmentItem } from "./attachment-preview";
import type { UploadedAttachment, AttachmentCategory } from "@/types";

type EnterMode = "enter-send" | "enter-newline";

// Extension validation (mirrors server-side)
const ALLOWED_EXTENSIONS: Record<string, AttachmentCategory> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
  ".pdf": "pdf",
  ".ts": "text", ".js": "text", ".jsx": "text", ".tsx": "text", ".py": "text",
  ".json": "text", ".md": "text", ".txt": "text", ".csv": "text", ".xml": "text",
  ".yaml": "text", ".yml": "text", ".html": "text", ".css": "text", ".scss": "text",
  ".sql": "text", ".sh": "text", ".go": "text", ".rs": "text", ".java": "text",
  ".c": "text", ".cpp": "text", ".h": "text", ".rb": "text", ".php": "text",
  ".swift": "text", ".kt": "text", ".ipynb": "text",
};

const SIZE_LIMITS: Record<AttachmentCategory, number> = {
  image: 10 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  text: 1 * 1024 * 1024,
};

interface PendingAttachment extends AttachmentItem {
  file?: File;
  uploaded?: UploadedAttachment;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: UploadedAttachment[]) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  modelSelector?: React.ReactNode;
}

export function ChatInput({
  onSend,
  onCancel,
  isLoading,
  placeholder = "輸入你的問題...",
  modelSelector,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [enterMode, setEnterMode] = useState<EnterMode>("enter-send");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("chat-enter-mode");
    if (saved === "enter-send" || saved === "enter-newline") {
      setEnterMode(saved);
    }
  }, []);

  const toggleEnterMode = useCallback(() => {
    setEnterMode((prev) => {
      const next = prev === "enter-send" ? "enter-newline" : "enter-send";
      localStorage.setItem("chat-enter-mode", next);
      return next;
    });
  }, []);

  const canSend =
    (input.trim() || attachments.length > 0) && uploadingCount === 0;

  const handleSubmit = useCallback(() => {
    if (!canSend || isLoading) return;

    const uploadedAttachments = attachments
      .filter((a) => a.uploaded)
      .map((a) => a.uploaded!);

    onSend(input.trim(), uploadedAttachments.length > 0 ? uploadedAttachments : undefined);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, canSend, isLoading, onSend, attachments]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (enterMode === "enter-send") {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    } else {
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  };

  // --- File handling ---

  const validateFileClient = (
    file: File
  ): { valid: boolean; error?: string; category?: AttachmentCategory } => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const category = ALLOWED_EXTENSIONS[ext];
    if (!category) {
      return { valid: false, error: `不支援的格式：${ext}` };
    }
    if (file.size > SIZE_LIMITS[category]) {
      const limitMB = Math.round(SIZE_LIMITS[category] / (1024 * 1024));
      return { valid: false, error: `${file.name} 超過 ${limitMB}MB 上限` };
    }
    return { valid: true, category };
  };

  const generateThumbnail = (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 128;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            h = (h / w) * maxSize;
            w = maxSize;
          } else {
            w = (w / h) * maxSize;
            h = maxSize;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => resolve(undefined);
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles: { file: File; category: AttachmentCategory }[] = [];
      const errors: string[] = [];

      for (const file of fileArray) {
        const result = validateFileClient(file);
        if (result.valid) {
          validFiles.push({ file, category: result.category! });
        } else {
          errors.push(result.error!);
        }
      }

      if (errors.length > 0) {
        console.warn("Upload validation errors:", errors);
      }

      if (validFiles.length === 0) return;

      // Create pending items
      const pending: PendingAttachment[] = [];
      for (const { file, category } of validFiles) {
        const previewUrl = await generateThumbnail(file);
        pending.push({
          name: file.name,
          size: file.size,
          category,
          file,
          isUploading: true,
          previewUrl,
        });
      }

      setAttachments((prev) => [...prev, ...pending]);
      setUploadingCount((c) => c + validFiles.length);

      // Upload to server
      const formData = new FormData();
      for (const { file } of validFiles) {
        formData.append("files", file);
      }

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "上傳失敗" }));
          throw new Error(err.error);
        }

        const data: { attachments: UploadedAttachment[] } = await res.json();

        // Update pending attachments with uploaded data
        setAttachments((prev) =>
          prev.map((a) => {
            if (!a.isUploading || !a.file) return a;
            const match = data.attachments.find(
              (u) => u.name === a.file!.name
            );
            if (match) {
              return {
                ...a,
                id: match.id,
                isUploading: false,
                uploaded: match,
              };
            }
            return a;
          })
        );
      } catch (err) {
        console.error("Upload failed:", err);
        // Remove failed uploads
        setAttachments((prev) =>
          prev.filter((a) => !a.isUploading)
        );
      } finally {
        setUploadingCount((c) => c - validFiles.length);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Paste handler for clipboard images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const sendLabel =
    enterMode === "enter-send" ? "Enter" : "Shift + Enter";
  const newlineLabel =
    enterMode === "enter-send" ? "Shift + Enter" : "Enter";

  const acceptExts = Object.keys(ALLOWED_EXTENSIONS).join(",");

  return (
    <div
      className="border-t bg-background relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg pointer-events-none">
          <p className="text-sm font-medium text-primary/70">
            放開以新增附件
          </p>
        </div>
      )}

      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3">
          <AttachmentPreview
            attachments={attachments}
            onRemove={handleRemoveAttachment}
          />
        </div>
      )}

      <div className="flex items-end gap-2 p-4">
        {/* Attachment button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="新增附件"
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptExts}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          disabled={isLoading}
        />
        {isLoading ? (
          <Button
            variant="destructive"
            size="icon"
            onClick={onCancel}
            title="停止回應"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            size="icon"
            disabled={!canSend}
            title={`發送訊息 (${sendLabel})`}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Enter mode hint + model selector */}
      <div className="flex items-center justify-between px-4 pb-2 -mt-1">
        <div className="flex items-center gap-2">
          {modelSelector}
          <button
            onClick={toggleEnterMode}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="切換 Enter 行為"
          >
            <ArrowUpDown className="h-2.5 w-2.5" />
            <span>
              {sendLabel} 送出 / {newlineLabel} 換行
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

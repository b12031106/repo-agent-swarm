"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileSearch, Upload, Loader2, X, FileText } from "lucide-react";
import type { UploadedAttachment } from "@/types";

interface AnalysisInputFormProps {
  onSubmit: (message: string, attachments?: UploadedAttachment[]) => void;
  isLoading?: boolean;
}

export function AnalysisInputForm({ onSubmit, isLoading }: AnalysisInputFormProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "上傳失敗");
      }

      const attachment: UploadedAttachment = await res.json();
      setAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      files.forEach(uploadFile);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(uploadFile);
      e.target.value = "";
    },
    [uploadFile]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit(message.trim(), attachments.length > 0 ? attachments : undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-4">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <FileSearch className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">需求分析</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          上傳 PRD 或輸入需求描述，系統將自動分析跨服務影響並產出結構化報告。
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          拖放 PRD 文件到此處，或
          <label className="mx-1 cursor-pointer text-primary hover:underline">
            選擇檔案
            <input
              type="file"
              className="hidden"
              accept=".md,.txt,.pdf,.json,.yaml,.yml,.csv,.html"
              multiple
              onChange={handleFileSelect}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          支援 Markdown、PDF、純文字等格式
        </p>
        {uploading && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            上傳中...
          </div>
        )}
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[200px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text input */}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="描述你的需求或變更內容。例如：我們需要在商品頁面加入評論功能，包含評分、文字評論和圖片上傳..."
        rows={6}
        disabled={isLoading}
        className="text-sm"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          使用 Opus 模型進行深度分析，最多 3 輪迭代，產出結構化報告。
        </p>
        <Button type="submit" disabled={isLoading || !message.trim()}>
          {isLoading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FileSearch className="mr-1 h-4 w-4" />
          )}
          開始分析
        </Button>
      </div>
    </form>
  );
}

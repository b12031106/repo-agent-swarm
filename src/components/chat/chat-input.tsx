"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Square, ArrowUpDown } from "lucide-react";

type EnterMode = "enter-send" | "enter-newline";

interface ChatInputProps {
  onSend: (message: string) => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (enterMode === "enter-send") {
      // Enter = send, Shift+Enter = newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    } else {
      // Enter = newline, Shift+Enter = send
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

  const sendLabel =
    enterMode === "enter-send" ? "Enter" : "Shift + Enter";
  const newlineLabel =
    enterMode === "enter-send" ? "Shift + Enter" : "Enter";

  return (
    <div className="border-t bg-background">
      <div className="flex items-end gap-2 p-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
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
            disabled={!input.trim()}
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

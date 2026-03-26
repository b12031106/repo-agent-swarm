"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatInput } from "./chat-input";
import { ModelSelector } from "./model-selector";
import { OutputStyleSelector } from "./output-style-selector";
import { MessageBubble } from "./message-bubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { ShareButton } from "./share-button";

interface ChatContainerProps {
  endpoint: string;
  title?: string;
  conversationId?: string;
  onConversationId?: (id: string) => void;
  initialModel?: string;
  initialOutputStyleId?: string | null;
  onMounted?: () => void;
}

export function ChatContainer({
  endpoint,
  title,
  conversationId,
  onConversationId,
  initialModel,
  initialOutputStyleId,
  onMounted,
}: ChatContainerProps) {
  const {
    messages,
    isLoading,
    isLoadingHistory,
    error,
    sendMessage,
    cancel,
    retry,
    model,
    setModel,
    outputStyleId,
    setOutputStyle,
    conversationId: sessionConversationId,
  } = useChat({ endpoint, conversationId, onConversationId, model: initialModel, outputStyleId: initialOutputStyleId });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Notify parent when mounted
  useEffect(() => {
    onMounted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="font-semibold flex-1">{title}</h2>
          {conversationId && (
            <ShareButton
              conversationId={conversationId}
              conversationTitle={title}
            />
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">載入對話紀錄...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">輸入問題開始對話</p>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={retry}
            className="flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            重試
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onCancel={cancel}
        isLoading={isLoading}
        modelSelector={
          <ModelSelector
            value={model}
            onChange={setModel}
            disabled={isLoading}
          />
        }
        outputStyleSelector={
          <OutputStyleSelector
            value={outputStyleId}
            onChange={setOutputStyle}
            disabled={isLoading}
            locked={!!sessionConversationId}
          />
        }
      />
    </div>
  );
}

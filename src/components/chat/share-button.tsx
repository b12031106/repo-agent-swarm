"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { ShareDialog } from "./share-dialog";

interface ShareButtonProps {
  conversationId: string;
  conversationTitle: string;
  messageIds?: string[];
}

export function ShareButton({
  conversationId,
  conversationTitle,
  messageIds,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="分享對話"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span>分享</span>
      </button>

      <ShareDialog
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        messageIds={messageIds}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

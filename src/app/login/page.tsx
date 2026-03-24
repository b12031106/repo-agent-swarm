"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");
  const [isLoadingGuest, setIsLoadingGuest] = useState(false);

  const [guestError, setGuestError] = useState("");

  const handleGuestAccess = async () => {
    setIsLoadingGuest(true);
    setGuestError("");
    try {
      const res = await fetch("/api/guest/session", { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      router.push(callbackUrl);
    } catch (err) {
      console.error("Failed to create guest session:", err);
      setGuestError("建立訪客工作階段失敗，請再試一次。");
      setIsLoadingGuest(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Repo Agent Swarm</h1>
          <p className="text-muted-foreground text-sm">
            多 Repo AI 程式碼分析平台
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error === "AccessDenied"
              ? "此帳號無權限登入，請使用許可的 Email 帳號。"
              : "登入時發生錯誤，請再試一次。"}
          </div>
        )}

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          使用 Google 帳號登入
        </button>

        {guestError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {guestError}
          </div>
        )}

        <button
          onClick={handleGuestAccess}
          disabled={isLoadingGuest}
          className="w-full rounded-md border border-dashed border-muted-foreground px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isLoadingGuest ? "載入中..." : "快速試用（無需登入，24 小時後自動刪除）"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground">載入中...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

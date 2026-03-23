"use client";

import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { LogOut } from "lucide-react";

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
      {session.user.image ? (
        <Image
          src={session.user.image}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
          {session.user.name?.[0] || session.user.email?.[0] || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">
          {session.user.name || session.user.email}
        </p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="p-1 rounded hover:bg-accent text-muted-foreground"
        title="登出"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

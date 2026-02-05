"use client";

import { useEffect, useState } from "react";
import { Type } from "lucide-react";

const SIZES = [
  { label: "小", value: "13px" },
  { label: "中", value: "14px" },
  { label: "大", value: "15.5px" },
  { label: "特大", value: "17px" },
] as const;

const STORAGE_KEY = "chat-font-size";
const DEFAULT_INDEX = 1; // 中 (14px)

export function FontSizeToggle() {
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = SIZES.findIndex((s) => s.value === stored);
      if (found !== -1) setIndex(found);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const size = SIZES[index].value;
    document.documentElement.style.setProperty("--message-font-size", size);
    localStorage.setItem(STORAGE_KEY, size);
  }, [index, mounted]);

  if (!mounted) return <div className="h-8 w-8" />;

  const next = () => setIndex((i) => (i + 1) % SIZES.length);

  return (
    <button
      onClick={next}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full"
      title={`目前：${SIZES[index].label}，點擊切換字體大小`}
    >
      <Type className="h-4 w-4" />
      <span>字體：{SIZES[index].label}</span>
    </button>
  );
}

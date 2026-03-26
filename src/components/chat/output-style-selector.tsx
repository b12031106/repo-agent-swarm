"use client";

import { useState, useEffect } from "react";
import { Palette } from "lucide-react";
import type { OutputStyle } from "@/types";

// Module-level cache to avoid redundant fetches across component instances
let cachedStyles: OutputStyle[] | null = null;
let fetchPromise: Promise<OutputStyle[]> | null = null;

function fetchStyles(): Promise<OutputStyle[]> {
  if (cachedStyles) return Promise.resolve(cachedStyles);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/output-styles")
    .then((r) => r.json())
    .then((data: OutputStyle[]) => {
      cachedStyles = data;
      fetchPromise = null;
      return data;
    })
    .catch(() => {
      fetchPromise = null;
      return [];
    });
  return fetchPromise;
}

/** Invalidate the cache so the next render re-fetches */
export function invalidateOutputStylesCache() {
  cachedStyles = null;
  fetchPromise = null;
}

interface OutputStyleSelectorProps {
  value: string | null;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  locked?: boolean;
}

export function OutputStyleSelector({
  value,
  onChange,
  disabled,
  locked,
}: OutputStyleSelectorProps) {
  const [styles, setStyles] = useState<OutputStyle[]>(cachedStyles || []);

  useEffect(() => {
    fetchStyles().then(setStyles);
  }, []);

  const currentStyle = styles.find((s) => s.id === value);
  const displayName = currentStyle?.name || "預設";

  if (locked) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] text-muted-foreground/60"
        title={currentStyle?.description || "預設輸出風格"}
      >
        <Palette className="h-2.5 w-2.5" />
        {displayName}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1 text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors">
      <Palette className="h-2.5 w-2.5" />
      <select
        value={value || "preset-default"}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-transparent border-none text-[10px] text-muted-foreground/60 hover:text-muted-foreground cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {styles.length === 0 && (
          <option value="preset-default">預設</option>
        )}
        {styles.some((s) => !s.userId) && (
          <optgroup label="系統預設">
            {styles
              .filter((s) => !s.userId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        )}
        {styles.some((s) => !!s.userId) && (
          <optgroup label="自訂風格">
            {styles
              .filter((s) => !!s.userId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

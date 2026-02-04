"use client";

import { Bot, Zap, Sparkles } from "lucide-react";

const MODELS = [
  {
    id: "sonnet",
    label: "Sonnet",
    description: "平衡速度與品質",
    icon: Bot,
  },
  {
    id: "haiku",
    label: "Haiku",
    description: "快速回應",
    icon: Zap,
  },
  {
    id: "opus",
    label: "Opus",
    description: "最高品質",
    icon: Sparkles,
  },
] as const;

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const current = MODELS.find((m) => m.id === value) || MODELS[0];

  return (
    <div className="flex items-center gap-0.5">
      {MODELS.map((m) => {
        const Icon = m.icon;
        const isActive = m.id === current.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            title={`${m.label} - ${m.description}`}
            className={`
              flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors
              ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <Icon className="h-2.5 w-2.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

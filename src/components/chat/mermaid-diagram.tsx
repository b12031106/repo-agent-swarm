"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      if (!containerRef.current) return;

      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          themeVariables:
            resolvedTheme === "dark"
              ? {
                  primaryColor: "#3b82f6",
                  primaryTextColor: "#f8fafc",
                  primaryBorderColor: "#60a5fa",
                  lineColor: "#94a3b8",
                  secondaryColor: "#475569",
                  tertiaryColor: "#334155",
                  textColor: "#e2e8f0",
                  mainBkg: "#1e293b",
                  nodeBorder: "#60a5fa",
                }
              : {
                  primaryColor: "#dbeafe",
                  primaryTextColor: "#1e293b",
                  primaryBorderColor: "#3b82f6",
                  lineColor: "#64748b",
                  secondaryColor: "#f1f5f9",
                  tertiaryColor: "#e2e8f0",
                  textColor: "#1e293b",
                  mainBkg: "#eff6ff",
                  nodeBorder: "#3b82f6",
                },
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render failed");
        }
      }
    }

    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        <p className="font-medium">Mermaid 圖表渲染失敗</p>
        <pre className="mt-1 whitespace-pre-wrap">{chart}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-container" />;
}

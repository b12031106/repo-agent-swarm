"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2, Maximize2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { MermaidZoomModal } from "./mermaid-zoom-modal";

interface MermaidDiagramProps {
  chart: string;
  isStreaming?: boolean;
}

export function MermaidDiagram({ chart, isStreaming }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Skip rendering while streaming - chart content is likely incomplete
    if (isStreaming) return;

    let cancelled = false;
    const renderId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    async function renderChart() {
      if (!containerRef.current) return;

      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          suppressErrorRendering: true,
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

        const { svg } = await mermaid.render(renderId, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setSvgHtml(svg);
          setError(null);
        }
      } catch (err) {
        // Clean up any Mermaid temp elements that leaked into document.body
        cleanupMermaidTempElements(renderId);

        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render failed");
        }
      }
    }

    renderChart();
    return () => {
      cancelled = true;
      cleanupMermaidTempElements(renderId);
    };
  }, [chart, resolvedTheme, isStreaming]);

  // During streaming, show a loading placeholder
  if (isStreaming) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Mermaid 圖表載入中...</span>
      </div>
    );
  }

  // On error, show syntax-highlighted source code instead of a scary red box
  if (error) {
    return (
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border-b border-border/60">
          Mermaid 圖表渲染失敗 — 顯示原始碼
        </div>
        <SyntaxHighlighter
          language="text"
          style={oneDark}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.85em",
          }}
        >
          {chart}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <>
      <div
        className="mermaid-container group relative cursor-pointer"
        onClick={() => svgHtml && setModalOpen(true)}
      >
        <div ref={containerRef} />
        {/* Hover overlay with zoom icon */}
        <div className="mermaid-zoom-hint">
          <Maximize2 className="h-4 w-4" />
        </div>
      </div>
      {svgHtml && (
        <MermaidZoomModal
          svgHtml={svgHtml}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      )}
    </>
  );
}

/**
 * Clean up Mermaid temporary elements that may have been injected into document.body.
 * Mermaid v11 creates elements with ids like `d{renderId}` and `i{renderId}` during rendering.
 */
function cleanupMermaidTempElements(renderId: string) {
  if (typeof document === "undefined") return;

  const prefixes = ["d", "i"];
  for (const prefix of prefixes) {
    const el = document.getElementById(`${prefix}${renderId}`);
    if (el && el.parentNode === document.body) {
      el.remove();
    }
  }
}

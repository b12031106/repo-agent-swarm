"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { useTheme } from "next-themes";
import { usePanZoom } from "@/hooks/usePanZoom";

interface MermaidZoomModalProps {
  svgHtml: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MermaidZoomModal({
  svgHtml,
  open,
  onOpenChange,
}: MermaidZoomModalProps) {
  const {
    containerRef,
    style,
    scale,
    isPanning,
    zoomIn,
    zoomOut,
    fitContent,
    onPointerDown,
  } = usePanZoom();

  const contentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Measure content wrapper (SVG + padding) natural size and fit
  const measureAndFit = useCallback(
    (animate = false) => {
      const el = contentRef.current;
      if (!el) return;
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      if (w > 0 && h > 0) {
        fitContent(w, h, animate);
      }
    },
    [fitContent]
  );

  // Auto-center SVG when modal opens
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    // Wait for modal + content to render and have layout dimensions
    const timer = setTimeout(() => {
      measureAndFit(false);
      setReady(true);
    }, 60);

    return () => clearTimeout(timer);
  }, [open, measureAndFit, svgHtml]);

  // Prevent browser-level zoom when modal is open
  // Chrome: trackpad pinch → ctrlKey+wheel; Safari: gesture events
  useEffect(() => {
    if (!open) return;

    const preventWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener("wheel", preventWheel, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });

    return () => {
      document.removeEventListener("wheel", preventWheel);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
    };
  }, [open]);

  // Reset = re-fit to center (not back to top-left)
  const handleReset = useCallback(() => {
    measureAndFit(true);
  }, [measureAndFit]);

  // Keyboard shortcuts
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      switch (e.key) {
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          handleReset();
          break;
      }
    },
    [open, zoomIn, zoomOut, handleReset]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const pct = Math.round(scale * 100);

  // Merge pan-zoom transform + background color
  const contentStyle: React.CSSProperties = {
    ...style,
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    opacity: ready ? 1 : 0,
    transition: ready
      ? style.transition === "none"
        ? "opacity 0.15s ease"
        : `${style.transition}, opacity 0.15s ease`
      : "none",
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Dark overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Full-screen content */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Hidden a11y title */}
          <DialogPrimitive.Title className="sr-only">
            Mermaid 圖表檢視
          </DialogPrimitive.Title>

          {/* Toolbar */}
          <div className="flex items-center justify-end gap-1 px-4 py-2 shrink-0">
            <button
              onClick={zoomOut}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="縮小 (-)"
            >
              <ZoomOut className="h-5 w-5" />
            </button>

            <span className="min-w-[4rem] text-center text-sm font-mono text-white/80 select-none">
              {pct}%
            </span>

            <button
              onClick={zoomIn}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="放大 (+)"
            >
              <ZoomIn className="h-5 w-5" />
            </button>

            <button
              onClick={handleReset}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="重置 (0)"
            >
              <RotateCcw className="h-5 w-5" />
            </button>

            <div className="w-px h-5 bg-white/20 mx-1" />

            <DialogPrimitive.Close
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="關閉 (ESC)"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Canvas area — containerRef is the viewport for pan/zoom events */}
          <div
            ref={containerRef}
            className="flex-1 overflow-hidden mermaid-zoom-canvas"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onMouseDown={onPointerDown}
          >
            {/* Transformed content with background */}
            <div
              ref={contentRef}
              style={contentStyle}
              className="mermaid-zoom-content inline-block rounded-lg shadow-2xl"
            >
              <div
                className="p-4"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            </div>
          </div>

          {/* Bottom hint */}
          <div className="shrink-0 py-2 text-center text-xs text-white/40 select-none">
            滾輪縮放 · 拖曳平移 · ESC 關閉
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

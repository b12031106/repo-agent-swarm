"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface PanZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_SENSITIVITY = 0.001;
const PINCH_SENSITIVITY = 0.01;

export function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PanZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pinch tracking
  const lastPinchDistRef = useRef(0);
  // Safari gesture tracking
  const lastGestureScaleRef = useRef(1);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  // Zoom towards a point (cursor or pinch center)
  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, newScale: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;

      const { scale, translateX, translateY } = stateRef.current;
      const clamped = clampScale(newScale);
      const ratio = clamped / scale;

      setState({
        scale: clamped,
        translateX: cx - ratio * (cx - translateX),
        translateY: cy - ratio * (cy - translateY),
      });
    },
    []
  );

  // Fit content centered in the container
  const fitContent = useCallback(
    (contentWidth: number, contentHeight: number, animate = false) => {
      const container = containerRef.current;
      if (!container || contentWidth <= 0 || contentHeight <= 0) return;

      const rect = container.getBoundingClientRect();
      const padding = 16;
      const availW = rect.width - padding * 2;
      const availH = rect.height - padding * 2;
      if (availW <= 0 || availH <= 0) return;

      const scaleToFit = Math.min(availW / contentWidth, availH / contentHeight);
      const clamped = clampScale(scaleToFit);
      const scaledW = contentWidth * clamped;
      const scaledH = contentHeight * clamped;

      const newState: PanZoomState = {
        scale: clamped,
        translateX: (rect.width - scaledW) / 2,
        translateY: (rect.height - scaledH) / 2,
      };

      if (animate) {
        setIsTransitioning(true);
        setState(newState);
        setTimeout(() => setIsTransitioning(false), 300);
      } else {
        setState(newState);
      }
    },
    []
  );

  // Wheel zoom — Chrome/FF trackpad pinch sends ctrlKey=true wheel events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { scale } = stateRef.current;
      // Trackpad pinch in Chrome: ctrlKey=true with small deltaY
      const sensitivity = e.ctrlKey ? PINCH_SENSITIVITY : ZOOM_SENSITIVITY;
      const delta = -e.deltaY * sensitivity;
      const newScale = scale * (1 + delta);
      zoomAtPoint(e.clientX, e.clientY, newScale);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  // Safari gesture events (trackpad pinch on Safari/WebKit)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastGestureScaleRef.current = 1;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const { scale } = stateRef.current;
      const delta = ge.scale / lastGestureScaleRef.current;
      lastGestureScaleRef.current = ge.scale;
      zoomAtPoint(ge.clientX, ge.clientY, scale * delta);
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener("gesturestart", onGestureStart, { passive: false });
    container.addEventListener("gesturechange", onGestureChange, { passive: false });
    container.addEventListener("gestureend", onGestureEnd, { passive: false });

    return () => {
      container.removeEventListener("gesturestart", onGestureStart);
      container.removeEventListener("gesturechange", onGestureChange);
      container.removeEventListener("gestureend", onGestureEnd);
    };
  }, [zoomAtPoint]);

  // Mouse drag
  const onPointerDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isPanningRef.current = true;
    setIsPanning(true);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      setState((prev) => ({
        ...prev,
        translateX: prev.translateX + dx,
        translateY: prev.translateY + dy,
      }));
    };

    const onMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Touch: pan + pinch
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        isPanningRef.current = true;
        setIsPanning(true);
        lastPosRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      } else if (e.touches.length === 2) {
        isPanningRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDistRef.current = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isPanningRef.current) {
        const dx = e.touches[0].clientX - lastPosRef.current.x;
        const dy = e.touches[0].clientY - lastPosRef.current.y;
        lastPosRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setState((prev) => ({
          ...prev,
          translateX: prev.translateX + dx,
          translateY: prev.translateY + dy,
        }));
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastPinchDistRef.current > 0) {
          const ratio = dist / lastPinchDistRef.current;
          const midX =
            (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY =
            (e.touches[0].clientY + e.touches[1].clientY) / 2;
          zoomAtPoint(midX, midY, stateRef.current.scale * ratio);
        }
        lastPinchDistRef.current = dist;
      }
    };

    const onTouchEnd = () => {
      isPanningRef.current = false;
      setIsPanning(false);
      lastPinchDistRef.current = 0;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoomAtPoint]);

  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, stateRef.current.scale * 1.25);
  }, [zoomAtPoint]);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, stateRef.current.scale / 1.25);
  }, [zoomAtPoint]);

  const resetView = useCallback(() => {
    setIsTransitioning(true);
    setState({ scale: 1, translateX: 0, translateY: 0 });
    setTimeout(() => setIsTransitioning(false), 300);
  }, []);

  const style: React.CSSProperties = {
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    transformOrigin: "0 0",
    transition: isTransitioning ? "transform 0.3s ease" : "none",
  };

  return {
    containerRef,
    style,
    scale: state.scale,
    isPanning,
    zoomIn,
    zoomOut,
    resetView,
    fitContent,
    onPointerDown,
  };
}

import { useCallback, useRef } from "react";

interface DragResizeOptions {
  axis: "x" | "y";
  /** Positive drag direction that should *increase* the size - "start" (up/left) or "end" (down/right). */
  grows: "start" | "end";
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

/** Shared drag-to-resize logic for sidebar/AI-panel/bottom-panel splitters (SPEC section 28: panels must be resizable). */
export function useDragResize({ axis, grows, value, min, max, onChange }: DragResizeOptions): {
  onPointerDown: (e: React.PointerEvent) => void;
} {
  const drag = useRef<{ start: number; startValue: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { start: axis === "x" ? e.clientX : e.clientY, startValue: value };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      function onMove(ev: PointerEvent): void {
        if (!drag.current) return;
        const pos = axis === "x" ? ev.clientX : ev.clientY;
        const delta = grows === "end" ? pos - drag.current.start : drag.current.start - pos;
        onChange(Math.min(Math.max(drag.current.startValue + delta, min), max));
      }
      function onUp(): void {
        drag.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [axis, grows, value, min, max, onChange],
  );

  return { onPointerDown };
}

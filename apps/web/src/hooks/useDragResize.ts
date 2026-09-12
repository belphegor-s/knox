import { useCallback, useRef } from "react";

interface DragResizeOptions {
  axis: "x" | "y";
  // "start" = dragging up/left grows it; "end" = dragging down/right grows it
  grows: "start" | "end";
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Fires once, on release, with the same value onChange last received - for a caller (the
   * bottom panel's snap-to-collapsed) that needs to apply a threshold-based adjustment without
   * fighting the live drag. Applying that kind of snap inside onChange itself means every
   * intermediate frame below the threshold gets forced back to the same collapsed value, so a
   * short drag shows no visual feedback at all until the gesture crosses the threshold in one
   * continuous motion - indistinguishable from the handle simply not responding. */
  onCommit?: (final: number) => void;
}

export function useDragResize({ axis, grows, value, min, max, onChange, onCommit }: DragResizeOptions): {
  onPointerDown: (e: React.PointerEvent) => void;
} {
  const drag = useRef<{ start: number; startValue: number; last: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { start: axis === "x" ? e.clientX : e.clientY, startValue: value, last: value };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      function onMove(ev: PointerEvent): void {
        if (!drag.current) return;
        const pos = axis === "x" ? ev.clientX : ev.clientY;
        const delta = grows === "end" ? pos - drag.current.start : drag.current.start - pos;
        const next = Math.min(Math.max(drag.current.startValue + delta, min), max);
        drag.current.last = next;
        onChange(next);
      }
      function onUp(): void {
        onCommit?.(drag.current?.last ?? value);
        drag.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [axis, grows, value, min, max, onChange, onCommit],
  );

  return { onPointerDown };
}

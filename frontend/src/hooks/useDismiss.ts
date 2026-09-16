import { useEffect, type RefObject } from "react";

/**
 * Dismisses a transient overlay on a click outside `ref` or on Escape.
 * `onDismiss` must be stable — it is a listener dependency, so a fresh
 * function each render resubscribes on every render.
 *
 * `panelRef` is for an overlay rendered through a portal: it is inside the
 * React tree but outside `ref` in the DOM, and the listener here is a DOM one,
 * so without it a press on the panel would dismiss it before the click landed.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  onDismiss: () => void,
  panelRef?: RefObject<HTMLElement>,
): void {
  useEffect(() => {
    const inside = (target: Node) =>
      ref.current?.contains(target) === true ||
      panelRef?.current?.contains(target) === true;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !inside(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, panelRef, onDismiss]);
}

import { useEffect, type RefObject } from "react";

/**
 * Dismisses a transient overlay on a click outside `ref` or on Escape.
 * `onDismiss` must be stable — it is a listener dependency, so a fresh
 * function each render resubscribes on every render.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
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
  }, [ref, onDismiss]);
}

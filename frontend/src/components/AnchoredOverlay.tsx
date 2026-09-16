import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  positionBelow,
  type Align,
  type Position,
} from "../lib/overlayPosition";

interface AnchoredOverlayProps {
  /** What the overlay opens under. */
  anchorRef: RefObject<HTMLElement>;
  /** The panel itself, for the owner to hand to useDismiss as an inside. */
  panelRef: RefObject<HTMLDivElement>;
  align?: Align;
  /** Makes the panel at least as wide as its anchor, the way `inset-x-0` did. */
  matchAnchorWidth?: boolean;
  className?: string;
  children: ReactNode;
}

interface Placement extends Position {
  minWidth: number;
}

/**
 * An overlay anchored below `anchorRef` but rendered at the document root.
 *
 * A `.card` both clips its descendants (`--card-clip`, the Console theme) and
 * paints them inside its own stacking context (`--card-hover-lift`, Terminal),
 * so a menu left as a child of one is cut off. Escaping to the body is what
 * fixes it, and is why the position has to be measured rather than written as
 * `absolute top-full`.
 */
export function AnchoredOverlay({
  anchorRef,
  panelRef,
  align = "start",
  matchAnchorWidth = false,
  className,
  children,
}: AnchoredOverlayProps) {
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Not a layout effect: an anchor mounted in the same commit as its overlay
  // has its ref attached after the overlay's children, so measuring it has to
  // wait for the commit to finish. `visibility` is what hides the interim.
  useEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const minWidth = matchAnchorWidth ? rect.width : 0;
      setPlacement({
        // The width a min-width is about to give it, which is what has to be
        // kept inside the viewport — not the one it happens to have measured.
        ...positionBelow(
          rect,
          {
            width: Math.max(panel.offsetWidth, minWidth),
            height: panel.offsetHeight,
          },
          { width: window.innerWidth, height: window.innerHeight },
          align,
        ),
        minWidth,
      });
    };
    place();
    // The panel's own height changes under it — the emoji grid shrinks as the
    // search narrows — and a flipped panel is placed from its bottom edge.
    const resizing =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (panelRef.current) resizing?.observe(panelRef.current);
    window.addEventListener("resize", place);
    // Capture: a scroll inside an ancestor does not bubble to the window.
    window.addEventListener("scroll", place, true);
    return () => {
      resizing?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, panelRef, align, matchAnchorWidth]);

  return createPortal(
    <div
      ref={panelRef}
      className={`fixed z-50 ${className ?? ""}`}
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        minWidth: placement?.minWidth ?? 0,
        // Measured before it is placed, so the first paint must not show it.
        visibility: placement === null ? "hidden" : "visible",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
